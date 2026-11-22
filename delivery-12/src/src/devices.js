/**
 * Bare USB — Independent USB 2.0 Wire-Level Device Models (`src/devices.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Written independently from the USB 2.0 Specification (Chapters 7, 8, 9), HID 1.11,
 * and Mass Storage Bulk-Only Transport 1.0. Zero imports from netlist.js, simulator.js,
 * pin-harness.js, ref-sie.js, or driver.js.
 *
 * Strictly obeys Round 2 Rule 5:
 * - Devices see and produce ONLY timed `(timeNs, dp, dm)` D+/D- waveforms.
 * - Each device has its own wire receiver (edge-triggered clock recovery, NRZI decode,
 *   unstuffing, PID/CRC-5/CRC-16 check, EOP detection) and its own wire transmitter
 *   running on its own skewed clock (`±0.25%` FS, `±1.5%` LS per USB 2.0 §7.1.11).
 */

'use strict';

const crypto = require('crypto');

/**
 * Independent USB 2.0 Chapter 7 & 8 Wire PHY for a USB Device.
 * Receives raw `(timeNs, dp, dm)` transitions and emits timed `(timeNs, dp, dm)` waveforms.
 */
class UsbDeviceWirePhy {
  constructor(isLowSpeed, clockSkewPct, onPacketReceived) {
    this.isLowSpeed = isLowSpeed;
    this.clockSkewPct = clockSkewPct || 0;
    this.nominalBitNs = isLowSpeed ? (1000 / 1.5) : (1000 / 12.0);
    this.bitPeriodNs = this.nominalBitNs / (1 + this.clockSkewPct / 100);
    this.onPacketReceived = onPacketReceived;

    this.curDp = isLowSpeed ? 0 : 1;
    this.curDm = isLowSpeed ? 1 : 0;
    this.lastEventNs = 0;

    // Receiver packet buffer of timed transitions
    this.inPacket = false;
    this.rxSegments = []; // { startNs, dp, dm }
    this.se0StartNs = null;
  }

  _isJ(dp, dm) {
    return this.isLowSpeed ? (dp === 0 && dm === 1) : (dp === 1 && dm === 0);
  }

  _isK(dp, dm) {
    return this.isLowSpeed ? (dp === 1 && dm === 0) : (dp === 0 && dm === 1);
  }

  _isSE0(dp, dm) {
    return dp === 0 && dm === 0;
  }

  onBusLevel(timeNs, dp, dm) {
    // Detect Bus Reset: SE0 lasting >= 2000 ns (simulated reset pulse)
    if (this._isSE0(dp, dm)) {
      if (this.se0StartNs === null) this.se0StartNs = timeNs;
    } else {
      if (this.se0StartNs !== null && (timeNs - this.se0StartNs) >= 1800) {
        this.inPacket = false;
        this.rxSegments = [];
        this.se0StartNs = null;
        this.curDp = dp;
        this.curDm = dm;
        this.onPacketReceived({ type: 'BUS_RESET', timeNs });
        return null;
      }
      this.se0StartNs = null;
    }

    // Detect start of packet (transition from idle J to K)
    if (!this.inPacket) {
      if (this._isK(dp, dm)) {
        this.inPacket = true;
        this.rxSegments = [{ startNs: timeNs, dp, dm }];
      } else if (this._isSE0(dp, dm) && this.isLowSpeed) {
        // Low-Speed Keep-Alive is a 2-bit SE0 strobe without SYNC
        this.inPacket = true;
        this.rxSegments = [{ startNs: timeNs, dp, dm }];
      }
      this.curDp = dp;
      this.curDm = dm;
      return null;
    }

    // Inside packet: record segment
    this.rxSegments.push({ startNs: timeNs, dp, dm });

    // Detect EOP completion: SE0 followed by J
    const n = this.rxSegments.length;
    if (n >= 2) {
      const prev = this.rxSegments[n - 2];
      if (this._isSE0(prev.dp, prev.dm) && this._isJ(dp, dm) && (timeNs - prev.startNs) >= 1.0 * this.bitPeriodNs) {
        const se0Dur = timeNs - prev.startNs;
        this.inPacket = false;
        const segments = this.rxSegments;
        this.rxSegments = [];
        this.curDp = dp;
        this.curDm = dm;

        // Check for Low-Speed 2-bit SE0 keep-alive
        if (this.isLowSpeed && segments.length === 2 && se0Dur >= 1.5 * this.bitPeriodNs) {
          return this.onPacketReceived({ type: 'LS_KEEPALIVE', timeNs });
        }

        const decoded = this._decodeSegments(segments);
        if (decoded) {
          decoded.endTimeNs = timeNs;
          return this.onPacketReceived(decoded);
        }
        return null;
      }
    }

    this.curDp = dp;
    this.curDm = dm;
    return null;
  }

