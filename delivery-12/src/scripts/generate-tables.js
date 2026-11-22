/**
 * Bare USB — Disclosed SRAM Lookup Table Generator (`scripts/generate-tables.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Provenance:
 * - Follows `PARTS.md` Decisions 3 & 4 (Kehai Interim, 2026-11-18):
 *   "Every lookup table lives in 10 ns SRAM, loaded at power-up" from SST39SF040 parallel flash
 *   by a hardware counter copy-engine (74LVC161 counters + 74LVC138 decoder, no program counter).
 * - Disclosed per `SPEC.md`:
 *   "2. The transaction sequence comes from the state register plus its lookup tables, or from
 *    other gates. A table generator may compute table contents. Nothing may compute a decision
 *    at run time."
 */

'use strict';

const crypto = require('crypto');

const SIE_STATES = {
  IDLE:            0x0,
  TX_SYNC:         0x1,
  TX_PID:          0x2,
  TX_TOKEN_B0:     0x3,
  TX_TOKEN_B1:     0x4,
  TX_EOP:          0x5,
  TX_DATA_SYNC:    0x6,
  TX_DATA_PID:     0x7,
  TX_DATA_PAYLOAD: 0x8,
  TX_DATA_CRC_LO:  0x9,
  TX_DATA_CRC_HI:  0xA,
  TX_DATA_EOP:     0xB,
  WAIT_RX_SYNC:    0xC,
  RX_PID:          0xD,
  RX_DATA_OR_HS:   0xE,
  TX_AUTO_ACK:     0xF
};

/**
 * 1. `U35_LUT_FSM_LO` & `U36_LUT_FSM_HI` (4,096 x 16-bit):
 *    Pure combinational next-state and hardware control-strobe decode table for `U34_FSM_STATE` (74LVC574A).
 *    Address inputs A[11:0]:
 *      A[3:0]  : Current state `CUR_S[3:0]`
 *      A[5:4]  : Transaction category `XFER_TYPE[1:0]` (0=SETUP, 1=OUT, 2=IN, 3=SOF)
 *      A[6]    : `START_OR_SOF`
 *      A[7]    : `BYTE_DONE` (8 unstuffed bits completed)
 *      A[8]    : `LEN_DONE` (TX payload finished or RX handshake)
 *      A[9]    : `RX_ACTIVE` (SYNC 0x80 acquired by DPLL/RX_SR)
 *      A[10]   : `EOP_SE0` (EOP completed)
 *      A[11]   : `TURN_TIMEOUT_OR_ERR` (18-bit turnaround timeout or CRC/stuff error)
 */
