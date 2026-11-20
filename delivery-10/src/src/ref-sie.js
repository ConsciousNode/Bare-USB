/**
 * Bare USB — Behavioral Reference USB 1.1 Host SIE (`src/ref-sie.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Used strictly for Test 3 (Differential testing): exposes the exact same 16-bit
 * I/O port register interface (Ports 0x00..0x06) and produces/consumes the exact
 * same timed `(timeNs, dp, dm)` D+/D- wire transitions on `UsbLineModel`.
 */

'use strict';

const USB_PIDS = {
  OUT:   0x1,
  IN:    0x9,
  SOF:   0x5,
  SETUP: 0xD,
  DATA0: 0x3,
  DATA1: 0xB,
  ACK:   0x2,
  NAK:   0xA,
  STALL: 0xE
};

const SIE_REGS = {
  CSR:     0x00,
  TARGET:  0x01,
  LEN:     0x02,
  DATA16:  0x03,
  FRAME:   0x04,
  BUF_PTR: 0x05,
  DIAG:    0x06
};

const CSR_STATUS = {
  BUSY:           1 << 0,
  DONE:           1 << 1,
  ERR_TIMEOUT:    1 << 2,
  ERR_CRC:        1 << 3,
  ERR_STUFF:      1 << 4,
  ATTACHED:       1 << 5,
  LOW_SPEED:      1 << 6,
  SOF_SENT:       1 << 7,
  LAST_PID_SHIFT: 8,
  TOGGLE_OK:      1 << 12,
  IRQ_PENDING:    1 << 13,
  RESET_BUSY:     1 << 14,
  SPEED_MODE:     1 << 15
};

const CSR_CMD = {
  TOKEN_PID_MASK: 0x000F,
  DATA_TOGGLE:    1 << 4,
  AUTO_ACK:       1 << 5,
  AUTO_SOF_EN:    1 << 6,
  SPEED_SEL:      1 << 7,
  START_XFER:     1 << 8,
  BUS_RESET:      1 << 9,
  CLR_IRQ:        1 << 10,
  BUF_RST:        1 << 11,
  IRQ_EN:         1 << 12
};

class ReferenceSIE {
  constructor(lineBus, options = {}) {
    this.lineBus = lineBus;
    this.hostClockSkewPct = options.hostClockSkewPct || 0;

    this.sramLo = new Uint8Array(4096);
    this.sramHi = new Uint8Array(4096);

    this.csrCmd = CSR_CMD.AUTO_SOF_EN | CSR_CMD.AUTO_ACK;
    this.statusFlags = 0;
    this.devAddr = 0;
    this.endp = 0;
    this.txLen = 0;
    this.rxLen = 0;
    this.bufPtr = 0;
    this.frameNum = 0;
    this.crcErrCount = 0;
    this.stuffTimeoutErrCount = 0;
    this.lastRxPid = 0;

    this.simTimeNs = 0;
    this.lastSofTimeNs = 0;
    this.sofIntervalNs = 1000000 / (1 + this.hostClockSkewPct / 100);
    this.regTrace = [];

    // Wire-level receiver state for D+/D- transitions from device
    this.rxSegments = [];
    this.inRxPacket = false;
  }

  getBitPeriodNs(isLowSpeed) {
    const nominal = isLowSpeed ? (1000 / 1.5) : (1000 / 12.0);
    return nominal / (1 + this.hostClockSkewPct / 100);
  }

  getIrq() {
    return (this.csrCmd & CSR_CMD.IRQ_EN) && (this.statusFlags & CSR_STATUS.IRQ_PENDING) ? 1 : 0;
  }

  static computeCrc5(addr7, endp4) {
    let reg = 0x1F;
    const val11 = (addr7 & 0x7F) | ((endp4 & 0x0F) << 7);
    for (let i = 0; i < 11; i++) {
      const bit = (val11 >> i) & 1;
      const fb = bit ^ ((reg >> 4) & 1);
      reg = ((reg << 1) & 0x1F) ^ (fb ? 0x05 : 0x00);
    }
    return (~reg) & 0x1F;
  }