  _decodeSegments(segments) {
    // Sample segments at device's skewed bitPeriodNs, resynchronizing phase on each edge
    const nrziLevels = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const nextNs = segments[i + 1].startNs;
      const dur = nextNs - seg.startNs;
      if (dur < 0.25 * this.bitPeriodNs) continue;
      if (this._isSE0(seg.dp, seg.dm)) break; // EOP reached
      const bitCount = Math.max(1, Math.round(dur / this.bitPeriodNs));
      const level = this._isJ(seg.dp, seg.dm) ? 1 : 0;
      for (let b = 0; b < bitCount; b++) nrziLevels.push(level);
    }

    // NRZI decode & bit-unstuff (idle J = 1)
    let prev = 1;
    let ones = 0;
    let expectStuff = false;
    const bits = [];
    for (let i = 0; i < nrziLevels.length; i++) {
      const cur = nrziLevels[i];
      const bit = (cur === prev) ? 1 : 0;
      prev = cur;

      if (expectStuff) {
        if (bit !== 0) return { type: 'STUFF_ERR' };
        ones = 0;
        expectStuff = false;
        continue;
      }
      bits.push(bit);
      if (bit === 1) {
        ones++;
        if (ones === 6) expectStuff = true;
      } else {
        ones = 0;
      }
    }

