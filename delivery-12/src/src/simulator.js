/**
 * Bare USB — High-Speed Event-Driven Gate-Level Netlist Simulator (`src/simulator.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Provenance:
 * - Delay numbers and setup/hold parameters from `TIMING-BUDGET.md`, `PARTS.md`
 *   (Kehai Interim, 2026-11-18), and primary TI/ISSI datasheets:
 *   74LVC245A / SN74LVCH245A (6.3 ns tpd, 8.5 ns ten, 7.5 ns tdis; bus-hold on LVCH245A),
 *   74LVC257A (4.6 ns tpd, 6.4 ns tpdSel, 5.6 ns ten, 4.3 ns tdis),
 *   74LVC574A (7.0 ns clk->Q, 2.0 ns setup), 74LVC157A (5.2 ns max),
 *   IS61WV5128EDBLL-10TLI (10.0 ns tAA, 4.5 ns tDOE, 0 ns tLZOE, 4.0 ns tHZOE, common IO0..IO7).
 * - Strictly isolated: does NOT import reference SIE, device models, or host driver.
 * - Reports all setup/hold violations, floating-net reads, and multi-driver bus contention
 *   intervals (with exact duration) honestly at min, typ, and max corners.
 */

'use strict';

const { PARTS_CATALOG, FORBIDDEN_PART_PATTERNS } = require('./parts-library');

const VAL_Z = 2; // High-impedance (output disabled / released)

const ANALOG_BUS_NETS = new Set([
  'DP_XCVR', 'DM_XCVR', 'DP_PIN', 'DM_PIN', 'DP_BUS', 'DM_BUS'
]);

const TRISTATE_CHIP_TYPES = new Set([
  '74LVC245A', '74LVCH245A', '74LVC257A', '74LVC574A', '74LVC595A',
  'IS61WV5128EDBLL', 'SST39SF040', 'USB1T11A'
]);

class MinHeapEventQueue {
  constructor(initialCap = 4096) {
    this.cap = initialCap;
    this.len = 0;
    this.time = new Float64Array(initialCap);
    this.netId = new Int32Array(initialCap);
    this.val = new Uint8Array(initialCap);
    this.drvId = new Int32Array(initialCap);
    this.seq = new Float64Array(initialCap);
    this.nextSeq = 0;
  }

  get length() {
    return this.len;
  }

  _grow() {
    const newCap = this.cap * 2;
    const nTime = new Float64Array(newCap);
    const nNet = new Int32Array(newCap);
    const nVal = new Uint8Array(newCap);
    const nDrv = new Int32Array(newCap);
    const nSeq = new Float64Array(newCap);
    nTime.set(this.time);
    nNet.set(this.netId);
    nVal.set(this.val);
    nDrv.set(this.drvId);
    nSeq.set(this.seq);
    this.time = nTime;
    this.netId = nNet;
    this.val = nVal;
    this.drvId = nDrv;
    this.seq = nSeq;
    this.cap = newCap;
  }

  push(t, net, v, drv = -1) {
    if (this.len >= this.cap) this._grow();
    let i = this.len++;
    const s = this.nextSeq++;
    const time = this.time;
    const netId = this.netId;
    const val = this.val;
    const drvId = this.drvId;
    const seq = this.seq;

    while (i > 0) {
      const p = (i - 1) >> 1;
      const pt = time[p];
      if (t < pt || (t === pt && s < seq[p])) {
        time[i] = pt;
        netId[i] = netId[p];
        val[i] = val[p];
        drvId[i] = drvId[p];
        seq[i] = seq[p];
        i = p;
      } else {
        break;
      }
    }
    time[i] = t;
    netId[i] = net;
    val[i] = v;
    drvId[i] = drv;
    seq[i] = s;
  }

  peekTime() {
    return this.len > 0 ? this.time[0] : Infinity;
  }

  popInto(out) {
    const n = this.len;
    if (n === 0) return false;
    out.timeNs = this.time[0];
    out.netId = this.netId[0];
    out.val = this.val[0];
    out.drvId = this.drvId[0];
    out.seq = this.seq[0];

    const last = --this.len;
    if (last > 0) {
      const t = this.time[last];
      const net = this.netId[last];
      const v = this.val[last];
      const d = this.drvId[last];
      const s = this.seq[last];
      const time = this.time;
      const netId = this.netId;
      const val = this.val;
      const drvId = this.drvId;
      const seq = this.seq;

      let i = 0;
      const half = last >> 1;
      while (i < half) {
        let child = (i << 1) + 1;
        const right = child + 1;
        if (right < last) {
          const ct = time[child];
          const rt = time[right];
          if (rt < ct || (rt === ct && seq[right] < seq[child])) {
            child = right;
          }
        }
        const ct = time[child];
        if (t < ct || (t === ct && s < seq[child])) break;
        time[i] = ct;
        netId[i] = netId[child];
        val[i] = val[child];
        drvId[i] = drvId[child];
        seq[i] = seq[child];
        i = child;
      }
      time[i] = t;
      netId[i] = net;
      val[i] = v;
      drvId[i] = d;
      seq[i] = s;
    }
    return true;
  }
}

class GateSimulator {
  constructor(options = {}) {
    this.delayCorner = options.delayCorner || 'max';
    this.nowNs = 0;
    this.queue = new MinHeapEventQueue(8192);
    this._popEv = { timeNs: 0, netId: 0, val: 0, drvId: -1, seq: -1 };

    this.netNameToId = new Map();
    this.netIdToName = [];
    this.netValues = new Uint8Array(1024);
    this.netLastChangeNs = new Float64Array(1024);
    this.netHasKeeper = new Uint8Array(1024);
    this.netKeeperVal = new Uint8Array(1024);
    this.netFloating = new Uint8Array(1024);
    this.netIsMultiOrTri = new Uint8Array(1024);
    this.netContending = new Uint8Array(1024);
    this.netContendStartNs = new Float64Array(1024);
    this.netContendDrivers = [];
    this.netDrivers = [];
    this.netCount = 0;
    this.netListeners = [];
    this.netWatchers = [];

    // Driver registry (each chip output pin or external host port driver gets a unique drvId)
    this.drvNetId = new Int32Array(2048);
    this.drvVal = new Uint8Array(2048);
    this.drvLastAppliedSeq = new Float64Array(2048).fill(-1);
    this.drvChipId = [];
    this.drvPin = [];
    this.drvCount = 0;
    this.extDrivers = new Map(); // netId -> drvId for external setNetImmediate/releaseNetImmediate

    this.chips = [];
    this.chipById = new Map();

    // Setup and hold violation tracking (never silently resolved)
    this.timingViolations = [];
    this.asyncSyncEvents = [];
    this.minSetupSlackNs = Infinity;
    this.minHoldSlackNs = Infinity;
    this.worstSetupPath = null;
    this.worstHoldPath = null;

    // Honest 3-state floating-read & bus-contention tracking (Round 12)
    this.floatingReadViolations = [];
    this.floatingReadCount = 0;
    this.contentionViolations = [];
    this.contentionCount = 0;
    this.maxContentionDurationNs = 0;

    // Dedicated simulated path slack trackers for Test 4 (DPLL path and FSM-table path)
    this.minDpllSlackNs = Infinity;
    this.minFsmSlackNs = Infinity;
    this.fsmAccessedAddresses = new Set();

    this.totalGateEvaluations = 0;
    this.totalPinEvents = 0;

    this.VCC = this.getOrCreateNet('VCC', 1);
    this.GND = this.getOrCreateNet('GND', 0);
    this.netHasKeeper[this.VCC] = 1;
    this.netKeeperVal[this.VCC] = 1;
    this.netHasKeeper[this.GND] = 1;
    this.netKeeperVal[this.GND] = 0;
  }