function generateFsmLut(mutatedEntry = null) {
  const table = new Uint16Array(4096);

  const TX_OE         = 1 << 4;
  const TX_LOAD_SYNC  = 1 << 5;
  const TX_LOAD_PID   = 1 << 6;
  const TX_LOAD_DATA  = 1 << 7;
  const TX_LOAD_CRC   = 1 << 8;
  const TX_SEND_EOP   = 1 << 9;
  const RX_CAPTURE_EN = 1 << 10;
  const BUF_WE        = 1 << 11;
  const CRC_CHECK_EN  = 1 << 12;
  const TURN_TIMER_EN = 1 << 13;
  const AUTO_ACK_TRIG = 1 << 14;
  const XFER_DONE_IRQ = 1 << 15;

  for (let addr = 0; addr < 4096; addr++) {
    const state        = addr & 0x0F;
    const xferType     = (addr >> 4) & 0x03; // 0=SETUP, 1=OUT, 2=IN, 3=SOF
    const startOrSof   = (addr >> 6) & 0x01;
    const byteDone     = (addr >> 7) & 0x01;
    const lenDone      = (addr >> 8) & 0x01;
    const rxActive     = (addr >> 9) & 0x01;
    const eopSe0       = (addr >> 10) & 0x01;
    const timeoutOrErr = (addr >> 11) & 0x01;

    let nextState = state;
    let ctrl = 0;

    switch (state) {
      case SIE_STATES.IDLE:
        if (startOrSof) {
          if (xferType === 3 && lenDone) {
            // Low-Speed Keep-Alive: 2-bit SE0 + 1-bit J directly via TX_EOP
            nextState = SIE_STATES.TX_EOP;
            ctrl = TX_OE | TX_SEND_EOP;
          } else {
            nextState = SIE_STATES.TX_SYNC;
            ctrl = TX_OE | TX_LOAD_SYNC;
          }
        }
        break;

      case SIE_STATES.TX_SYNC:
        ctrl = TX_OE;
        if (byteDone) {
          nextState = SIE_STATES.TX_PID;
          ctrl |= TX_LOAD_PID;
        }
        break;

      case SIE_STATES.TX_PID:
        ctrl = TX_OE;
        if (byteDone) {
          nextState = SIE_STATES.TX_TOKEN_B0;
          ctrl |= TX_LOAD_DATA;
        }
        break;

      case SIE_STATES.TX_TOKEN_B0:
        ctrl = TX_OE;
        if (byteDone) {
          nextState = SIE_STATES.TX_TOKEN_B1;
          ctrl |= TX_LOAD_CRC;
        }
        break;

      case SIE_STATES.TX_TOKEN_B1:
        ctrl = TX_OE;
        if (byteDone) {
          nextState = SIE_STATES.TX_EOP;
          ctrl |= TX_SEND_EOP;
        }
        break;

      case SIE_STATES.TX_EOP:
        ctrl = TX_OE | TX_SEND_EOP;
        if (eopSe0) {
          if (xferType === 3) {
            nextState = SIE_STATES.IDLE;
            ctrl = XFER_DONE_IRQ;
          } else if (xferType === 0 || xferType === 1) {
            nextState = SIE_STATES.TX_DATA_SYNC;
            ctrl = TX_OE | TX_LOAD_SYNC;
          } else {
            nextState = SIE_STATES.WAIT_RX_SYNC;
            ctrl = TURN_TIMER_EN;
          }
        }
        break;

      case SIE_STATES.TX_DATA_SYNC:
        ctrl = TX_OE;
        if (byteDone) {
          nextState = SIE_STATES.TX_DATA_PID;
          ctrl |= TX_LOAD_PID;
        }
        break;

      case SIE_STATES.TX_DATA_PID:
        ctrl = TX_OE;
        if (byteDone) {
          if (lenDone) {
            nextState = SIE_STATES.TX_DATA_CRC_LO;
            ctrl |= TX_LOAD_CRC;
          } else {
            nextState = SIE_STATES.TX_DATA_PAYLOAD;
            ctrl |= TX_LOAD_DATA;
          }
        }
        break;

      case SIE_STATES.TX_DATA_PAYLOAD:
        ctrl = TX_OE;
        if (byteDone) {
          if (lenDone) {
            nextState = SIE_STATES.TX_DATA_CRC_LO;
            ctrl |= TX_LOAD_CRC;
          } else {
            nextState = SIE_STATES.TX_DATA_PAYLOAD;
            ctrl |= TX_LOAD_DATA;
          }
        }
        break;

      case SIE_STATES.TX_DATA_CRC_LO:
        ctrl = TX_OE | TX_LOAD_CRC;
        if (byteDone) {
          nextState = SIE_STATES.TX_DATA_CRC_HI;
        }
        break;

      case SIE_STATES.TX_DATA_CRC_HI:
        ctrl = TX_OE | TX_LOAD_CRC;
        if (byteDone) {
          nextState = SIE_STATES.TX_DATA_EOP;
          ctrl = TX_OE | TX_SEND_EOP;
        }
        break;

      case SIE_STATES.TX_DATA_EOP:
        ctrl = TX_OE | TX_SEND_EOP;
        if (eopSe0) {
          nextState = SIE_STATES.WAIT_RX_SYNC;
          ctrl = TURN_TIMER_EN;
        }
        break;

      case SIE_STATES.WAIT_RX_SYNC:
        ctrl = TURN_TIMER_EN;
        if (timeoutOrErr) {
          nextState = SIE_STATES.IDLE;
          ctrl = XFER_DONE_IRQ;
        } else if (rxActive) {
          nextState = SIE_STATES.RX_PID;
          ctrl = RX_CAPTURE_EN;
        }
        break;

      case SIE_STATES.RX_PID:
        ctrl = RX_CAPTURE_EN;
        if (timeoutOrErr) {
          nextState = SIE_STATES.IDLE;
          ctrl = XFER_DONE_IRQ;
        } else if (byteDone) {
          nextState = SIE_STATES.RX_DATA_OR_HS;
        }
        break;

      case SIE_STATES.RX_DATA_OR_HS:
        ctrl = RX_CAPTURE_EN | (byteDone ? BUF_WE : 0);
        if (timeoutOrErr) {
          nextState = SIE_STATES.IDLE;
          ctrl = XFER_DONE_IRQ;
        } else if (eopSe0) {
          if (xferType === 2 && !lenDone) {
            // IN data packet received cleanly -> send hardware AUTO_ACK
            nextState = SIE_STATES.TX_AUTO_ACK;
            ctrl = CRC_CHECK_EN | AUTO_ACK_TRIG;
          } else {
            nextState = SIE_STATES.IDLE;
            ctrl = XFER_DONE_IRQ;
          }
        }
        break;

      case SIE_STATES.TX_AUTO_ACK:
        ctrl = TX_OE | AUTO_ACK_TRIG;
        if (eopSe0 || timeoutOrErr) {
          nextState = SIE_STATES.IDLE;
          ctrl = XFER_DONE_IRQ;
        }
        break;
    }

    table[addr] = (nextState & 0x0F) | ctrl;
  }

  // Mutant 6 (`fsm_bad_next_state`): corrupts one active next-state entry in the FSM LUT
  if (mutatedEntry !== null && mutatedEntry >= 0 && mutatedEntry < 4096) {
    const orig = table[mutatedEntry];
    const origNext = orig & 0x0F;
    const corruptedNext = (origNext === SIE_STATES.IDLE) ? SIE_STATES.TX_EOP : SIE_STATES.IDLE;
    table[mutatedEntry] = (orig & 0xFFF0) | corruptedNext;
  }

  return table;
}