    const nBytes = Math.floor(bits.length / 8);
    const bytes = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (bits[i * 8 + k] << k);
      bytes[i] = b;
    }

    if (bytes.length < 2 || bytes[0] !== 0x80) return { type: 'SYNC_ERR' };
    const pidByte = bytes[1];
    if (((pidByte & 0x0F) ^ ((pidByte >> 4) & 0x0F)) !== 0x0F) return { type: 'PID_ERR' };
    const pid = pidByte & 0x0F;

    if (pid === 0x1 || pid === 0x9 || pid === 0x5 || pid === 0xD) {
      // Token packet (OUT, IN, SOF, SETUP): 2 bytes (SYNC+PID) + 2 bytes (11-bit + CRC5)
      if (bytes.length !== 4) return { type: 'LEN_ERR' };
      const word16 = bytes[2] | (bytes[3] << 8);
      // Verify CRC-5 (USB 2.0 §8.3.5.1)
      let crc5 = 0x1F;
      for (let i = 0; i < 11; i++) {
        const bit = (word16 >> i) & 1;
        const fb = bit ^ ((crc5 >> 4) & 1);
        crc5 = ((crc5 << 1) & 0x1F) ^ (fb ? 0x05 : 0);
      }
      const expectedCrc5 = (~crc5) & 0x1F;
      let rxCrc5 = 0;
      for (let i = 0; i < 5; i++) rxCrc5 |= (((word16 >> (11 + i)) & 1) << (4 - i));
      if (expectedCrc5 !== rxCrc5) return { type: 'CRC5_ERR', pid };

      return {
        type: 'TOKEN',
        pid,
        addr: word16 & 0x7F,
        endp: (word16 >> 7) & 0x0F,
        frameNum: word16 & 0x7FF
      };
    }

    if (pid === 0x3 || pid === 0xB) {
      // DATA0 or DATA1
      if (bytes.length < 4) return { type: 'LEN_ERR', pid };
      const dataLen = bytes.length - 4;
      const payload = bytes.slice(2, 2 + dataLen);
      let crc16 = 0xFFFF;
      for (let i = 0; i < payload.length; i++) {
        for (let k = 0; k < 8; k++) {
          const bit = (payload[i] >> k) & 1;
          const fb = bit ^ ((crc16 >> 15) & 1);
          crc16 = ((crc16 << 1) & 0xFFFF) ^ (fb ? 0x8005 : 0);
        }
      }
      const expectedCrc16 = (~crc16) & 0xFFFF;
      let rxCrc16 = 0;
      for (let k = 0; k < 8; k++) rxCrc16 |= (((bytes[2 + dataLen] >> k) & 1) << (15 - k));
      for (let k = 0; k < 8; k++) rxCrc16 |= (((bytes[3 + dataLen] >> k) & 1) << (7 - k));
      if (expectedCrc16 !== rxCrc16) return { type: 'CRC16_ERR', pid };

      return { type: 'DATA', pid, payload };
    }

    if (pid === 0x2 || pid === 0xA || pid === 0xE) {
      return { type: 'HANDSHAKE', pid };
    }

    return { type: 'UNKNOWN_PID', pid };
  }

  /**
   * Encodes a device response packet into timed `(timeNs, dp, dm)` wire transitions
   * using the device's own skewed `bitPeriodNs`.
   */
  encodePacketToWire(startTimeNs, pid, payloadBytes = []) {
    const rawBits = [0, 0, 0, 0, 0, 0, 0, 1]; // SYNC 0x80 LSB-first
    const pidByte = (pid & 0x0F) | (((~pid) & 0x0F) << 4);
    for (let k = 0; k < 8; k++) rawBits.push((pidByte >> k) & 1);

    if (pid === 0x3 || pid === 0xB) {
      let crc = 0xFFFF;
      for (let i = 0; i < payloadBytes.length; i++) {
        const b = payloadBytes[i] & 0xFF;
        for (let k = 0; k < 8; k++) {
          const bit = (b >> k) & 1;
          rawBits.push(bit);
          const xorIn = bit ^ ((crc >> 15) & 1);
          crc = ((crc << 1) & 0xFFFF) ^ (xorIn ? 0x8005 : 0);
        }
      }
      const compCrc = (~crc) & 0xFFFF;
      for (let k = 15; k >= 0; k--) rawBits.push((compCrc >> k) & 1);
    }

    // Bit stuffing & NRZI encoding
    const nrziLevels = [];
    let ones = 0;
    let level = 1; // Idle J = 1
    for (let i = 0; i < rawBits.length; i++) {
      const bit = rawBits[i];
      if (bit === 0) {
        level ^= 1;
        ones = 0;
      } else {
        ones++;
      }
      nrziLevels.push(level);
      if (ones === 6) {
        level ^= 1;
        nrziLevels.push(level);
        ones = 0;
      }
    }

    // Convert NRZI levels + 2-bit SE0 + 1-bit J EOP into timed (timeNs, dp, dm) transitions
    const turnaroundNs = 4 * this.bitPeriodNs;
    let t = startTimeNs + turnaroundNs;
    const transitions = [];

    for (let i = 0; i < nrziLevels.length; i++) {
      const isJ = nrziLevels[i] === 1;
      const dp = this.isLowSpeed ? (isJ ? 0 : 1) : (isJ ? 1 : 0);
      const dm = dp ^ 1;
      transitions.push({ timeNs: t, dp, dm });
      t += this.bitPeriodNs;
    }

    // EOP: 2 bit times of SE0, then 1 bit time of Idle J
    transitions.push({ timeNs: t, dp: 0, dm: 0 });
    t += 2 * this.bitPeriodNs;
    const jDp = this.isLowSpeed ? 0 : 1;
    const jDm = this.isLowSpeed ? 1 : 0;
    transitions.push({ timeNs: t, dp: jDp, dm: jDm });

    return transitions;
  }
}

function generateScriptedKeystrokes(count = 100, seed = 42) {
  let state = seed >>> 0;
  const reports = [];
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const keycode = 0x04 + (state % 26);
    const modifier = ((state >>> 8) & 1) ? 0x02 : 0x00;
    reports.push(new Uint8Array([modifier, 0x00, keycode, 0x00, 0x00, 0x00, 0x00, 0x00]));
  }
  return reports;
}