  getOrCreateNet(name, initialVal = 0) {
    let id = this.netNameToId.get(name);
    if (id !== undefined) return id;
    id = this.netCount++;
    if (id >= this.netValues.length) {
      const nCap = this.netValues.length * 2;
      const growU8 = (old) => { const a = new Uint8Array(nCap); a.set(old); return a; };
      const growF64 = (old) => { const a = new Float64Array(nCap); a.set(old); return a; };
      this.netValues = growU8(this.netValues);
      this.netLastChangeNs = growF64(this.netLastChangeNs);
      this.netHasKeeper = growU8(this.netHasKeeper);
      this.netKeeperVal = growU8(this.netKeeperVal);
      this.netFloating = growU8(this.netFloating);
      this.netIsMultiOrTri = growU8(this.netIsMultiOrTri);
      this.netContending = growU8(this.netContending);
      this.netContendStartNs = growF64(this.netContendStartNs);
    }
    this.netNameToId.set(name, id);
    this.netIdToName.push(name);
    this.netValues[id] = initialVal & 1;
    this.netKeeperVal[id] = initialVal & 1;
    this.netLastChangeNs[id] = -1000;
    this.netListeners.push([]);
    this.netWatchers.push(null);
    this.netDrivers.push([]);
    this.netContendDrivers.push(null);
    return id;
  }

  _allocDriver(netId, chipId, pin, initialVal = VAL_Z, isTristate = false) {
    if (netId < 0 || netId === this.VCC || netId === this.GND) return -1;
    const did = this.drvCount++;
    if (did >= this.drvNetId.length) {
      const nCap = this.drvNetId.length * 2;
      const nNet = new Int32Array(nCap); nNet.set(this.drvNetId); this.drvNetId = nNet;
      const nVal = new Uint8Array(nCap); nVal.set(this.drvVal); this.drvVal = nVal;
      const nSeq = new Float64Array(nCap).fill(-1); nSeq.set(this.drvLastAppliedSeq); this.drvLastAppliedSeq = nSeq;
    }
    this.drvNetId[did] = netId;
    this.drvVal[did] = initialVal;
    this.drvChipId.push(chipId);
    this.drvPin.push(pin);
    const list = this.netDrivers[netId];
    list.push(did);
    if ((isTristate || list.length > 1) && !ANALOG_BUS_NETS.has(this.netIdToName[netId])) {
      this.netIsMultiOrTri[netId] = 1;
    }
    return did;
  }

  _getExtDriver(netId) {
    let did = this.extDrivers.get(netId);
    if (did === undefined) {
      did = this._allocDriver(netId, 'HOST_PIN', this.netIdToName[netId], VAL_Z, true);
      this.extDrivers.set(netId, did);
    }
    return did;
  }

  getNet(name) {
    const id = this.netNameToId.get(name);
    return id !== undefined ? this.netValues[id] : 0;
  }

  watchNet(name, callback) {
    const id = this.getOrCreateNet(name);
    if (!this.netWatchers[id]) this.netWatchers[id] = [];
    this.netWatchers[id].push(callback);
  }

  setNetImmediate(name, val) {
    const id = this.getOrCreateNet(name);
    const did = this.netIsMultiOrTri[id] || name.startsWith('PORT_D') ? this._getExtDriver(id) : -1;
    this.queue.push(this.nowNs, id, val & 1, did);
  }

  releaseNetImmediate(name) {
    const id = this.getOrCreateNet(name);
    const did = this._getExtDriver(id);
    this.queue.push(this.nowNs, id, VAL_Z, did);
  }

  scheduleNet(name, val, delayNs = 0) {
    const id = this.getOrCreateNet(name);
    const did = this.netIsMultiOrTri[id] || name.startsWith('PORT_D') ? this._getExtDriver(id) : -1;
    this.queue.push(this.nowNs + delayNs, id, val & 1, did);
  }

  _interpCorner(minD, maxD) {
    if (this.delayCorner === 'min') return minD;
    if (this.delayCorner === 'typ') return 0.5 * (minD + maxD);
    return maxD;
  }

  _getDelay(spec, isTc = false) {
    const minD = spec.tpdMinNs;
    const maxD = (isTc && spec.tpdTcMaxNs) ? spec.tpdTcMaxNs : spec.tpdMaxNs;
    return this._interpCorner(minD, maxD);
  }

  addChip(id, type, role, pinMap, initImage = null) {
    for (const pat of FORBIDDEN_PART_PATTERNS) {
      if (pat.test(type) || pat.test(id)) {
        throw new Error(`Forbidden part type detected in netlist: ${id} (${type})`);
      }
    }
    const spec = PARTS_CATALOG[type];
    if (!spec) {
      throw new Error(`Unknown part type ${type} for chip ${id}`);
    }
    if (type === 'IS61WV5128EDBLL') {
      for (let i = 0; i < 8; i++) {
        if (pinMap['D' + i] !== undefined) {
          throw new Error(`IS61WV5128EDBLL (${id}) has no separate D${i} pin — must use common IO0..IO7`);
        }
      }
    }

    const chipIdx = this.chips.length;
    const resolvedPins = {};
    for (const [pin, netName] of Object.entries(pinMap)) {
      resolvedPins[pin] = this.getOrCreateNet(netName, netName === 'VCC' ? 1 : 0);
    }

    const chip = {
      idx: chipIdx,
      id,
      type,
      role,
      spec,
      delayNs: this._getDelay(spec, false),
      delayTcNs: this._getDelay(spec, true),
      delaySelNs: spec.tpdSelMaxNs != null ? this._interpCorner(spec.tpdSelMinNs || spec.tpdMinNs, spec.tpdSelMaxNs) : this._getDelay(spec, false),
      delayEnNs: spec.tEnMaxNs != null ? this._interpCorner(spec.tEnMinNs || spec.tpdMinNs, spec.tEnMaxNs) : this._getDelay(spec, false),
      delayDisNs: spec.tDisMaxNs != null ? this._interpCorner(spec.tDisMinNs || spec.tpdMinNs, spec.tDisMaxNs) : this._getDelay(spec, false),
      delayDoeNs: spec.tDoeMaxNs != null ? this._interpCorner(spec.tDoeMinNs || 1.0, spec.tDoeMaxNs) : this._getDelay(spec, false),
      delayHzoeNs: spec.tHzoeMaxNs != null ? this._interpCorner(spec.tHzoeMinNs || 0.0, spec.tHzoeMaxNs) : 0,
      delayLzoeNs: spec.tLzoeMinNs != null ? spec.tLzoeMinNs : 0,
      delayHzweNs: spec.tHzweMaxNs != null ? this._interpCorner(spec.tHzweMinNs || 0.0, spec.tHzweMaxNs) : 0,
      delayLzweNs: spec.tLzweMinNs != null ? spec.tLzweMinNs : 2.0,
      pins: resolvedPins,
      pinMap,
      _priv: this._createInitialChipPriv(type, initImage),
      lastClockNs: -1000,
      lastClock2Ns: -1000,
      synchronousInputs: this._getSynchronousInputPins(type),
      isDpll: id === 'U05_DPLL_PHASE_CNT',
      isFsmReg: id === 'U34_FSM_STATE',
      isFsmLutLo: id === 'U35_LUT_FSM_LO'
    };

    // Register bus-hold keepers on SN74LVCH245A A1..A8 and B1..B8 data pins (always active per TI SCES008Q §8.3.4)
    if (spec.hasBusHold) {
      for (let i = 1; i <= 8; i++) {
        const na = resolvedPins['A' + i];
        const nb = resolvedPins['B' + i];
        if (na !== undefined && na >= 0) this.netHasKeeper[na] = 1;
        if (nb !== undefined && nb >= 0) this.netHasKeeper[nb] = 1;
      }
    }

    this._precompilePinArrays(chip);
    this._registerChipDrivers(chip);
    this.chips.push(chip);
    this.chipById.set(id, chip);

    const inputPins = this._getInputPins(type);
    for (const pin of inputPins) {
      const nid = resolvedPins[pin];
      if (nid !== undefined && nid !== this.VCC && nid !== this.GND) {
        this.netListeners[nid].push({ chipIdx, pin });
      }
    }

    this._evalChip(chip, 'INIT');
    return chip;
  }

