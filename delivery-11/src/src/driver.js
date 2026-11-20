/**
 * Bare USB — CPU-Budgeted USB Host Driver (`src/driver.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Provenance:
 * - Implements the CPU I/O budget model from `IO-NOTES.md`:
 *   - 16-bit word-wide `IN rd, port` / `OUT port, rs` instructions;
 *   - Every register access (`in16` or `out16`) costs exactly 10 µs (10,000 ns) of simulated time;
 *   - The driver talks ONLY through `readReg`, `writeReg`, and `advanceTimeNs` on the pin harness
 *     (or ReferenceSIE).
 */

'use strict';

const crypto = require('crypto');

const CPU_PORT_COST_NS = 10000; // 10 µs per port access (IO-NOTES.md)

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

class UsbHostDriver {
  constructor(sieHarness) {
    this.sie = sieHarness;
    this.totalRegReads = 0;
    this.totalRegWrites = 0;
    this.totalTransfers = 0;
    this.totalRetries = 0;
    this.speedFlag = 0;
    this.cbwTag = 1;
  }

  get totalRegAccesses() {
    return this.totalRegReads + this.totalRegWrites;
  }

  get totalCpuTimeUs() {
    return this.totalRegAccesses * 10;
  }

  in16(port) {
    this.sie.advanceTimeNs(CPU_PORT_COST_NS);
    this.totalRegReads++;
    return this.sie.readReg(port);
  }

  out16(port, val) {
    this.sie.advanceTimeNs(CPU_PORT_COST_NS);
    this.totalRegWrites++;
    this.sie.writeReg(port, val & 0xFFFF);
  }

  _writeBufferBytes(bytes) {
    this.out16(SIE_REGS.LEN, bytes.length);
    for (let i = 0; i < bytes.length; i += 2) {
      const lo = bytes[i] & 0xFF;
      const hi = (i + 1 < bytes.length) ? (bytes[i + 1] & 0xFF) : 0x00;
      this.out16(SIE_REGS.DATA16, lo | (hi << 8));
    }
  }