class LowSpeedHidKeyboardDevice {
  constructor(options = {}) {
    this.isLowSpeed = true;
    this.clockSkewPct = options.clockSkewPct || 0;
    this.seed = options.seed !== undefined ? options.seed : 42;
    this.scriptedReports = generateScriptedKeystrokes(100, this.seed);
    this.phy = new UsbDeviceWirePhy(true, this.clockSkewPct, pkt => this._onWirePacket(pkt));
    this.onBusReset(0);
  }

  onBusReset(timeNs = 0) {
    this.address = 0;
    this.pendingAddress = null;
    this.configured = false;
    this.bootProtocol = 1;
    this.idleRate = 0;
    this.suspended = false;
    this.lastBusActivityNs = timeNs;
    this.pendingToken = null;

    this.ep0Stage = 'IDLE';
    this.ep0InQueue = [];
    this.ep0Toggle = 1;
    this.ep1Toggle = 0;
    this.reportIndex = 0;
    this.awaitingAckEndp = null;
    this.dataSentTimeNs = 0;
  }

  onBusLevel(timeNs, dp, dm) {
    return this.phy.onBusLevel(timeNs, dp, dm);
  }

  stepUntil(timeNs) {
    if (timeNs - this.lastBusActivityNs > 3000000) {
      this.suspended = true;
    }
  }

  _getDeviceDescriptor() {
    return new Uint8Array([
      18, 0x01, 0x10, 0x01, 0x00, 0x00, 0x00, 8,
      0x5A, 0x43, 0x01, 0x00, 0x00, 0x01, 1, 2, 0, 1
    ]);
  }

  _getConfigDescriptorBlock() {
    return new Uint8Array([
      9, 0x02, 34, 0x00, 1, 1, 0, 0xA0, 50,
      9, 0x04, 0, 0, 1, 0x03, 0x01, 0x01, 0,
      9, 0x21, 0x11, 0x01, 0x00, 1, 0x22, 63, 0x00,
      7, 0x05, 0x81, 0x03, 8, 0x00, 10
    ]);
  }

  _onWirePacket(pkt) {
    if (pkt.type === 'BUS_RESET') {
      this.onBusReset(pkt.timeNs);
      return null;
    }
    if (pkt.type === 'LS_KEEPALIVE') {
      this.lastBusActivityNs = pkt.timeNs;
      this.suspended = false;
      return null;
    }
    if (this.suspended) return null;

    if (pkt.type === 'TOKEN') {
      this.lastBusActivityNs = pkt.endTimeNs;
      if (pkt.pid === 0x5) {
        // SOF
        this.suspended = false;
        return null;
      }
      if (pkt.addr !== this.address) {
        this.pendingToken = null;
        return null;
      }
      if (pkt.pid === 0x9) {
        // IN token -> transmit DATA0/DATA1 or NAK on wire
        return this._handleIn(pkt.endp, pkt.endTimeNs);
      }
      this.pendingToken = pkt;
      return null;
    }

    if (pkt.type === 'DATA' && this.pendingToken) {
      const tok = this.pendingToken;
      this.pendingToken = null;
      return this._handleOutOrSetup(tok, pkt.payload, pkt.endTimeNs);
    }

    if (pkt.type === 'HANDSHAKE' && pkt.pid === 0x2 && this.awaitingAckEndp !== null) {
      // Check USB 2.0 turnaround window (must arrive within 7.5 bit times of EOP)
      const turnDelayBits = (pkt.endTimeNs - this.dataSentTimeNs) / this.phy.bitPeriodNs;
      // Total packet is ~21 bits (8 SYNC + 8 PID + 2 SE0 + 1 J + turnaround); turnaround is <= 4.5 bits
      if (turnDelayBits <= 25.5) {
        this._onAck(this.awaitingAckEndp, pkt.endTimeNs);
      }
      this.awaitingAckEndp = null;
      return null;
    }

    return null;
  }