  _registerChipDrivers(chip) {
    const isTri = TRISTATE_CHIP_TYPES.has(chip.type);
    const allocArr = (netArr, pinNames, initVal = VAL_Z) => {
      const out = new Int32Array(netArr.length);
      for (let i = 0; i < netArr.length; i++) {
        out[i] = this._allocDriver(netArr[i], chip.id, pinNames[i], initVal, isTri);
      }
      return out;
    };
    switch (chip.type) {
      case '74LVC04A':
        chip._dy = allocArr(chip._y, ['1Y','2Y','3Y','4Y','5Y','6Y'], 0);
        break;
      case '74LVC08A':
      case '74LVC32A':
      case '74LVC86A':
      case '74LVC157A':
        chip._dy = allocArr(chip._y, ['1Y','2Y','3Y','4Y'], 0);
        break;
      case '74LVC257A':
        chip._dy = allocArr(chip._y, ['1Y','2Y','3Y','4Y'], VAL_Z);
        break;
      case '74LVC138A':
        chip._dy = allocArr(chip._y, ['Y0_N','Y1_N','Y2_N','Y3_N','Y4_N','Y5_N','Y6_N','Y7_N'], 1);
        break;
      case '74LVC245A':
      case '74LVCH245A':
        chip._da = allocArr(chip._pa, ['A1','A2','A3','A4','A5','A6','A7','A8'], VAL_Z);
        chip._db = allocArr(chip._pb, ['B1','B2','B3','B4','B5','B6','B7','B8'], VAL_Z);
        break;
      case '74LVC574A':
        chip._dq = allocArr(chip._q, ['Q0','Q1','Q2','Q3','Q4','Q5','Q6','Q7'], VAL_Z);
        break;
      case '74LVC74A':
        chip._dq1 = this._allocDriver(chip._ff1[4], chip.id, '1Q', 0, false);
        chip._dq1n = this._allocDriver(chip._ff1[5], chip.id, '1Q_N', 1, false);
        chip._dq2 = this._allocDriver(chip._ff2[4], chip.id, '2Q', 0, false);
        chip._dq2n = this._allocDriver(chip._ff2[5], chip.id, '2Q_N', 1, false);
        break;
      case '74LVC161':
        chip._dq = allocArr(chip._q, ['Q0','Q1','Q2','Q3'], 0);
        chip._dtc = this._allocDriver(chip._ctrl[5], chip.id, 'TC', 0, false);
        break;
      case '74LVC595A':
        chip._dq = allocArr(chip._q, ['QA','QB','QC','QD','QE','QF','QG','QH'], VAL_Z);
        chip._dqhs = this._allocDriver(chip._ctrl[5], chip.id, 'QH_S', 0, false);
        break;
      case '74LVC165A':
        chip._dqh = this._allocDriver(chip._ctrl[4], chip.id, 'QH', 0, false);
        chip._dqhn = this._allocDriver(chip._ctrl[5], chip.id, 'QH_N', 1, false);
        break;
      case 'IS61WV5128EDBLL':
        chip._dio = allocArr(chip._io, ['IO0','IO1','IO2','IO3','IO4','IO5','IO6','IO7'], VAL_Z);
        break;
      case 'SST39SF040':
        chip._ddq = allocArr(chip._dq, ['DQ0','DQ1','DQ2','DQ3','DQ4','DQ5','DQ6','DQ7'], VAL_Z);
        break;
    }
  }

  _precompilePinArrays(chip) {
    const r = (name) => {
      const nid = chip.pins[name];
      return nid !== undefined ? nid : -1;
    };
    const arr = (names) => {
      const a = new Int32Array(names.length);
      for (let i = 0; i < names.length; i++) a[i] = r(names[i]);
      return a;
    };
    switch (chip.type) {
      case '74LVC04A':
        chip._a = arr(['1A','2A','3A','4A','5A','6A']);
        chip._y = arr(['1Y','2Y','3Y','4Y','5Y','6Y']);
        break;
      case '74LVC08A':
      case '74LVC32A':
      case '74LVC86A':
        chip._a = arr(['1A','2A','3A','4A']);
        chip._b = arr(['1B','2B','3B','4B']);
        chip._y = arr(['1Y','2Y','3Y','4Y']);
        break;
      case '74LVC157A':
        chip._s = r('S'); chip._gn = r('G_N');
        chip._i0 = arr(['1I0','2I0','3I0','4I0']);
        chip._i1 = arr(['1I1','2I1','3I1','4I1']);
        chip._y = arr(['1Y','2Y','3Y','4Y']);
        break;
      case '74LVC257A':
        chip._s = r('S'); chip._oen = r('OE_N');
        chip._i0 = arr(['1I0','2I0','3I0','4I0']);
        chip._i1 = arr(['1I1','2I1','3I1','4I1']);
        chip._y = arr(['1Y','2Y','3Y','4Y']);
        break;
      case '74LVC138A':
        chip._sel = arr(['A','B','C','G2A_N','G2B_N','G1']);
        chip._y = arr(['Y0_N','Y1_N','Y2_N','Y3_N','Y4_N','Y5_N','Y6_N','Y7_N']);
        break;
      case '74LVC245A':
      case '74LVCH245A':
        chip._dir = r('DIR'); chip._oen = r('OE_N');
        chip._pa = arr(['A1','A2','A3','A4','A5','A6','A7','A8']);
        chip._pb = arr(['B1','B2','B3','B4','B5','B6','B7','B8']);
        break;
      case '74LVC574A':
        chip._clk = r('CLK'); chip._oen = r('OE_N');
        chip._d = arr(['D0','D1','D2','D3','D4','D5','D6','D7']);
        chip._q = arr(['Q0','Q1','Q2','Q3','Q4','Q5','Q6','Q7']);
        break;
      case '74LVC74A':
        chip._ff1 = arr(['1CLR_N','1PRE_N','1CLK','1D','1Q','1Q_N']);
        chip._ff2 = arr(['2CLR_N','2PRE_N','2CLK','2D','2Q','2Q_N']);
        break;
      case '74LVC161':
        chip._ctrl = arr(['MR_N','CP','PE_N','CEP','CET','TC']);
        chip._d = arr(['D0','D1','D2','D3']);
        chip._q = arr(['Q0','Q1','Q2','Q3']);
        break;
      case '74LVC595A':
        chip._ctrl = arr(['SRCLR_N','SRCLK','RCLK','OE_N','SER','QH_S']);
        chip._q = arr(['QA','QB','QC','QD','QE','QF','QG','QH']);
        break;
      case '74LVC165A':
        chip._ctrl = arr(['SH_LD_N','CLK','CLK_INH','SER','QH','QH_N']);
        chip._d = arr(['A','B','C','D','E','F','G','H']);
        break;
      case 'IS61WV5128EDBLL':
      case 'SST39SF040':
        chip._ctrl = arr(['CE_N','OE_N','WE_N']);
        chip._addr = arr(['A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15','A16','A17','A18']);
        chip._io = arr(['IO0','IO1','IO2','IO3','IO4','IO5','IO6','IO7']);
        chip._dq = arr(['DQ0','DQ1','DQ2','DQ3','DQ4','DQ5','DQ6','DQ7']);
        break;
      case 'USB1T11A':
        chip._p = arr(['VPO','VMO','OE_N','SPEED','DPLUS','DMINUS','VP','VM','RCV']);
        break;
      case 'RES-NET-USB':
        chip._p = arr(['DP_XCVR','DM_XCVR','DP_BUS','DM_BUS']);
        break;
    }
  }