  static computeCrc16(bytes) {
    let reg = 0xFFFF;
    for (let b = 0; b < bytes.length; b++) {
      const byte = bytes[b];
      for (let i = 0; i < 8; i++) {
        const bit = (byte >> i) & 1;
        const fb = bit ^ ((reg >> 15) & 1);
        reg = ((reg << 1) & 0xFFFF) ^ (fb ? 0x8005 : 0x0000);
      }
    }
    return (~reg) & 0xFFFF;
  }

  static stuffAndNrziEncode(rawBits) {
    const nrziLevels = [];
    let ones = 0;
    let level = 1;
    for (let i = 0; i < rawBits.length; i++) {
      const bit = rawBits[i] & 1;
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
    return nrziLevels;
  }

  _bytesToBitsLsbFirst(bytes) {
    const bits = [];
    for (let i = 0; i < bytes.length; i++) {
      for (let k = 0; k < 8; k++) bits.push((bytes[i] >> k) & 1);
    }
    return bits;
  }

  _driveWirePacket(pid, payloadBytes, isLowSpeed) {
    const bitPeriodNs = this.getBitPeriodNs(isLowSpeed);
    const syncBits = [0, 0, 0, 0, 0, 0, 0, 1];
    const pidByte = (pid & 0x0F) | (((~pid) & 0x0F) << 4);
    const pidBits = this._bytesToBitsLsbFirst([pidByte]);

    let bodyBits = [];
    if (pid === USB_PIDS.OUT || pid === USB_PIDS.IN || pid === USB_PIDS.SETUP || pid === USB_PIDS.SOF) {
      let addr7 = this.devAddr;
      let endp4 = this.endp;
      if (pid === USB_PIDS.SOF) {
        addr7 = this.frameNum & 0x7F;
        endp4 = (this.frameNum >> 7) & 0x0F;
      }
      const crc5 = ReferenceSIE.computeCrc5(addr7, endp4);
      const tokenVal11 = (addr7 & 0x7F) | ((endp4 & 0x0F) << 7);
      for (let i = 0; i < 11; i++) bodyBits.push((tokenVal11 >> i) & 1);
      for (let i = 4; i >= 0; i--) bodyBits.push((crc5 >> i) & 1);
    } else if (pid === USB_PIDS.DATA0 || pid === USB_PIDS.DATA1) {
      const crc16 = ReferenceSIE.computeCrc16(payloadBytes);
      bodyBits = this._bytesToBitsLsbFirst(payloadBytes);
      for (let i = 15; i >= 0; i--) bodyBits.push((crc16 >> i) & 1);
    }

    const nrziLevels = ReferenceSIE.stuffAndNrziEncode(syncBits.concat(pidBits, bodyBits));
    let t = this.simTimeNs;
    for (let i = 0; i < nrziLevels.length; i++) {
      const isJ = nrziLevels[i] === 1;
      const dp = isLowSpeed ? (isJ ? 0 : 1) : (isJ ? 1 : 0);
      const dm = dp ^ 1;
      this.lineBus.curDp = dp;
      this.lineBus.curDm = dm;
      this.lineBus._onHostPinChange(t);
      t += bitPeriodNs;
    }
    // EOP: 2 bits SE0, 1 bit J
    this.lineBus.curDp = 0;
    this.lineBus.curDm = 0;
    this.lineBus._onHostPinChange(t);
    t += 2 * bitPeriodNs;
    const jDp = isLowSpeed ? 0 : 1;
    const jDm = isLowSpeed ? 1 : 0;
    this.lineBus.curDp = jDp;
    this.lineBus.curDm = jDm;
    this.lineBus._onHostPinChange(t);
    t += bitPeriodNs;
    this.simTimeNs = t;
  }

  _driveLowSpeedKeepAlive() {
    const bitPeriodNs = this.getBitPeriodNs(true);
    let t = this.simTimeNs;
    this.lineBus.curDp = 0; this.lineBus.curDm = 0;
    this.lineBus._onHostPinChange(t);
    t += 2 * bitPeriodNs;
    this.lineBus.curDp = 0; this.lineBus.curDm = 1;
    this.lineBus._onHostPinChange(t);
    t += bitPeriodNs;
    this.simTimeNs = t;
  }

  _receiveDeviceWaveform(isLowSpeed) {
    const bitPeriodNs = this.getBitPeriodNs(isLowSpeed);
    const q = this.lineBus.devTxQueue;
    let cursor = this.lineBus.devTxCursor;

    // Check if device transmitted anything within 18 bit times
    const timeoutNs = this.simTimeNs + 18 * bitPeriodNs;
    if (cursor >= q.length || q[cursor].timeNs > timeoutNs) {
      this.simTimeNs = timeoutNs;
      this.lineBus.stepDevicesUntil(this.simTimeNs);
      this.statusFlags |= CSR_STATUS.ERR_TIMEOUT;
      this.stuffTimeoutErrCount = (this.stuffTimeoutErrCount + 1) & 0xFF;
      return;
    }

    // Collect device wire transitions up to EOP (SE0 -> J)
    const segs = [];
    while (cursor < q.length) {
      const ev = q[cursor++];
      segs.push(ev);
      if (segs.length >= 2 && segs[segs.length - 2].dp === 0 && segs[segs.length - 2].dm === 0) {
        const isJ = isLowSpeed ? (ev.dp === 0 && ev.dm === 1) : (ev.dp === 1 && ev.dm === 0);
        if (isJ) break;
      }
    }
    this.lineBus.devTxCursor = cursor;
    for (const s of segs) {
      this.lineBus._recordTransition(s.timeNs, s.dp, s.dm, this.lineBus._classifyState(s.dp, s.dm));
    }
    this.simTimeNs = segs[segs.length - 1].timeNs + bitPeriodNs;
    this.lineBus.stepDevicesUntil(this.simTimeNs);

    // Decode NRZI segments at host bitPeriodNs (DPLL resync on each transition)
    const nrziLevels = [];
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i].dp === 0 && segs[i].dm === 0) break;
      const dur = segs[i + 1].timeNs - segs[i].timeNs;
      const bits = Math.max(1, Math.round(dur / bitPeriodNs));
      const isJ = isLowSpeed ? (segs[i].dp === 0 && segs[i].dm === 1) : (segs[i].dp === 1 && segs[i].dm === 0);
      for (let b = 0; b < bits; b++) nrziLevels.push(isJ ? 1 : 0);
    }

    let prev = 1, ones = 0, expectStuff = false, stuffErr = false;
    const decodedBits = [];
    for (let i = 0; i < nrziLevels.length; i++) {
      const cur = nrziLevels[i];
      const bit = (cur === prev) ? 1 : 0;
      prev = cur;
      if (expectStuff) {
        if (bit !== 0) stuffErr = true;
        ones = 0; expectStuff = false; continue;
      }
      decodedBits.push(bit);
      if (bit === 1) { ones++; if (ones === 6) expectStuff = true; }
      else ones = 0;
    }

    if (stuffErr) {
      this.statusFlags |= CSR_STATUS.ERR_STUFF;
      this.stuffTimeoutErrCount = (this.stuffTimeoutErrCount + 1) & 0xFF;
      return;
    }

    const nBytes = Math.floor(decodedBits.length / 8);
    const bytes = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (decodedBits[i * 8 + k] << k);
      bytes[i] = b;
    }

    if (bytes.length < 2 || bytes[0] !== 0x80) {
      this.statusFlags |= CSR_STATUS.ERR_CRC;
      this.crcErrCount = (this.crcErrCount + 1) & 0xFF;
      return;
    }

    const pidByte = bytes[1];
    if (((pidByte & 0x0F) ^ ((pidByte >> 4) & 0x0F)) !== 0x0F) {
      this.statusFlags |= CSR_STATUS.ERR_CRC;
      this.crcErrCount = (this.crcErrCount + 1) & 0xFF;
      return;
    }

    const pid = pidByte & 0x0F;
    this.lastRxPid = pid;

    if (pid === USB_PIDS.DATA0 || pid === USB_PIDS.DATA1) {
      if (bytes.length < 4) {
        this.statusFlags |= CSR_STATUS.ERR_CRC;
        this.crcErrCount = (this.crcErrCount + 1) & 0xFF;
        return;
      }
      const dataLen = bytes.length - 4;
      const payload = bytes.slice(2, 2 + dataLen);
      let rxCrc16 = 0;
      for (let i = 0; i < 8; i++) rxCrc16 |= (((bytes[2 + dataLen] >> i) & 1) << (15 - i));
      for (let i = 0; i < 8; i++) rxCrc16 |= (((bytes[3 + dataLen] >> i) & 1) << (7 - i));

      if (ReferenceSIE.computeCrc16(payload) !== rxCrc16) {
        this.statusFlags |= CSR_STATUS.ERR_CRC;
        this.crcErrCount = (this.crcErrCount + 1) & 0xFF;
        return;
      }

      this.rxLen = payload.length;
      for (let i = 0; i < payload.length; i++) {
        const w = i >> 1;
        if ((i & 1) === 0) this.sramLo[w] = payload[i];
        else this.sramHi[w] = payload[i];
      }
      const expectedToggle = (this.csrCmd & CSR_CMD.DATA_TOGGLE) ? USB_PIDS.DATA1 : USB_PIDS.DATA0;
      if (pid === expectedToggle) this.statusFlags |= CSR_STATUS.TOGGLE_OK;

      if (this.csrCmd & CSR_CMD.AUTO_ACK) {
        this.simTimeNs += 3 * bitPeriodNs;
        this._driveWirePacket(USB_PIDS.ACK, new Uint8Array(0), isLowSpeed);
      }
    }
  }

  advanceTimeNs(deltaNs) {
    const targetNs = this.simTimeNs + deltaNs;
    const isLowSpeed = (this.csrCmd & CSR_CMD.SPEED_SEL) !== 0;

    while (this.lastSofTimeNs + this.sofIntervalNs <= targetNs) {
      this.simTimeNs = this.lastSofTimeNs + this.sofIntervalNs;
      this.lastSofTimeNs = this.simTimeNs;
      if (this.csrCmd & CSR_CMD.AUTO_SOF_EN) {
        this.frameNum = (this.frameNum + 1) & 0x7FF;
        this.statusFlags |= CSR_STATUS.SOF_SENT;
        if (isLowSpeed) this._driveLowSpeedKeepAlive();
        else this._driveWirePacket(USB_PIDS.SOF, new Uint8Array(0), false);
      }
      this.lineBus.stepDevicesUntil(this.simTimeNs);
    }
    this.simTimeNs = targetNs;
    this.lineBus.stepDevicesUntil(this.simTimeNs);
  }

  _executeTransaction() {
    const isLowSpeed = (this.csrCmd & CSR_CMD.SPEED_SEL) !== 0;
    const tokenPid = this.csrCmd & CSR_CMD.TOKEN_PID_MASK;
    const bitPeriodNs = this.getBitPeriodNs(isLowSpeed);

    this.statusFlags &= ~(
      CSR_STATUS.DONE | CSR_STATUS.ERR_TIMEOUT | CSR_STATUS.ERR_CRC |
      CSR_STATUS.ERR_STUFF | CSR_STATUS.TOGGLE_OK | CSR_STATUS.IRQ_PENDING
    );
    this.lastRxPid = 0;

    this._driveWirePacket(tokenPid, new Uint8Array(0), isLowSpeed);
    if (tokenPid === USB_PIDS.SOF) {
      this.statusFlags |= CSR_STATUS.DONE | CSR_STATUS.IRQ_PENDING;
      return;
    }

    if (tokenPid === USB_PIDS.SETUP || tokenPid === USB_PIDS.OUT) {
      const payload = new Uint8Array(this.txLen);
      for (let i = 0; i < this.txLen; i++) {
        const w = i >> 1;
        payload[i] = (i & 1) === 0 ? this.sramLo[w] : this.sramHi[w];
      }
      const dataPid = (this.csrCmd & CSR_CMD.DATA_TOGGLE) ? USB_PIDS.DATA1 : USB_PIDS.DATA0;
      this.simTimeNs += 2 * bitPeriodNs;
      this._driveWirePacket(dataPid, payload, isLowSpeed);
      this._receiveDeviceWaveform(isLowSpeed);
      this.statusFlags |= CSR_STATUS.DONE | CSR_STATUS.IRQ_PENDING;
      return;
    }

    if (tokenPid === USB_PIDS.IN) {
      this._receiveDeviceWaveform(isLowSpeed);
      this.statusFlags |= CSR_STATUS.DONE | CSR_STATUS.IRQ_PENDING;
    }
  }

  readReg(port) {
    let val = 0;
    switch (port & 0x07) {
      case SIE_REGS.CSR: {
        const attachState = this.lineBus.getAttachState();
        let st = this.statusFlags;
        if (attachState.attached) st |= CSR_STATUS.ATTACHED;
        if (attachState.lowSpeed) st |= CSR_STATUS.LOW_SPEED;
        if (this.csrCmd & CSR_CMD.SPEED_SEL) st |= CSR_STATUS.SPEED_MODE;
        st |= ((this.lastRxPid & 0x0F) << CSR_STATUS.LAST_PID_SHIFT);
        val = st & 0xFFFF;
        break;
      }
      case SIE_REGS.TARGET:
        val = (this.devAddr & 0x7F) | ((this.endp & 0x0F) << 7);
        break;
      case SIE_REGS.LEN:
        val = this.rxLen & 0xFFFF;
        break;
      case SIE_REGS.DATA16: {
        const w = this.bufPtr & 0xFF;
        val = (this.sramLo[w] & 0xFF) | ((this.sramHi[w] & 0xFF) << 8);
        this.bufPtr = (this.bufPtr + 1) & 0xFF;
        break;
      }
      case SIE_REGS.FRAME:
        val = this.frameNum & 0x7FF;
        break;
      case SIE_REGS.BUF_PTR:
        val = this.bufPtr & 0xFF;
        break;
      case SIE_REGS.DIAG:
        val = (this.crcErrCount & 0xFF) | ((this.stuffTimeoutErrCount & 0xFF) << 8);
        break;
    }
    this.regTrace.push({ op: 'R', port: port & 0x07, val: val & 0xFFFF });
    return val & 0xFFFF;
  }

  writeReg(port, value) {
    const v = value & 0xFFFF;
    this.regTrace.push({ op: 'W', port: port & 0x07, val: v });
    switch (port & 0x07) {
      case SIE_REGS.CSR: {
        this.csrCmd = v;
        if (v & CSR_CMD.BUF_RST) this.bufPtr = 0;
        if (v & CSR_CMD.CLR_IRQ) this.statusFlags &= ~(CSR_STATUS.DONE | CSR_STATUS.IRQ_PENDING);
        if (v & CSR_CMD.BUS_RESET) {
          this.lineBus.curDp = 0; this.lineBus.curDm = 0;
          this.lineBus._onHostPinChange(this.simTimeNs);
          this.simTimeNs += 2500;
          const jDp = this.lineBus.lowSpeedPullUp ? 0 : 1;
          const jDm = this.lineBus.lowSpeedPullUp ? 1 : 0;
          this.lineBus.curDp = jDp; this.lineBus.curDm = jDm;
          this.lineBus._onHostPinChange(this.simTimeNs);
          this.statusFlags |= CSR_STATUS.DONE;
        }
        if (v & CSR_CMD.START_XFER) this._executeTransaction();
        break;
      }
      case SIE_REGS.TARGET:
        this.devAddr = v & 0x7F;
        this.endp = (v >> 7) & 0x0F;
        break;
      case SIE_REGS.LEN:
        this.txLen = v & 0xFF;
        this.bufPtr = 0;
        break;
      case SIE_REGS.DATA16: {
        const w = this.bufPtr & 0xFF;
        this.sramLo[w] = v & 0xFF;
        this.sramHi[w] = (v >> 8) & 0xFF;
        this.bufPtr = (this.bufPtr + 1) & 0xFF;
        break;
      }
      case SIE_REGS.BUF_PTR:
        this.bufPtr = v & 0xFF;
        break;
    }
  }
}

module.exports = {
  ReferenceSIE
};