  _handleOutOrSetup(tok, p, timeNs) {
    if (tok.pid === 0xD && tok.endp === 0) {
      if (!p || p.length < 8) return this.phy.encodePacketToWire(timeNs, 0xE);
      const bmRequestType = p[0];
      const bRequest = p[1];
      const wValue = p[2] | (p[3] << 8);
      const wLength = p[6] | (p[7] << 8);

      this.ep0InQueue = [];
      this.ep0Toggle = 1;

      if (bmRequestType === 0x00 && bRequest === 0x05) {
        this.pendingAddress = wValue & 0x7F;
        this.ep0Stage = 'STATUS_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0x80 && bRequest === 0x06) {
        const descType = (wValue >> 8) & 0xFF;
        let data = new Uint8Array(0);
        if (descType === 0x01) data = this._getDeviceDescriptor();
        else if (descType === 0x02) data = this._getConfigDescriptorBlock();
        const slice = data.slice(0, Math.min(data.length, wLength));
        for (let off = 0; off < slice.length; off += 8) {
          this.ep0InQueue.push(slice.slice(off, Math.min(off + 8, slice.length)));
        }
        if (this.ep0InQueue.length === 0) this.ep0InQueue.push(new Uint8Array(0));
        this.ep0Stage = 'DATA_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0x00 && bRequest === 0x09) {
        this.configured = (wValue & 0xFF) !== 0;
        this.ep0Stage = 'STATUS_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0x21 && (bRequest === 0x0A || bRequest === 0x0B)) {
        if (bRequest === 0x0B) this.bootProtocol = wValue & 0xFF;
        if (bRequest === 0x0A) this.idleRate = (wValue >> 8) & 0xFF;
        this.ep0Stage = 'STATUS_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      this.ep0Stage = 'STATUS_IN';
      return this.phy.encodePacketToWire(timeNs, 0x2);
    }

    if (tok.pid === 0x1 && tok.endp === 0) {
      this.ep0Stage = 'IDLE';
      return this.phy.encodePacketToWire(timeNs, 0x2);
    }

    return this.phy.encodePacketToWire(timeNs, 0xE);
  }

  _handleIn(endp, timeNs) {
    if (endp === 0) {
      if (this.ep0Stage === 'DATA_IN' && this.ep0InQueue.length > 0) {
        const chunk = this.ep0InQueue[0];
        const pid = this.ep0Toggle ? 0xB : 0x3;
        const wf = this.phy.encodePacketToWire(timeNs, pid, chunk);
        this.awaitingAckEndp = 0;
        this.dataSentTimeNs = wf[wf.length - 1].timeNs;
        return wf;
      }
      if (this.ep0Stage === 'STATUS_IN') {
        const wf = this.phy.encodePacketToWire(timeNs, 0xB, new Uint8Array(0));
        this.awaitingAckEndp = 0;
        this.dataSentTimeNs = wf[wf.length - 1].timeNs;
        return wf;
      }
      return this.phy.encodePacketToWire(timeNs, 0xA);
    }

    if (endp === 1) {
      if (!this.configured || this.reportIndex >= this.scriptedReports.length) {
        return this.phy.encodePacketToWire(timeNs, 0xA);
      }
      const report = this.scriptedReports[this.reportIndex];
      const pid = this.ep1Toggle ? 0xB : 0x3;
      const wf = this.phy.encodePacketToWire(timeNs, pid, report);
      this.awaitingAckEndp = 1;
      this.dataSentTimeNs = wf[wf.length - 1].timeNs;
      return wf;
    }

    return this.phy.encodePacketToWire(timeNs, 0xE);
  }

  _onAck(endp, timeNs) {
    this.lastBusActivityNs = timeNs;
    if (endp === 0) {
      if (this.ep0Stage === 'DATA_IN') {
        this.ep0InQueue.shift();
        this.ep0Toggle ^= 1;
        if (this.ep0InQueue.length === 0) this.ep0Stage = 'STATUS_OUT';
      } else if (this.ep0Stage === 'STATUS_IN') {
        if (this.pendingAddress !== null) {
          this.address = this.pendingAddress;
          this.pendingAddress = null;
        }
        this.ep0Stage = 'IDLE';
      }
    } else if (endp === 1) {
      this.reportIndex++;
      this.ep1Toggle ^= 1;
    }
  }
}

function buildFat16TestImage(seed = 20261118) {
  const totalSectors = 256;
  const bytesPerSector = 512;
  const disk = new Uint8Array(totalSectors * bytesPerSector);
  const view = new DataView(disk.buffer);

  disk[0] = 0xEB; disk[1] = 0x3C; disk[2] = 0x90;
  const oem = 'BAREUSB1';
  for (let i = 0; i < 8; i++) disk[3 + i] = oem.charCodeAt(i);
  view.setUint16(11, 512, true);
  disk[13] = 1;
  view.setUint16(14, 1, true);
  disk[16] = 1;
  view.setUint16(17, 256, true);
  view.setUint16(19, totalSectors, true);
  disk[21] = 0xF8;
  view.setUint16(22, 15, true);
  disk[510] = 0x55; disk[511] = 0xAA;

  const fatOffset = 512;
  view.setUint16(fatOffset + 0, 0xFFF8, true);
  view.setUint16(fatOffset + 2, 0xFFFF, true);
  for (let clus = 2; clus < 2 + 128; clus++) {
    view.setUint16(fatOffset + clus * 2, (clus === 129) ? 0xFFFF : (clus + 1), true);
  }

  const rootOffset = 16 * 512;
  const name83 = 'TEST64K BIN';
  for (let i = 0; i < 11; i++) disk[rootOffset + i] = name83.charCodeAt(i);
  disk[rootOffset + 11] = 0x20;
  view.setUint16(rootOffset + 26, 2, true);
  view.setUint32(rootOffset + 28, 65536, true);

  const fileOffset = 32 * 512;
  const fileBytes = new Uint8Array(65536);
  let st = seed >>> 0;
  for (let i = 0; i < 65536; i++) {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    fileBytes[i] = ((st >>> 16) ^ (i & 0xFF)) & 0xFF;
    disk[fileOffset + i] = fileBytes[i];
  }

  const expectedSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
  return {
    disk,
    fileBytes,
    expectedSha256,
    fileStartLba: 32,
    fileSectorCount: 128,
    fileSizeBytes: 65536
  };
}

class FullSpeedMassStorageDevice {
  constructor(options = {}) {
    this.isLowSpeed = false;
    this.clockSkewPct = options.clockSkewPct || 0;
    this.seed = options.seed !== undefined ? options.seed : 20261118;
    this.image = buildFat16TestImage(this.seed);
    this.phy = new UsbDeviceWirePhy(false, this.clockSkewPct, pkt => this._onWirePacket(pkt));
    this.onBusReset(0);
  }