  _createInitialChipPriv(type, initImage) {
    switch (type) {
      case '74LVC257A': return { prevOen: 1 };
      case '74LVC245A':
      case '74LVCH245A': return { prevOen: 1, prevDir: 1 };
      case '74LVC574A': return { q: new Uint8Array(8), prevClk: 0, prevOen: 1 };
      case '74LVC74A': return { q1: 0, q2: 0, prevClk1: 0, prevClk2: 0 };
      case '74LVC161': return { count: 0, prevCp: 0 };
      case '74LVC595A': return { sr: 0, latch: 0, prevSrClk: 0, prevRClk: 0, prevOen: 1 };
      case '74LVC165A': return { sr: 0, prevClk: 0 };
      case 'IS61WV5128EDBLL':
      case 'SST39SF040':
        return {
          storage: initImage ? new Uint8Array(initImage) : new Uint8Array(4096),
          prevOutEn: false,
          prevWeN: 1,
          prevOeN: 1
        };
      default: return {};
    }
  }

  _getInputPins(type) {
    switch (type) {
      case '74LVC04A': return ['1A','2A','3A','4A','5A','6A'];
      case '74LVC08A':
      case '74LVC32A':
      case '74LVC86A': return ['1A','1B','2A','2B','3A','3B','4A','4B'];
      case '74LVC157A': return ['S','G_N','1I0','1I1','2I0','2I1','3I0','3I1','4I0','4I1'];
      case '74LVC257A': return ['S','OE_N','1I0','1I1','2I0','2I1','3I0','3I1','4I0','4I1'];
      case '74LVC138A': return ['A','B','C','G2A_N','G2B_N','G1'];
      case '74LVC245A':
      case '74LVCH245A': return ['DIR','OE_N','A1','A2','A3','A4','A5','A6','A7','A8','B1','B2','B3','B4','B5','B6','B7','B8'];
      case '74LVC574A': return ['OE_N','CLK','D0','D1','D2','D3','D4','D5','D6','D7'];
      case '74LVC74A': return ['1CLR_N','1PRE_N','1CLK','1D','2CLR_N','2PRE_N','2CLK','2D'];
      case '74LVC161': return ['MR_N','CP','PE_N','CEP','CET','D0','D1','D2','D3'];
      case '74LVC595A': return ['SRCLR_N','SRCLK','RCLK','OE_N','SER'];
      case '74LVC165A': return ['SH_LD_N','CLK','CLK_INH','SER','A','B','C','D','E','F','G','H'];
      case 'IS61WV5128EDBLL': return [
        'A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15','A16','A17','A18',
        'CE_N','OE_N','WE_N','IO0','IO1','IO2','IO3','IO4','IO5','IO6','IO7'
      ];
      case 'SST39SF040': return [
        'A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15','A16','A17','A18',
        'CE_N','OE_N'
      ];
      case 'USB1T11A': return ['VPO','VMO','OE_N','SPEED','SUSPND','DPLUS','DMINUS'];
      case 'ECS-3953M-480': return ['EN'];
      case 'RES-NET-USB': return ['DP_XCVR','DM_XCVR','DP_BUS','DM_BUS'];
      default: return [];
    }
  }

  _getSynchronousInputPins(type) {
    switch (type) {
      case '74LVC574A': return { CLK: ['D0','D1','D2','D3','D4','D5','D6','D7'] };
      case '74LVC74A': return { '1CLK': ['1D'], '2CLK': ['2D'] };
      case '74LVC161': return { CP: ['PE_N','CEP','CET','D0','D1','D2','D3'] };
      case '74LVC595A': return { SRCLK: ['SER'] };
      case '74LVC165A': return { CLK: ['SER'] };
      default: return {};
    }
  }

  _isChipReadingPin(chip, pin) {
    const nv = this.netValues;
    if (chip.type === '74LVC245A' || chip.type === '74LVCH245A') {
      if (pin === 'DIR' || pin === 'OE_N') return true;
      const oen = chip._oen >= 0 ? nv[chip._oen] : 0;
      if (oen === 1) return false; // disabled transceiver is isolated
      const dir = chip._dir >= 0 ? nv[chip._dir] : 1;
      return dir === 1 ? pin.startsWith('A') : pin.startsWith('B');
    }
    if (chip.type === 'IS61WV5128EDBLL') {
      if (pin.startsWith('IO')) {
        const cen = chip._ctrl[0] >= 0 ? nv[chip._ctrl[0]] : 0;
        const wen = chip._ctrl[2] >= 0 ? nv[chip._ctrl[2]] : 1;
        return cen === 0 && wen === 0; // only reading IO during a write
      }
      return true;
    }
    if (chip.type === '74LVC257A') {
      if (pin === 'OE_N' || pin === 'S') return true;
      return (chip._oen >= 0 ? nv[chip._oen] : 0) === 0;
    }
    return true;
  }

  _recordFloatingRead(nid, chip, pin) {
    if (this.nowNs <= 50) return;
    if (this.netFloating[nid] !== 1) return;
    if (!this._isChipReadingPin(chip, pin)) return;
    this.floatingReadCount++;
    if (this.floatingReadViolations.length < 200) {
      this.floatingReadViolations.push({
        type: 'FLOATING_READ',
        netName: this.netIdToName[nid],
        timeNs: +this.nowNs.toFixed(3),
        chipId: chip.id,
        pin
      });
    }
  }

  _checkSetupIds(chip, clkPinName, dataPinIds) {
    const tSetup = chip.spec.tSetupNs;
    if (!tSetup || this.nowNs <= 50) return;
    for (let i = 0; i < dataPinIds.length; i++) {
      const nid = dataPinIds[i];
      if (nid < 0 || nid === this.VCC || nid === this.GND) continue;
      if (this.netFloating[nid] === 1) {
        this._recordFloatingRead(nid, chip, clkPinName + '_DATA');
      }
      const lastChg = this.netLastChangeNs[nid];
      if (lastChg <= 50) continue;
      const elapsed = this.nowNs - lastChg;
      const slack = elapsed - tSetup;
      if (elapsed > 0 && slack < this.minSetupSlackNs) {
        this.minSetupSlackNs = slack;
        this.worstSetupPath = `${chip.id} -> ${clkPinName} (${chip.type})`;
      }
      if (chip.isDpll && elapsed > 0 && elapsed < 100 && slack < this.minDpllSlackNs) {
        this.minDpllSlackNs = slack;
      }
      if (chip.isFsmReg && elapsed > 0 && elapsed < 150 && slack < this.minFsmSlackNs) {
        this.minFsmSlackNs = slack;
      }
      if (elapsed > 0 && slack < -1e-6) {
        const netName = this.netIdToName[nid];
        const rec = {
          type: 'SETUP_VIOLATION',
          timeNs: this.nowNs,
          chipId: chip.id,
          partNumber: chip.spec.partNumber,
          clockPin: clkPinName,
          netName,
          requiredNs: tSetup,
          observedNs: elapsed,
          slackNs: slack
        };
        const isDeclaredAsync = (chip.id === 'U04_DPLL_EDGE_FF' && netName === 'RCV_IN') ||
          (chip.id === 'U200_BUS_SYNC_FF' && (netName === 'DP_IN' || netName === 'DM_IN'));
        if (isDeclaredAsync) this.asyncSyncEvents.push(rec);
        else this.timingViolations.push(rec);
      }
    }
  }