/**
 * 2. `U37_LUT_PID` (256 x 8-bit):
 *    Combinational decode of an 8-bit USB PID byte (`PID[3:0]` and `~PID[7:4]`).
 */
function generatePidCheckLut() {
  const table = new Uint8Array(256);
  for (let b = 0; b < 256; b++) {
    const pid = b & 0x0F;
    const npid = (b >> 4) & 0x0F;
    const valid = ((pid ^ npid) === 0x0F) ? 1 : 0;
    const isToken = (pid === 0x1 || pid === 0x9 || pid === 0x5 || pid === 0xD) ? 1 : 0;
    const isData = (pid === 0x3 || pid === 0xB) ? 1 : 0;
    const isHs = (pid === 0x2 || pid === 0xA || pid === 0xE) ? 1 : 0;
    table[b] = valid | (isToken << 1) | (isData << 2) | (isHs << 3) | (pid << 4);
  }
  return table;
}

/**
 * 3. `U52_LUT_TX_HDR` (4,096 x 8-bit):
 *    Bit-serial header generator & XFER_TYPE decoder for SYNC (0x80), PID, DATA0/1 PID, and AUTO_ACK (SYNC+ACK).
 *    Address A[11:0]:
 *      A[3:0]  : `CUR_S[3:0]`
 *      A[6:4]  : `BIT_Q[2:0]` (0..7)
 *      A[10:7] : `CMD_PID[3:0]`
 *      A[11]   : `CMD_TOGGLE` (0=DATA0 0x3, 1=DATA1 0xB)
 *    Outputs IO[7:0]:
 *      IO[0]   : `HDR_BIT` (bit for SYNC / PID)
 *      IO[2:1] : `XFER_TYPE[1:0]` (0=SETUP 0xD, 1=OUT 0x1, 2=IN 0x9, 3=SOF 0x5)
 *      IO[3]   : `IS_HDR_STATE` (1 in states TX_SYNC, TX_PID, TX_DATA_SYNC, TX_DATA_PID)
 *      IO[4]   : `IS_EOP_STATE` (1 in states TX_EOP, TX_DATA_EOP)
 */