  onBusReset(timeNs = 0) {
    this.address = 0;
    this.pendingAddress = null;
    this.configured = false;
    this.suspended = false;
    this.lastBusActivityNs = timeNs;
    this.pendingToken = null;

    this.ep0Stage = 'IDLE';
    this.ep0InQueue = [];
    this.ep0Toggle = 1;
    this.ep1OutToggle = 0;
    this.ep2InToggle = 0;
    this.botQueue = [];
    this.awaitingAckEndp = null;
    this.dataSentTimeNs = 0;
  }

  onBusLevel(timeNs, dp, dm) {
    return this.phy.onBusLevel(timeNs, dp, dm);
  }

  stepUntil(timeNs) {
    if (timeNs - this.lastBusActivityNs > 3000000) {
      this.suspended = true;
    }
  }

  _getDeviceDescriptor() {
    return new Uint8Array([
      18, 0x01, 0x10, 0x01, 0x00, 0x00, 0x00, 64,
      0x5A, 0x43, 0x02, 0x00, 0x00, 0x01, 1, 2, 3, 1
    ]);
  }

  _getConfigDescriptorBlock() {
    return new Uint8Array([
      9, 0x02, 32, 0x00, 1, 1, 0, 0x80, 100,
      9, 0x04, 0, 0, 2, 0x08, 0x06, 0x50, 0,
      7, 0x05, 0x01, 0x02, 64, 0x00, 0,
      7, 0x05, 0x82, 0x02, 64, 0x00, 0
    ]);
  }