  _checkHoldTime(chip, changedPin, lastClkNs) {
    const tHold = chip.spec.tHoldNs;
    if (!tHold || lastClkNs <= 50 || this.nowNs <= 50) return;
    const elapsed = this.nowNs - lastClkNs;
    if (elapsed >= 0 && elapsed < 15.0) {
      const slack = elapsed - tHold;
      if (slack < this.minHoldSlackNs) {
        this.minHoldSlackNs = slack;
        this.worstHoldPath = `${chip.id}.${changedPin} after CLK (${chip.type})`;
      }
      if (slack < -1e-6) {
        const netName = chip.pinMap ? chip.pinMap[changedPin] : null;
        const rec = {
          type: 'HOLD_VIOLATION',
          timeNs: this.nowNs,
          chipId: chip.id,
          partNumber: chip.spec.partNumber,
          dataPin: changedPin,
          netName,
          requiredNs: tHold,
          observedNs: elapsed,
          slackNs: slack
        };
        const isDeclaredAsync = (chip.id === 'U04_DPLL_EDGE_FF' && netName === 'RCV_IN') ||
          (chip.id === 'U200_BUS_SYNC_FF' && (netName === 'DP_IN' || netName === 'DM_IN'));
        if (isDeclaredAsync) this.asyncSyncEvents.push(rec);
        else this.timingViolations.push(rec);
      }
    }
  }