function generateTxHeaderLut() {
  const table = new Uint8Array(4096);
  for (let addr = 0; addr < 4096; addr++) {
    const state = addr & 0x0F;
    const bitIdx = (addr >> 4) & 0x07;
    const cmdPid = (addr >> 7) & 0x0F;
    const toggle = (addr >> 11) & 0x01;

    let xferType = 0;
    if (cmdPid === 0xD) xferType = 0;      // SETUP
    else if (cmdPid === 0x1) xferType = 1; // OUT
    else if (cmdPid === 0x9) xferType = 2; // IN
    else if (cmdPid === 0x5) xferType = 3; // SOF

    let byteVal = 0x80;
    let isHdr = 0;
    if (state === SIE_STATES.TX_SYNC || state === SIE_STATES.TX_DATA_SYNC) {
      byteVal = 0x80;
      isHdr = 1;
    } else if (state === SIE_STATES.TX_PID) {
      byteVal = (cmdPid & 0x0F) | (((~cmdPid) & 0x0F) << 4);
      isHdr = 1;
    } else if (state === SIE_STATES.TX_DATA_PID) {
      const dPid = toggle ? 0x0B : 0x03;
      byteVal = dPid | (((~dPid) & 0x0F) << 4);
      isHdr = 1;
    } else if (state === SIE_STATES.TX_AUTO_ACK) {
      const ackPhase = cmdPid & 0x03;
      if (ackPhase === 1) {
        byteVal = 0x80; // SYNC
        isHdr = 1;
      } else if (ackPhase === 2) {
        byteVal = 0xD2; // ACK (0x2 | (~0x2 << 4))
        isHdr = 1;
      }
    }

    const hdrBit = (byteVal >> bitIdx) & 1;
    const isEop = (state === SIE_STATES.TX_EOP || state === SIE_STATES.TX_DATA_EOP || (state === SIE_STATES.TX_AUTO_ACK && (cmdPid & 0x03) === 3)) ? 1 : 0;

    table[addr] = hdrBit | (xferType << 1) | (isHdr << 3) | (isEop << 4);
  }
  return table;
}

/**
 * 4. `U53_LUT_SERIAL_CRC` (4,096 x 8-bit):
 *    Bit serializer (LSB-first or complemented MSB-first for CRC5/CRC16) & USB CRC-16 residual (0x800D) checker.
 *    Address A[11:0]:
 *      A[7:0]  : 8-bit input byte (`BYTE_IN[7:0]`)
 *      A[10:8] : 3-bit bit index (`BIT_Q[2:0]`, 0..7)
 *      A[11]   : `MODE_CRC_INV` (0 = normal LSB-first `(byte >> bit) & 1`, 1 = inverted MSB-first `(~byte >> (7 - bit)) & 1`)
 *    Outputs IO[7:0]:
 *      IO[0]   : `SERIAL_BIT`
 *      IO[1]   : `IS_CRC16_RES_LO` (`1` iff `BYTE_IN === 0x0D`)
 *      IO[2]   : `IS_CRC16_RES_HI` (`1` iff `BYTE_IN === 0x80`)
 */
function generateSerializerAndCrcCheckLut() {
  const table = new Uint8Array(4096);
  for (let addr = 0; addr < 4096; addr++) {
    const byteIn = addr & 0xFF;
    const bitIdx = (addr >> 8) & 0x07;
    const modeInv = (addr >> 11) & 0x01;

    const serialBit = modeInv
      ? (((~byteIn) >> (7 - bitIdx)) & 1)
      : ((byteIn >> bitIdx) & 1);
    const isResLo = (byteIn === 0x0D) ? 1 : 0;
    const isResHi = (byteIn === 0x80) ? 1 : 0;

    table[addr] = serialBit | (isResLo << 1) | (isResHi << 2);
  }
  return table;
}

function computeTablesDigest() {
  const fsm = generateFsmLut(null);
  const pid = generatePidCheckLut();
  const hdr = generateTxHeaderLut();
  const ser = generateSerializerAndCrcCheckLut();
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(fsm.buffer));
  hash.update(Buffer.from(pid.buffer));
  hash.update(Buffer.from(hdr.buffer));
  hash.update(Buffer.from(ser.buffer));
  return {
    fsmEntries: fsm.length,
    fsmBytes: fsm.byteLength,
    pidEntries: pid.length,
    pidBytes: pid.byteLength,
    hdrBytes: hdr.byteLength,
    serBytes: ser.byteLength,
    totalBytes: fsm.byteLength + pid.byteLength + hdr.byteLength + ser.byteLength,
    sha256: hash.digest('hex')
  };
}

if (require.main === module) {
  console.log(JSON.stringify(computeTablesDigest(), null, 2));
}

module.exports = {
  SIE_STATES,
  generateFsmLut,
  generatePidCheckLut,
  generateTxHeaderLut,
  generateSerializerAndCrcCheckLut,
  computeTablesDigest
};