  _processCbw(payload) {
    if (!payload || payload.length < 31) return false;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    if (view.getUint32(0, true) !== 0x43425355) return false;
    const tag = view.getUint32(4, true);
    const xferLen = view.getUint32(8, true);
    const opcode = payload[15];

    let dataOut = new Uint8Array(0);
    if (opcode === 0x12) {
      dataOut = new Uint8Array(36);
      dataOut[0] = 0x00; dataOut[1] = 0x80; dataOut[2] = 0x02; dataOut[3] = 0x02; dataOut[4] = 31;
      const vendor = 'CNODE   BAREUSB DISK    1.00';
      for (let i = 0; i < vendor.length; i++) dataOut[8 + i] = vendor.charCodeAt(i);
      dataOut = dataOut.slice(0, Math.min(36, xferLen));
    } else if (opcode === 0x25) {
      dataOut = new Uint8Array(8);
      const dv = new DataView(dataOut.buffer);
      dv.setUint32(0, 255, false);
      dv.setUint32(4, 512, false);
    } else if (opcode === 0x28) {
      const lba = (payload[17] << 24) | (payload[18] << 16) | (payload[19] << 8) | payload[20];
      const sectors = (payload[22] << 8) | payload[23];
      dataOut = this.image.disk.slice(lba * 512, (lba + sectors) * 512);
    }

    for (let off = 0; off < dataOut.length; off += 64) {
      this.botQueue.push(dataOut.slice(off, Math.min(off + 64, dataOut.length)));
    }
    const csw = new Uint8Array(13);
    const cswView = new DataView(csw.buffer);
    cswView.setUint32(0, 0x53425355, true);
    cswView.setUint32(4, tag, true);
    cswView.setUint32(8, 0, true);
    csw[12] = 0x00;
    this.botQueue.push(csw);
    return true;
  }

  _onWirePacket(pkt) {
    if (pkt.type === 'BUS_RESET') {
      this.onBusReset(pkt.timeNs);
      return null;
    }
    if (this.suspended) return null;

    if (pkt.type === 'TOKEN') {
      this.lastBusActivityNs = pkt.endTimeNs;
      if (pkt.pid === 0x5) {
        this.suspended = false;
        return null;
      }
      if (pkt.addr !== this.address) {
        this.pendingToken = null;
        return null;
      }
      if (pkt.pid === 0x9) {
        return this._handleIn(pkt.endp, pkt.endTimeNs);
      }
      this.pendingToken = pkt;
      return null;
    }

    if (pkt.type === 'DATA' && this.pendingToken) {
      const tok = this.pendingToken;
      this.pendingToken = null;
      return this._handleOutOrSetup(tok, pkt.pid, pkt.payload, pkt.endTimeNs);
    }

    if (pkt.type === 'HANDSHAKE' && pkt.pid === 0x2 && this.awaitingAckEndp !== null) {
      const turnDelayBits = (pkt.endTimeNs - this.dataSentTimeNs) / this.phy.bitPeriodNs;
      if (turnDelayBits <= 25.5) {
        this._onAck(this.awaitingAckEndp, pkt.endTimeNs);
      }
      this.awaitingAckEndp = null;
      return null;
    }

    return null;
  }