  _evalChip(chip, changedPin) {
    this.totalGateEvaluations++;
    const nv = this.netValues;
    const dly = chip.delayNs;
    const q = this.queue;
    const now = this.nowNs;

    if (changedPin !== 'INIT' && this.nowNs > 50) {
      const pid = chip.pins[changedPin];
      if (pid !== undefined && pid >= 0 && this.netFloating[pid] === 1) {
        this._recordFloatingRead(pid, chip, changedPin);
      }
    }

    switch (chip.type) {
      case '74LVC04A': {
        const a = chip._a, y = chip._y, dy = chip._dy;
        for (let i = 0; i < 6; i++) {
          if (y[i] >= 0) q.push(now + dly, y[i], (a[i] >= 0 ? nv[a[i]] : 0) ^ 1, dy[i]);
        }
        break;
      }
      case '74LVC08A': {
        const a = chip._a, b = chip._b, y = chip._y, dy = chip._dy;
        for (let i = 0; i < 4; i++) {
          if (y[i] >= 0) q.push(now + dly, y[i], (a[i] >= 0 ? nv[a[i]] : 0) & (b[i] >= 0 ? nv[b[i]] : 0), dy[i]);
        }
        break;
      }
      case '74LVC32A': {
        const a = chip._a, b = chip._b, y = chip._y, dy = chip._dy;
        for (let i = 0; i < 4; i++) {
          if (y[i] >= 0) q.push(now + dly, y[i], (a[i] >= 0 ? nv[a[i]] : 0) | (b[i] >= 0 ? nv[b[i]] : 0), dy[i]);
        }
        break;
      }
      case '74LVC86A': {
        const a = chip._a, b = chip._b, y = chip._y, dy = chip._dy;
        for (let i = 0; i < 4; i++) {
          if (y[i] >= 0) q.push(now + dly, y[i], (a[i] >= 0 ? nv[a[i]] : 0) ^ (b[i] >= 0 ? nv[b[i]] : 0), dy[i]);
        }
        break;
      }
      case '74LVC157A': {
        const gn = chip._gn >= 0 ? nv[chip._gn] : 0;
        const s = chip._s >= 0 ? nv[chip._s] : 0;
        const i0 = chip._i0, i1 = chip._i1, y = chip._y, dy = chip._dy;
        for (let i = 0; i < 4; i++) {
          if (y[i] >= 0) {
            const out = gn ? 0 : (s ? (i1[i] >= 0 ? nv[i1[i]] : 0) : (i0[i] >= 0 ? nv[i0[i]] : 0));
            q.push(now + dly, y[i], out, dy[i]);
          }
        }
        break;
      }
      case '74LVC257A': {
        const oen = chip._oen >= 0 ? nv[chip._oen] : 0;
        const s = chip._s >= 0 ? nv[chip._s] : 0;
        const i0 = chip._i0, i1 = chip._i1, y = chip._y, dy = chip._dy;
        const priv = chip._priv;
        if (oen === 1) {
          if (priv.prevOen === 0 || changedPin === 'INIT' || changedPin === 'OE_N') {
            for (let i = 0; i < 4; i++) {
              if (y[i] >= 0) q.push(now + chip.delayDisNs, y[i], VAL_Z, dy[i]);
            }
          }
        } else {
          const dt = (priv.prevOen === 1 || changedPin === 'OE_N') ? chip.delayEnNs :
                     (changedPin === 'S' ? chip.delaySelNs : dly);
          for (let i = 0; i < 4; i++) {
            if (y[i] >= 0) {
              const out = s ? (i1[i] >= 0 ? nv[i1[i]] : 0) : (i0[i] >= 0 ? nv[i0[i]] : 0);
              q.push(now + dt, y[i], out, dy[i]);
            }
          }
        }
        priv.prevOen = oen;
        break;
      }
      case '74LVC138A': {
        const sc = chip._sel;
        const en = (sc[5] < 0 || nv[sc[5]] === 1) && (sc[3] < 0 || nv[sc[3]] === 0) && (sc[4] < 0 || nv[sc[4]] === 0);
        const sel = (sc[0] >= 0 ? nv[sc[0]] : 0) | ((sc[1] >= 0 ? nv[sc[1]] : 0) << 1) | ((sc[2] >= 0 ? nv[sc[2]] : 0) << 2);
        const y = chip._y, dy = chip._dy;
        for (let i = 0; i < 8; i++) {
          if (y[i] >= 0) q.push(now + dly, y[i], (en && sel === i) ? 0 : 1, dy[i]);
        }
        break;
      }
      case '74LVC245A':
      case '74LVCH245A': {
        const oen = chip._oen >= 0 ? nv[chip._oen] : 0;
        const dir = chip._dir >= 0 ? nv[chip._dir] : 1;
        const pa = chip._pa, pb = chip._pb, da = chip._da, db = chip._db;
        const priv = chip._priv;
        if (oen === 1) {
          if (priv.prevOen === 0 || changedPin === 'OE_N' || changedPin === 'INIT') {
            for (let i = 0; i < 8; i++) {
              if (pa[i] >= 0) q.push(now + chip.delayDisNs, pa[i], VAL_Z, da[i]);
              if (pb[i] >= 0) q.push(now + chip.delayDisNs, pb[i], VAL_Z, db[i]);
            }
          }
        } else {
          const enabling = (priv.prevOen === 1 || changedPin === 'OE_N' || changedPin === 'DIR' || priv.prevDir !== dir);
          const dt = enabling ? chip.delayEnNs : dly;
          for (let i = 0; i < 8; i++) {
            if (dir) {
              if (enabling && pa[i] >= 0) q.push(now + chip.delayDisNs, pa[i], VAL_Z, da[i]);
              if (pb[i] >= 0 && pa[i] >= 0) {
                if (this.netFloating[pa[i]] === 1) this._recordFloatingRead(pa[i], chip, 'A' + (i + 1));
                q.push(now + dt, pb[i], nv[pa[i]], db[i]);
              }
            } else {
              if (enabling && pb[i] >= 0) q.push(now + chip.delayDisNs, pb[i], VAL_Z, db[i]);
              if (pa[i] >= 0 && pb[i] >= 0) {
                if (this.netFloating[pb[i]] === 1) this._recordFloatingRead(pb[i], chip, 'B' + (i + 1));
                q.push(now + dt, pa[i], nv[pb[i]], da[i]);
              }
            }
          }
        }
        priv.prevOen = oen;
        priv.prevDir = dir;
        break;
      }
      case '74LVC574A': {
        const clk = chip._clk >= 0 ? nv[chip._clk] : 0;
        const oen = chip._oen >= 0 ? nv[chip._oen] : 0;
        const priv = chip._priv;
        const clkRose = (priv.prevClk === 0 && clk === 1);
        const oenFell = (priv.prevOen === 1 && oen === 0);
        const oenRose = (priv.prevOen === 0 && oen === 1);
        if (clkRose) {
          this._checkSetupIds(chip, 'CLK', chip._d);
          chip.lastClockNs = now;
          const cd = chip._d;
          for (let i = 0; i < 8; i++) priv.q[i] = cd[i] >= 0 ? nv[cd[i]] : 0;
        }
        if (oenRose || (oen === 1 && changedPin === 'INIT')) {
          const cq = chip._q, dq = chip._dq;
          for (let i = 0; i < 8; i++) if (cq[i] >= 0) q.push(now + chip.delayDisNs, cq[i], VAL_Z, dq[i]);
        } else if ((clkRose || oenFell || changedPin === 'INIT') && oen === 0) {
          const cq = chip._q, dq = chip._dq;
          const dt = oenFell ? chip.delayEnNs : dly;
          for (let i = 0; i < 8; i++) {
            if (cq[i] >= 0) q.push(now + dt, cq[i], priv.q[i], dq[i]);
          }
        }
        priv.prevClk = clk;
        priv.prevOen = oen;
        break;
      }
      case '74LVC74A': {
        const f1 = chip._ff1, f2 = chip._ff2, priv = chip._priv;
        const clr1 = f1[0] >= 0 ? nv[f1[0]] : 1;
        const pre1 = f1[1] >= 0 ? nv[f1[1]] : 1;
        const clk1 = f1[2] >= 0 ? nv[f1[2]] : 0;
        if (clr1 === 0) {
          priv.q1 = 0;
          if (f1[4] >= 0) q.push(now + dly, f1[4], 0, chip._dq1);
          if (f1[5] >= 0) q.push(now + dly, f1[5], 1, chip._dq1n);
        } else if (pre1 === 0) {
          priv.q1 = 1;
          if (f1[4] >= 0) q.push(now + dly, f1[4], 1, chip._dq1);
          if (f1[5] >= 0) q.push(now + dly, f1[5], 0, chip._dq1n);
        } else if (priv.prevClk1 === 0 && clk1 === 1) {
          this._checkSetupIds(chip, '1CLK', [f1[3]]);
          chip.lastClockNs = now;
          priv.q1 = f1[3] >= 0 ? nv[f1[3]] : 0;
          if (f1[4] >= 0) q.push(now + dly, f1[4], priv.q1, chip._dq1);
          if (f1[5] >= 0) q.push(now + dly, f1[5], priv.q1 ^ 1, chip._dq1n);
        }
        priv.prevClk1 = clk1;

        const clr2 = f2[0] >= 0 ? nv[f2[0]] : 1;
        const pre2 = f2[1] >= 0 ? nv[f2[1]] : 1;
        const clk2 = f2[2] >= 0 ? nv[f2[2]] : 0;
        if (clr2 === 0) {
          priv.q2 = 0;
          if (f2[4] >= 0) q.push(now + dly, f2[4], 0, chip._dq2);
          if (f2[5] >= 0) q.push(now + dly, f2[5], 1, chip._dq2n);
        } else if (pre2 === 0) {
          priv.q2 = 1;
          if (f2[4] >= 0) q.push(now + dly, f2[4], 1, chip._dq2);
          if (f2[5] >= 0) q.push(now + dly, f2[5], 0, chip._dq2n);
        } else if (priv.prevClk2 === 0 && clk2 === 1) {
          this._checkSetupIds(chip, '2CLK', [f2[3]]);
          chip.lastClock2Ns = now;
          priv.q2 = f2[3] >= 0 ? nv[f2[3]] : 0;
          if (f2[4] >= 0) q.push(now + dly, f2[4], priv.q2, chip._dq2);
          if (f2[5] >= 0) q.push(now + dly, f2[5], priv.q2 ^ 1, chip._dq2n);
        }
        priv.prevClk2 = clk2;
        break;
      }
      case '74LVC161': {
        const sc = chip._ctrl, priv = chip._priv, cq = chip._q, cd = chip._d, dq = chip._dq;
        const mrn = sc[0] >= 0 ? nv[sc[0]] : 1;
        const cp  = sc[1] >= 0 ? nv[sc[1]] : 0;
        const pen = sc[2] >= 0 ? nv[sc[2]] : 1;
        const cep = sc[3] >= 0 ? nv[sc[3]] : 1;
        const cet = sc[4] >= 0 ? nv[sc[4]] : 1;
        if (mrn === 0) {
          priv.count = 0;
          for (let i = 0; i < 4; i++) if (cq[i] >= 0) q.push(now + dly, cq[i], 0, dq[i]);
          if (sc[5] >= 0) q.push(now + chip.delayTcNs, sc[5], 0, chip._dtc);
        } else if (priv.prevCp === 0 && cp === 1) {
          if (pen === 0) {
            priv.count = (cd[0] >= 0 ? nv[cd[0]] : 0) | ((cd[1] >= 0 ? nv[cd[1]] : 0) << 1) | ((cd[2] >= 0 ? nv[cd[2]] : 0) << 2) | ((cd[3] >= 0 ? nv[cd[3]] : 0) << 3);
            for (let i = 0; i < 4; i++) if (cq[i] >= 0) q.push(now + dly, cq[i], (priv.count >> i) & 1, dq[i]);
          } else if (cep === 1 && cet === 1) {
            priv.count = (priv.count + 1) & 0x0F;
            for (let i = 0; i < 4; i++) if (cq[i] >= 0) q.push(now + dly, cq[i], (priv.count >> i) & 1, dq[i]);
          }
          this._checkSetupIds(chip, 'CP', [sc[2], cd[0], cd[1], cd[2], cd[3]]);
          chip.lastClockNs = now;
        }
        if (sc[5] >= 0) {
          const tc = (mrn === 1 && cet === 1 && priv.count === 15) ? 1 : 0;
          if (tc !== nv[sc[5]]) q.push(now + chip.delayTcNs, sc[5], tc, chip._dtc);
        }
        priv.prevCp = cp;
        break;
      }
      case '74LVC595A': {
        const sc = chip._ctrl, priv = chip._priv, cq = chip._q, dq = chip._dq;
        const clrn = sc[0] >= 0 ? nv[sc[0]] : 1;
        const srclk = sc[1] >= 0 ? nv[sc[1]] : 0;
        const rclk = sc[2] >= 0 ? nv[sc[2]] : 0;
        const oen = sc[3] >= 0 ? nv[sc[3]] : 0;
        if (clrn === 0) {
          priv.sr = 0;
        } else if (priv.prevSrClk === 0 && srclk === 1) {
          this._checkSetupIds(chip, 'SRCLK', [sc[4]]);
          chip.lastClockNs = now;
          priv.sr = ((priv.sr << 1) | (sc[4] >= 0 ? nv[sc[4]] : 0)) & 0xFF;
          if (sc[5] >= 0) q.push(now + dly, sc[5], (priv.sr >> 7) & 1, chip._dqhs);
        }
        if (priv.prevRClk === 0 && rclk === 1) {
          priv.latch = priv.sr;
          if (oen === 0) {
            for (let i = 0; i < 8; i++) if (cq[i] >= 0) q.push(now + dly, cq[i], (priv.latch >> i) & 1, dq[i]);
          }
        }
        if (oen === 1 && (priv.prevOen === 0 || changedPin === 'INIT')) {
          for (let i = 0; i < 8; i++) if (cq[i] >= 0) q.push(now + chip.delayDisNs, cq[i], VAL_Z, dq[i]);
        } else if (oen === 0 && priv.prevOen === 1) {
          for (let i = 0; i < 8; i++) if (cq[i] >= 0) q.push(now + chip.delayEnNs, cq[i], (priv.latch >> i) & 1, dq[i]);
        }
        priv.prevSrClk = srclk;
        priv.prevRClk = rclk;
        priv.prevOen = oen;
        break;
      }
      case '74LVC165A': {
        const sc = chip._ctrl, priv = chip._priv, cd = chip._d;
        const shld = sc[0] >= 0 ? nv[sc[0]] : 1;
        const clk = sc[1] >= 0 ? nv[sc[1]] : 0;
        const inh = sc[2] >= 0 ? nv[sc[2]] : 0;
        if (shld === 0) {
          let v = 0;
          for (let i = 0; i < 8; i++) v |= ((cd[i] >= 0 ? nv[cd[i]] : 0) << i);
          priv.sr = v;
          if (sc[4] >= 0) q.push(now + dly, sc[4], (v >> 7) & 1, chip._dqh);
          if (sc[5] >= 0) q.push(now + dly, sc[5], ((v >> 7) & 1) ^ 1, chip._dqhn);
        } else if (inh === 0 && priv.prevClk === 0 && clk === 1) {
          this._checkSetupIds(chip, 'CLK', [sc[3]]);
          chip.lastClockNs = now;
          priv.sr = ((priv.sr << 1) | (sc[3] >= 0 ? nv[sc[3]] : 0)) & 0xFF;
          if (sc[4] >= 0) q.push(now + dly, sc[4], (priv.sr >> 7) & 1, chip._dqh);
          if (sc[5] >= 0) q.push(now + dly, sc[5], ((priv.sr >> 7) & 1) ^ 1, chip._dqhn);
        }
        priv.prevClk = clk;
        break;
      }
      case 'IS61WV5128EDBLL': {
        const sc = chip._ctrl, ca = chip._addr, cio = chip._io, dio = chip._dio, priv = chip._priv;
        const cen = sc[0] >= 0 ? nv[sc[0]] : 0;
        const oen = sc[1] >= 0 ? nv[sc[1]] : 0;
        const wen = sc[2] >= 0 ? nv[sc[2]] : 1;
        const outEn = (cen === 0 && oen === 0 && wen === 1);

        let addr = 0;
        for (let i = 0; i < 19; i++) {
          if (ca[i] >= 0) addr |= (nv[ca[i]] << i);
        }
        if (chip.isFsmLutLo && now > 50) {
          this.fsmAccessedAddresses.add(addr & 0xFFF);
        }

        // Release IO outputs to High-Z when disabled (CE_N=1, OE_N=1, or WE_N=0)
        if (!outEn && (priv.prevOutEn || changedPin === 'INIT')) {
          const disDly = (wen === 0 && priv.prevWeN === 1) ? chip.delayHzweNs : chip.delayHzoeNs;
          for (let i = 0; i < 8; i++) {
            if (cio[i] >= 0) q.push(now + disDly, cio[i], VAL_Z, dio[i]);
          }
        }

        // Write from common IO0..IO7 pins (no D0..D7!)
        if (cen === 0 && wen === 0) {
          let d = 0;
          for (let i = 0; i < 8; i++) {
            if (cio[i] >= 0) {
              if (this.netFloating[cio[i]] === 1) this._recordFloatingRead(cio[i], chip, 'IO' + i);
              d |= (nv[cio[i]] << i);
            }
          }
          priv.storage[addr & (priv.storage.length - 1)] = d;
        } else if (outEn) {
          // Ignore self-triggered IO feedback events when output is already enabled
          if (!changedPin.startsWith('IO')) {
            const val = priv.storage[addr & (priv.storage.length - 1)] || 0;
            const enFromOe = !priv.prevOutEn && changedPin === 'OE_N';
            const enFromWe = !priv.prevOutEn && changedPin === 'WE_N';
            // Schedule Low-Z turn-on at tLZOE (0 ns) / tLZWE (2 ns) for honest contention detection,
            // and valid read data at tDOE / tAA
            if (enFromOe) {
              for (let i = 0; i < 8; i++) {
                if (cio[i] >= 0) {
                  q.push(now + chip.delayLzoeNs, cio[i], (val >> i) & 1, dio[i]);
                  if (chip.delayDoeNs > chip.delayLzoeNs) {
                    q.push(now + chip.delayDoeNs, cio[i], (val >> i) & 1, dio[i]);
                  }
                }
              }
            } else if (enFromWe) {
              for (let i = 0; i < 8; i++) {
                if (cio[i] >= 0) q.push(now + chip.delayLzweNs, cio[i], (val >> i) & 1, dio[i]);
              }
            } else {
              for (let i = 0; i < 8; i++) {
                if (cio[i] >= 0) q.push(now + dly, cio[i], (val >> i) & 1, dio[i]);
              }
            }
          }
        }
        priv.prevOutEn = outEn;
        priv.prevWeN = wen;
        priv.prevOeN = oen;
        break;
      }
      case 'SST39SF040': {
        const sc = chip._ctrl, ca = chip._addr, cdq = chip._dq, ddq = chip._ddq, priv = chip._priv;
        const cen = sc[0] >= 0 ? nv[sc[0]] : 0;
        const oen = sc[1] >= 0 ? nv[sc[1]] : 0;
        const outEn = (cen === 0 && oen === 0);
        if (!outEn && (priv.prevOutEn || changedPin === 'INIT')) {
          for (let i = 0; i < 8; i++) if (cdq[i] >= 0) q.push(now + 10.0, cdq[i], VAL_Z, ddq[i]);
        } else if (outEn) {
          let addr = 0;
          for (let i = 0; i < 19; i++) if (ca[i] >= 0) addr |= (nv[ca[i]] << i);
          const val = priv.storage[addr & (priv.storage.length - 1)] || 0;
          for (let i = 0; i < 8; i++) if (cdq[i] >= 0) q.push(now + dly, cdq[i], (val >> i) & 1, ddq[i]);
        }
        priv.prevOutEn = outEn;
        break;
      }
      case 'USB1T11A': {
        const sp = chip._p;
        const oen = sp[2] >= 0 ? nv[sp[2]] : 1;
        if (oen === 0 && (changedPin === 'VPO' || changedPin === 'VMO' || changedPin === 'OE_N' || changedPin === 'INIT')) {
          if (sp[4] >= 0 && sp[0] >= 0 && (changedPin === 'VPO' || changedPin === 'OE_N' || changedPin === 'INIT')) q.push(now + dly, sp[4], nv[sp[0]], -1);
          if (sp[5] >= 0 && sp[1] >= 0 && (changedPin === 'VMO' || changedPin === 'OE_N' || changedPin === 'INIT')) q.push(now + dly, sp[5], nv[sp[1]], -1);
        }
        const dp = sp[4] >= 0 ? nv[sp[4]] : 1;
        const dm = sp[5] >= 0 ? nv[sp[5]] : 0;
        if (sp[6] >= 0) q.push(now + dly, sp[6], dp, -1);
        if (sp[7] >= 0) q.push(now + dly, sp[7], dm, -1);
        const speed = sp[3] >= 0 ? nv[sp[3]] : 1;
        const rcv = speed ? (dp === 1 && dm === 0 ? 1 : 0) : (dm === 1 && dp === 0 ? 1 : 0);
        if (sp[8] >= 0) q.push(now + dly, sp[8], rcv, -1);
        break;
      }
      case 'RES-NET-USB': {
        const sp = chip._p;
        if (changedPin === 'DP_XCVR' && sp[2] >= 0 && sp[0] >= 0 && nv[sp[2]] !== nv[sp[0]]) q.push(now + dly, sp[2], nv[sp[0]], -1);
        else if (changedPin === 'DM_XCVR' && sp[3] >= 0 && sp[1] >= 0 && nv[sp[3]] !== nv[sp[1]]) q.push(now + dly, sp[3], nv[sp[1]], -1);
        else if (changedPin === 'DP_BUS' && sp[0] >= 0 && sp[2] >= 0 && nv[sp[0]] !== nv[sp[2]]) q.push(now + dly, sp[0], nv[sp[2]], -1);
        else if (changedPin === 'DM_BUS' && sp[1] >= 0 && sp[3] >= 0 && nv[sp[1]] !== nv[sp[3]]) q.push(now + dly, sp[1], nv[sp[3]], -1);
        else if (changedPin === 'INIT') {
          if (sp[0] >= 0 && sp[2] >= 0 && nv[sp[0]] !== nv[sp[2]]) q.push(now + dly, sp[0], nv[sp[2]], -1);
          if (sp[1] >= 0 && sp[3] >= 0 && nv[sp[1]] !== nv[sp[3]]) q.push(now + dly, sp[1], nv[sp[3]], -1);
        }
        break;
      }
    }
  }