  _readBufferBytes(len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 2) {
      const w = this.in16(SIE_REGS.DATA16);
      out[i] = w & 0xFF;
      if (i + 1 < len) out[i + 1] = (w >> 8) & 0xFF;
    }
    return out;
  }

  runTransaction(devAddr, endp, tokenPid, dataToggle, txBytes = null, maxRetries = 3) {
    this.totalTransfers++;
    this.out16(SIE_REGS.TARGET, (devAddr & 0x7F) | ((endp & 0x0F) << 7));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (tokenPid === USB_PIDS.SETUP || tokenPid === USB_PIDS.OUT) {
        this._writeBufferBytes(txBytes || new Uint8Array(0));
      }

      const cmd = (tokenPid & 0x0F) |
        (dataToggle ? CSR_CMD.DATA_TOGGLE : 0) |
        CSR_CMD.AUTO_ACK |
        CSR_CMD.AUTO_SOF_EN |
        this.speedFlag |
        CSR_CMD.BUF_RST |
        CSR_CMD.START_XFER;

      this.out16(SIE_REGS.CSR, cmd);

      // Poll CSR until DONE (for LS 64-byte or 8-byte packets, may take >10 us, so poll up to 20x)
      let status = 0;
      for (let poll = 0; poll < 25; poll++) {
        status = this.in16(SIE_REGS.CSR);
        if (status & CSR_STATUS.DONE) break;
      }

      const hasErr = (status & (CSR_STATUS.ERR_TIMEOUT | CSR_STATUS.ERR_CRC | CSR_STATUS.ERR_STUFF)) !== 0;
      const lastPid = (status >> CSR_STATUS.LAST_PID_SHIFT) & 0x0F;

      if (!hasErr && (status & CSR_STATUS.DONE)) {
        if (tokenPid === USB_PIDS.SETUP || tokenPid === USB_PIDS.OUT) {
          if (lastPid === USB_PIDS.ACK) {
            return { ok: true, pid: lastPid, status };
          }
          if (lastPid === USB_PIDS.STALL) {
            return { ok: false, reason: 'STALL', status };
          }
        } else if (tokenPid === USB_PIDS.IN) {
          if ((lastPid === USB_PIDS.DATA0 || lastPid === USB_PIDS.DATA1) && (status & CSR_STATUS.TOGGLE_OK)) {
            const rxLen = this.in16(SIE_REGS.LEN);
            const data = this._readBufferBytes(rxLen);
            return { ok: true, pid: lastPid, data, status };
          }
          if (lastPid === USB_PIDS.NAK) {
            return { ok: false, reason: 'NAK', status };
          }
          if (lastPid === USB_PIDS.STALL) {
            return { ok: false, reason: 'STALL', status };
          }
        }
      }

      this.totalRetries++;
    }

    return { ok: false, reason: 'RETRIES_EXHAUSTED' };
  }

  controlTransfer(devAddr, setup8Bytes, expectedInLen = 0, maxPacketSize0 = 64) {
    const setupRes = this.runTransaction(devAddr, 0, USB_PIDS.SETUP, 0, setup8Bytes);
    if (!setupRes.ok) return setupRes;

    const collected = [];
    let totalRx = 0;
    let toggle = 1;

    while (totalRx < expectedInLen) {
      const inRes = this.runTransaction(devAddr, 0, USB_PIDS.IN, toggle);
      if (!inRes.ok) return inRes;
      collected.push(inRes.data);
      totalRx += inRes.data.length;
      toggle ^= 1;
      if (inRes.data.length < maxPacketSize0) break;
    }

    if (expectedInLen > 0) {
      const stOut = this.runTransaction(devAddr, 0, USB_PIDS.OUT, 1, new Uint8Array(0));
      if (!stOut.ok) return stOut;
    } else {
      const stIn = this.runTransaction(devAddr, 0, USB_PIDS.IN, 1);
      if (!stIn.ok) return stIn;
    }

    const merged = new Uint8Array(totalRx);
    let off = 0;
    for (const chunk of collected) {
      merged.set(chunk, off);
      off += chunk.length;
    }
    return { ok: true, data: merged };
  }

  enumerateDevice(assignedAddr = 1) {
    const initCsr = this.in16(SIE_REGS.CSR);
    if (!(initCsr & CSR_STATUS.ATTACHED)) {
      return { ok: false, reason: 'NO_DEVICE_ATTACHED' };
    }
    const isLowSpeed = (initCsr & CSR_STATUS.LOW_SPEED) !== 0;
    this.speedFlag = isLowSpeed ? CSR_CMD.SPEED_SEL : 0;
    const maxPkt0 = isLowSpeed ? 8 : 64;

    this.out16(SIE_REGS.CSR, CSR_CMD.BUS_RESET | CSR_CMD.AUTO_SOF_EN | this.speedFlag);
    this.in16(SIE_REGS.CSR);

    const getDevDesc = new Uint8Array([0x80, 0x06, 0x00, 0x01, 0x00, 0x00, 18, 0x00]);
    const devDescRes = this.controlTransfer(0, getDevDesc, 18, maxPkt0);
    if (!devDescRes.ok) return { ok: false, stage: 'GET_DEVICE_DESC', ...devDescRes };

    const setAddr = new Uint8Array([0x00, 0x05, assignedAddr & 0x7F, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const setAddrRes = this.controlTransfer(0, setAddr, 0, maxPkt0);
    if (!setAddrRes.ok) return { ok: false, stage: 'SET_ADDRESS', ...setAddrRes };

    const cfgLen = isLowSpeed ? 34 : 32;
    const getCfgDesc = new Uint8Array([0x80, 0x06, 0x00, 0x02, 0x00, 0x00, cfgLen, 0x00]);
    const cfgDescRes = this.controlTransfer(assignedAddr, getCfgDesc, cfgLen, maxPkt0);
    if (!cfgDescRes.ok) return { ok: false, stage: 'GET_CONFIG_DESC', ...cfgDescRes };

    const setCfg = new Uint8Array([0x00, 0x09, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const setCfgRes = this.controlTransfer(assignedAddr, setCfg, 0, maxPkt0);
    if (!setCfgRes.ok) return { ok: false, stage: 'SET_CONFIGURATION', ...setCfgRes };

    if (isLowSpeed) {
      const setProto = new Uint8Array([0x21, 0x0B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const protoRes = this.controlTransfer(assignedAddr, setProto, 0, maxPkt0);
      if (!protoRes.ok) return { ok: false, stage: 'SET_PROTOCOL', ...protoRes };
    }

    const vid = devDescRes.data[8] | (devDescRes.data[9] << 8);
    const pid = devDescRes.data[10] | (devDescRes.data[11] << 8);

    return {
      ok: true,
      isLowSpeed,
      address: assignedAddr,
      vid,
      pid,
      deviceDescriptor: devDescRes.data,
      configDescriptor: cfgDescRes.data
    };
  }

  readHidKeystrokes(devAddr, count = 100) {
    const reports = [];
    let toggle = 0;
    for (let i = 0; i < count; i++) {
      const res = this.runTransaction(devAddr, 1, USB_PIDS.IN, toggle);
      if (!res.ok) return { ok: false, index: i, reason: res.reason, reports };
      reports.push(res.data);
      toggle ^= 1;
    }
    return { ok: true, count: reports.length, reports };
  }

  botScsiRead(devAddr, cdb10, dataLength, state) {
    const cbw = new Uint8Array(31);
    const dv = new DataView(cbw.buffer);
    dv.setUint32(0, 0x43425355, true);
    dv.setUint32(4, this.cbwTag++, true);
    dv.setUint32(8, dataLength, true);
    cbw[12] = 0x80;
    cbw[13] = 0x00;
    cbw[14] = cdb10.length;
    cbw.set(cdb10, 15);

    const outRes = this.runTransaction(devAddr, 1, USB_PIDS.OUT, state.outToggle, cbw);
    if (!outRes.ok) return outRes;
    state.outToggle ^= 1;

    const outBuf = new Uint8Array(dataLength);
    let offset = 0;
    while (offset < dataLength) {
      const inRes = this.runTransaction(devAddr, 2, USB_PIDS.IN, state.inToggle);
      if (!inRes.ok) return inRes;
      state.inToggle ^= 1;
      if (!inRes.data || inRes.data.length === 0 || offset + inRes.data.length > dataLength) {
        return { ok: false, reason: "RX_LEN_MISMATCH", expectedRemaining: dataLength - offset, got: inRes.data ? inRes.data.length : 0 };
      }
      outBuf.set(inRes.data, offset);
      offset += inRes.data.length;
    }

    const cswRes = this.runTransaction(devAddr, 2, USB_PIDS.IN, state.inToggle);
    if (!cswRes.ok) return cswRes;
    state.inToggle ^= 1;

    if (cswRes.data.length !== 13) return { ok: false, reason: 'INVALID_CSW_LEN' };
    const cswView = new DataView(cswRes.data.buffer, cswRes.data.byteOffset, 13);
    if (cswView.getUint32(0, true) !== 0x53425355 || cswRes.data[12] !== 0x00) {
      return { ok: false, reason: 'CSW_FAILED' };
    }
    return { ok: true, data: outBuf };
  }

  scsiReadSectors(devAddr, lba, sectorCount, state) {
    const cdb = new Uint8Array([
      0x28, 0x00,
      (lba >>> 24) & 0xFF, (lba >>> 16) & 0xFF, (lba >>> 8) & 0xFF, lba & 0xFF,
      0x00,
      (sectorCount >>> 8) & 0xFF, sectorCount & 0xFF,
      0x00
    ]);
    return this.botScsiRead(devAddr, cdb, sectorCount * 512, state);
  }

  readFat16File64KB(devAddr) {
    const botState = { outToggle: 0, inToggle: 0 };
    const inqRes = this.botScsiRead(devAddr, new Uint8Array([0x12, 0, 0, 0, 36, 0]), 36, botState);
    if (!inqRes.ok) return { ok: false, stage: 'SCSI_INQUIRY', ...inqRes };

    const bpbRes = this.scsiReadSectors(devAddr, 0, 1, botState);
    if (!bpbRes.ok) return { ok: false, stage: 'READ_BPB', ...bpbRes };
    const bpbView = new DataView(bpbRes.data.buffer, bpbRes.data.byteOffset, 512);
    const bytesPerSec = bpbView.getUint16(11, true);
    const secPerClus = bpbRes.data[13];
    const rsvdSecCnt = bpbView.getUint16(14, true);
    const numFats = bpbRes.data[16];
    const rootEntCnt = bpbView.getUint16(17, true);
    const fatSz16 = bpbView.getUint16(22, true);

    const rootDirLba = rsvdSecCnt + numFats * fatSz16;
    const rootDirSectors = Math.ceil((rootEntCnt * 32) / bytesPerSec);
    const dataRegionLba = rootDirLba + rootDirSectors;

    const rootRes = this.scsiReadSectors(devAddr, rootDirLba, 1, botState);
    if (!rootRes.ok) return { ok: false, stage: 'READ_ROOT_DIR', ...rootRes };
    const rootView = new DataView(rootRes.data.buffer, rootRes.data.byteOffset, 512);
    const startCluster = rootView.getUint16(26, true);
    const fileSize = rootView.getUint32(28, true);

    const fileLba = dataRegionLba + (startCluster - 2) * secPerClus;
    const totalSectors = Math.ceil(fileSize / bytesPerSec);

    const fileData = new Uint8Array(fileSize);
    let byteOffset = 0;
    const chunkSectors = 16;
    for (let s = 0; s < totalSectors; s += chunkSectors) {
      const count = Math.min(chunkSectors, totalSectors - s);
      const chunkRes = this.scsiReadSectors(devAddr, fileLba + s, count, botState);
      if (!chunkRes.ok) return { ok: false, stage: `READ_DATA_LBA_${fileLba + s}`, ...chunkRes };
      fileData.set(chunkRes.data, byteOffset);
      byteOffset += chunkRes.data.length;
    }

    const sha256 = crypto.createHash('sha256').update(fileData).digest('hex');
    return {
      ok: true,
      fileName: 'TEST64K.BIN',
      fileSize: fileData.length,
      startCluster,
      fileLba,
      sha256
    };
  }

  getBudgetMetrics() {
    const simTimeMs = this.sie.simTimeNs / 1e6;
    const regAccessesPerTransfer = this.totalTransfers > 0
      ? +(this.totalRegAccesses / this.totalTransfers).toFixed(2)
      : 0;
    const cpuTimeUsPerMsFrame = simTimeMs > 0
      ? +(this.totalCpuTimeUs / simTimeMs).toFixed(2)
      : 0;
    return {
      totalRegReads: this.totalRegReads,
      totalRegWrites: this.totalRegWrites,
      totalRegAccesses: this.totalRegAccesses,
      totalTransfers: this.totalTransfers,
      totalRetries: this.totalRetries,
      totalCpuTimeUs: this.totalCpuTimeUs,
      totalSimTimeMs: +simTimeMs.toFixed(3),
      regAccessesPerTransfer,
      cpuTimeUsPerMsFrame,
      cpuUtilizationPct: +((cpuTimeUsPerMsFrame / 1000) * 100).toFixed(2)
    };
  }
}

module.exports = {
  CPU_PORT_COST_NS,
  USB_PIDS,
  SIE_REGS,
  CSR_STATUS,
  CSR_CMD,
  UsbHostDriver
};