  _handleOutOrSetup(tok, dataPid, p, timeNs) {
    if (tok.pid === 0xD && tok.endp === 0) {
      if (!p || p.length < 8) return this.phy.encodePacketToWire(timeNs, 0xE);
      const bmRequestType = p[0];
      const bRequest = p[1];
      const wValue = p[2] | (p[3] << 8);
      const wLength = p[6] | (p[7] << 8);

      this.ep0InQueue = [];
      this.ep0Toggle = 1;

      if (bmRequestType === 0x00 && bRequest === 0x05) {
        this.pendingAddress = wValue & 0x7F;
        this.ep0Stage = 'STATUS_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0x80 && bRequest === 0x06) {
        const descType = (wValue >> 8) & 0xFF;
        let data = new Uint8Array(0);
        if (descType === 0x01) data = this._getDeviceDescriptor();
        else if (descType === 0x02) data = this._getConfigDescriptorBlock();
        const slice = data.slice(0, Math.min(data.length, wLength));
        for (let off = 0; off < slice.length; off += 64) {
          this.ep0InQueue.push(slice.slice(off, Math.min(off + 64, slice.length)));
        }
        if (this.ep0InQueue.length === 0) this.ep0InQueue.push(new Uint8Array(0));
        this.ep0Stage = 'DATA_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0x00 && bRequest === 0x09) {
        this.configured = (wValue & 0xFF) !== 0;
        this.ep0Stage = 'STATUS_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      if (bmRequestType === 0xA1 && bRequest === 0xFE) {
        this.ep0InQueue.push(new Uint8Array([0x00]));
        this.ep0Stage = 'DATA_IN';
        return this.phy.encodePacketToWire(timeNs, 0x2);
      }
      this.ep0Stage = 'STATUS_IN';
      return this.phy.encodePacketToWire(timeNs, 0x2);
    }

    if (tok.pid === 0x1 && tok.endp === 0) {
      this.ep0Stage = 'IDLE';
      return this.phy.encodePacketToWire(timeNs, 0x2);
    }

    if (tok.pid === 0x1 && tok.endp === 1) {
      const expectedPid = this.ep1OutToggle ? 0xB : 0x3;
      if (dataPid === expectedPid) {
        this.ep1OutToggle ^= 1;
        this._processCbw(p);
      }
      return this.phy.encodePacketToWire(timeNs, 0x2);
    }

    return this.phy.encodePacketToWire(timeNs, 0xE);
  }

  _handleIn(endp, timeNs) {
    if (endp === 0) {
      if (this.ep0Stage === 'DATA_IN' && this.ep0InQueue.length > 0) {
        const chunk = this.ep0InQueue[0];
        const pid = this.ep0Toggle ? 0xB : 0x3;
        const wf = this.phy.encodePacketToWire(timeNs, pid, chunk);
        this.awaitingAckEndp = 0;
        this.dataSentTimeNs = wf[wf.length - 1].timeNs;
        return wf;
      }
      if (this.ep0Stage === 'STATUS_IN') {
        const wf = this.phy.encodePacketToWire(timeNs, 0xB, new Uint8Array(0));
        this.awaitingAckEndp = 0;
        this.dataSentTimeNs = wf[wf.length - 1].timeNs;
        return wf;
      }
      return this.phy.encodePacketToWire(timeNs, 0xA);
    }

    if (endp === 2) {
      if (this.botQueue.length === 0) {
        return this.phy.encodePacketToWire(timeNs, 0xA);
      }
      const chunk = this.botQueue[0];
      const pid = this.ep2InToggle ? 0xB : 0x3;
      const wf = this.phy.encodePacketToWire(timeNs, pid, chunk);
      this.awaitingAckEndp = 2;
      this.dataSentTimeNs = wf[wf.length - 1].timeNs;
      return wf;
    }

    return this.phy.encodePacketToWire(timeNs, 0xE);
  }

  _onAck(endp, timeNs) {
    this.lastBusActivityNs = timeNs;
    if (endp === 0) {
      if (this.ep0Stage === 'DATA_IN') {
        this.ep0InQueue.shift();
        this.ep0Toggle ^= 1;
        if (this.ep0InQueue.length === 0) this.ep0Stage = 'STATUS_OUT';
      } else if (this.ep0Stage === 'STATUS_IN') {
        if (this.pendingAddress !== null) {
          this.address = this.pendingAddress;
          this.pendingAddress = null;
        }
        this.ep0Stage = 'IDLE';
      }
    } else if (endp === 2) {
      this.botQueue.shift();
      this.ep2InToggle ^= 1;
    }
  }
}

module.exports = {
  UsbDeviceWirePhy,
  generateScriptedKeystrokes,
  LowSpeedHidKeyboardDevice,
  buildFat16TestImage,
  FullSpeedMassStorageDevice
};