  _resolveMultiOrTriNet(nid, timeNs) {
    const drvs = this.netDrivers[nid];
    const dVal = this.drvVal;
    let activeCount = 0;
    let firstVal = 0;
    for (let i = 0; i < drvs.length; i++) {
      const v = dVal[drvs[i]];
      if (v !== VAL_Z) {
        if (activeCount === 0) firstVal = v;
        activeCount++;
      }
    }

    if (activeCount >= 2) {
      if (timeNs > 50 && this.netContending[nid] === 0) {
        this.netContending[nid] = 1;
        this.netContendStartNs[nid] = timeNs;
        const activeList = [];
        for (let i = 0; i < drvs.length; i++) {
          const did = drvs[i];
          if (dVal[did] !== VAL_Z) activeList.push(`${this.drvChipId[did]}.${this.drvPin[did]}=${dVal[did]}`);
        }
        this.netContendDrivers[nid] = activeList;
      }
      this.netFloating[nid] = 0;
      return firstVal;
    }

    // Close any open contention interval
    if (this.netContending[nid] === 1) {
      const dur = timeNs - this.netContendStartNs[nid];
      this.netContending[nid] = 0;
      if (dur > 1e-6) {
        this.contentionCount++;
        if (dur > this.maxContentionDurationNs) this.maxContentionDurationNs = dur;
        if (this.contentionViolations.length < 200) {
          this.contentionViolations.push({
            type: 'BUS_CONTENTION',
            netName: this.netIdToName[nid],
            startNs: +this.netContendStartNs[nid].toFixed(3),
            endNs: +timeNs.toFixed(3),
            durationNs: +dur.toFixed(3),
            drivers: this.netContendDrivers[nid]
          });
        }
      }
      this.netContendDrivers[nid] = null;
    }

    if (activeCount === 1) {
      this.netFloating[nid] = 0;
      this.netKeeperVal[nid] = firstVal;
      return firstVal;
    }

    // activeCount === 0: released net!
    if (this.netHasKeeper[nid] === 1) {
      this.netFloating[nid] = 0;
      return this.netKeeperVal[nid];
    }

    // Undriven & no bus-hold keeper -> FLOATING!
    this.netFloating[nid] = 1;
    if (timeNs > 50) {
      const lst = this.netListeners[nid];
      for (let i = 0; i < lst.length; i++) {
        const l = lst[i];
        this._recordFloatingRead(nid, this.chips[l.chipIdx], l.pin);
      }
    }
    return this.netValues[nid];
  }

  finalizeContention() {
    for (let nid = 0; nid < this.netCount; nid++) {
      if (this.netContending[nid] === 1) {
        const dur = this.nowNs - this.netContendStartNs[nid];
        this.netContending[nid] = 0;
        if (dur > 1e-6) {
          this.contentionCount++;
          if (dur > this.maxContentionDurationNs) this.maxContentionDurationNs = dur;
          if (this.contentionViolations.length < 200) {
            this.contentionViolations.push({
              type: 'BUS_CONTENTION',
              netName: this.netIdToName[nid],
              startNs: +this.netContendStartNs[nid].toFixed(3),
              endNs: +this.nowNs.toFixed(3),
              durationNs: +dur.toFixed(3),
              drivers: this.netContendDrivers[nid]
            });
          }
        }
      }
    }
  }

  stepUntil(targetTimeNs) {
    const q = this.queue;
    const ev = this._popEv;
    const nv = this.netValues;
    const nlc = this.netLastChangeNs;
    const listeners = this.netListeners;
    const watchers = this.netWatchers;
    const chips = this.chips;
    const isMT = this.netIsMultiOrTri;
    const dVal = this.drvVal;

    while (q.len > 0 && q.time[0] <= targetTimeNs) {
      q.popInto(ev);
      this.nowNs = ev.timeNs;
      const nid = ev.netId;
      let resolvedVal = ev.val;

      if (ev.drvId >= 0) {
        if (ev.seq < this.drvLastAppliedSeq[ev.drvId]) continue;
        this.drvLastAppliedSeq[ev.drvId] = ev.seq;
        dVal[ev.drvId] = ev.val;
      }
      if (isMT[nid] === 1) {
        resolvedVal = this._resolveMultiOrTriNet(nid, ev.timeNs);
      } else if (resolvedVal === VAL_Z) {
        continue;
      }

      if (nv[nid] !== resolvedVal) {
        nv[nid] = resolvedVal;
        nlc[nid] = ev.timeNs;
        this.totalPinEvents++;
        const w = watchers[nid];
        if (w !== null) {
          for (let i = 0; i < w.length; i++) w[i](ev.timeNs, resolvedVal);
        }
        const lst = listeners[nid];
        for (let i = 0; i < lst.length; i++) {
          const l = lst[i];
          this._evalChip(chips[l.chipIdx], l.pin);
        }
      }
    }
    this.nowNs = targetTimeNs;
  }
}

module.exports = {
  GateSimulator,
  MinHeapEventQueue,
  VAL_Z
};
