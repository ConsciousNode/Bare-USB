/**
 * Bare USB — Static Timing Analyzer (`src/sta.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Analyzes all CLK_48M -> CLK_48M synchronous paths in the gate-level netlist
 * at min, typ, and max datasheet delay corners against T = 20.781 ns (48.120 MHz, +0.25%).
 *
 * Includes:
 * 1. Declared asynchronous bus-input synchronizer endpoints (verified 2-flop synchronizers).
 * 2. Declared N=4 multicycle paths (ACTIVE_EN / TX_BIT_EN / RX_SAMPLE_EN gated bit-rate paths,
 *    checked against N * 20.781 ns - t_su and dynamically verified in run-tests.js).
 */

'use strict';

const { PARTS_CATALOG } = require('./parts-library');

const COMB_PIN_DEPS = {
  '74LVC04A':  { '1Y': ['1A'], '2Y': ['2A'], '3Y': ['3A'], '4Y': ['4A'], '5Y': ['5A'], '6Y': ['6A'] },
  '74LVC08A':  { '1Y': ['1A', '1B'], '2Y': ['2A', '2B'], '3Y': ['3A', '3B'], '4Y': ['4A', '4B'] },
  '74LVC32A':  { '1Y': ['1A', '1B'], '2Y': ['2A', '2B'], '3Y': ['3A', '3B'], '4Y': ['4A', '4B'] },
  '74LVC86A':  { '1Y': ['1A', '1B'], '2Y': ['2A', '2B'], '3Y': ['3A', '3B'], '4Y': ['4A', '4B'] },
  '74LVC157A': {
    '1Y': ['S', 'G_N', '1I0', '1I1'],
    '2Y': ['S', 'G_N', '2I0', '2I1'],
    '3Y': ['S', 'G_N', '3I0', '3I1'],
    '4Y': ['S', 'G_N', '4I0', '4I1']
  },
  '74LVC138A': {
    'Y0_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y1_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y2_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y3_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y4_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y5_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y6_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N'],
    'Y7_N': ['A', 'B', 'C', 'G1', 'G2A_N', 'G2B_N']
  }
};

// Explicitly declared asynchronous D+/D- bus-input synchronizer endpoints (2-flop synchronizers)
const ASYNC_INPUT_ENDPOINTS = [
  { chipId: 'U04_DPLL_EDGE_FF', pin: '1D', net: 'RCV_IN', stage1Out: 'RCV_D1', stage2Chip: 'U04_DPLL_EDGE_FF', stage2Pin: '2D', stage2Out: 'RCV_D2', reason: 'Asynchronous differential USB RCV input from USB1T11A' },
  { chipId: 'U200_BUS_SYNC_FF', pin: '1D', net: 'DP_IN',  stage1Out: 'DP_SYNC_1', stage2Chip: 'U219_BUS_SYNC_FF2', stage2Pin: '1D', stage2Out: 'DP_SYNC', reason: 'Asynchronous single-ended D+ input from USB1T11A VP' },
  { chipId: 'U200_BUS_SYNC_FF', pin: '2D', net: 'DM_IN',  stage1Out: 'DM_SYNC_1', stage2Chip: 'U219_BUS_SYNC_FF2', stage2Pin: '2D', stage2Out: 'DM_SYNC', reason: 'Asynchronous single-ended D- input from USB1T11A VM' }
];

// Declared N=4 multicycle path (MCP) groups: source registers change ONLY on their declared bit-rate enable
// (every 4 CLK_48M cycles at FS = 83.124 ns, every 32 at LS = 665.0 ns), verified dynamically in run-tests.js.
const DECLARED_MCP_SOURCES = [
  { chipId: 'U34_FSM_STATE',      enableNet: 'ACTIVE_EN',      N: 4, qNets: ['CUR_S0','CUR_S1','CUR_S2','CUR_S3','LAT_T0','LAT_T1','LAT_START','LAT_BDONE'] },
  { chipId: 'U22_BIT_CNT',        enableNet: 'ACTIVE_EN',      N: 4, qNets: ['BIT_Q0','BIT_Q1','BIT_Q2'] },
  { chipId: 'U76_LEN_CNT_LO',     enableNet: 'ACTIVE_EN',      N: 4, qNets: ['BCNT0','BCNT1','BCNT2','BCNT3'] },
  { chipId: 'U77_LEN_CNT_HI',     enableNet: 'ACTIVE_EN',      N: 4, qNets: ['BCNT4','BCNT5','BCNT6','BCNT7'] },
  { chipId: 'U73_EOP_CNT',        enableNet: 'TX_BIT_EN',      N: 4, qNets: ['EOP_Q0','EOP_Q1','EOP_Q2','EOP_Q3'] },
  { chipId: 'U11_STUFF_CNT',      enableNet: 'ACTIVE_EN|!STUFF_RST_N',      N: 4, qNets: ['STUFF_Q0','STUFF_Q1','STUFF_Q2','STUFF_Q3'] },
  { chipId: 'U08_NRZI_FF.1',      enableNet: 'TX_BIT_EN',      N: 4, qNets: ['NRZI_TX_Q','NRZI_TX_Q_N'] },
  { chipId: 'U08_NRZI_FF.2',      enableNet: 'RX_SAMPLE_EN',   N: 4, qNets: ['NRZI_RX_PREV','NRZI_RX_PREV_N'] },
  { chipId: 'U21_RX_SR',          enableNet: 'RX_SAMPLE_EN',   N: 4, qNets: ['RX_D0','RX_D1','RX_D2','RX_D3','RX_D4','RX_D5','RX_D6','RX_D7'] },
  { chipId: 'U92_LAST_PID_REG',   enableNet: 'RX_SAMPLE_EN',   N: 4, qNets: ['LAST_PID0','LAST_PID1','LAST_PID2','LAST_PID3','LAST_PID_VAL','LAST_PID_DAT','LAST_PID_HS','TOGGLE_OK_LAT'] },
  { chipId: 'U93_TX_BYTE_LAT',    enableNet: 'TX_BIT_EN',      N: 4, qNets: ['TX_LAT0','TX_LAT1','TX_LAT2','TX_LAT3','TX_LAT4','TX_LAT5','TX_LAT6','TX_LAT7'] },
  { chipId: 'U97_RDLEN_D1',       enableNet: 'ACTIVE_EN',      N: 4, qNets: ['RDL1_0','RDL1_1','RDL1_2','RDL1_3','RDL1_4','RDL1_5','RDL1_6','RDL1_7'] },
  { chipId: 'U98_RDLEN_D2',       enableNet: 'ACTIVE_EN',      N: 4, qNets: ['RDLEN0','RDLEN1','RDLEN2','RDLEN3','RDLEN4','RDLEN5','RDLEN6','RDLEN7'] },
  { chipId: 'U23_TURN_CNT_LO',    enableNet: 'TX_BIT_EN|!CTRL_TURN_EN',      N: 4, qNets: ['TURN_Q0','TURN_Q1','TURN_Q2','TURN_Q3'] },
  { chipId: 'U24_TURN_CNT_HI',    enableNet: 'TX_BIT_EN|!CTRL_TURN_EN',      N: 4, qNets: ['TURN_Q4','TURN_Q5','TURN_Q6','TURN_Q7'] },
  { chipId: 'U59_ACK_DLY_CNT',    enableNet: 'TX_BIT_EN',      N: 4, qNets: ['ACK_DLY_Q0','ACK_DLY_Q1','ACK_DLY_Q2','ACK_DLY_Q3'] },
  { chipId: 'U115_ACK_PHASE_CNT', enableNet: 'TX_BIT_EN',      N: 4, qNets: ['ACK_P0','ACK_P1','ACK_P2','ACK_P3'] },
  { chipId: 'U121_STUFF_LAT_FF.1',enableNet: 'TX_BIT_EN',      N: 4, qNets: ['IS_EOP_PIPE'] },
  { chipId: 'U121_STUFF_LAT_FF.2',enableNet: 'RX_SAMPLE_EN',   N: 4, qNets: ['LAT_PID_NOW'] },
  { chipId: 'U13_CRC5_FF0',       enableNet: 'CRC5_EN_D1|CRC5_INIT',     N: 4, qNets: ['CRC5_Q0','CRC5_Q1'] },
  { chipId: 'U14_CRC5_FF1',       enableNet: 'CRC5_EN_D1|CRC5_INIT',     N: 4, qNets: ['CRC5_Q2','CRC5_Q3'] },
  { chipId: 'U15_CRC5_FF2.1',     enableNet: 'CRC5_EN_D1|CRC5_INIT',     N: 4, qNets: ['CRC5_Q4'] },
  { chipId: 'U15_CRC5_FF2.2',     enableNet: 'RX_SAMPLE_EN',   N: 4, qNets: ['SE0_PREV'] },
  { chipId: 'U17_CRC16_LO',       enableNet: 'CRC16_EN_D1|CRC16_INIT',    N: 4, qNets: ['CRC16_Q0','CRC16_Q1','CRC16_Q2','CRC16_Q3','CRC16_Q4','CRC16_Q5','CRC16_Q6','CRC16_Q7'] },
  { chipId: 'U18_CRC16_HI',       enableNet: 'CRC16_EN_D1|CRC16_INIT',    N: 4, qNets: ['CRC16_Q8','CRC16_Q9','CRC16_Q10','CRC16_Q11','CRC16_Q12','CRC16_Q13','CRC16_Q14','CRC16_Q15'] }
];

// Endpoints whose capture is gated on the 4-cycle bit-rate enable (ACTIVE_EN / TX_BIT_EN / RX_SAMPLE_EN / CRC*_EN_D1)
const DECLARED_MCP_ENDPOINT_CHIPS = new Set([
  'U08_NRZI_FF', 'U11_STUFF_CNT', 'U208_CRC_FB_FF', 'U22_BIT_CNT', 'U34_FSM_STATE',
  'U216_FSM_LUT_REG', 'U139_ERR_LAT_FF', 'U115_ACK_PHASE_CNT', 'U97_RDLEN_D1', 'U98_RDLEN_D2',
  'U76_LEN_CNT_LO', 'U77_LEN_CNT_HI', 'U13_CRC5_FF0', 'U14_CRC5_FF1', 'U15_CRC5_FF2',
  'U17_CRC16_LO', 'U18_CRC16_HI', 'U73_EOP_CNT', 'U93_TX_BYTE_LAT', 'U121_STUFF_LAT_FF',
  'U207_CRC_EN_PIPE_FF', 'U210_CRC5_EN_PIPE_FF', 'U92_LAST_PID_REG', 'U59_ACK_DLY_CNT',
  'U209_CRC_CHK_PIPE_FF', 'U21_RX_SR', 'U140_ERR_LAT_FF2', 'U211_NOT_CRC_OUT_D1'
]);

function getPartDelay(type, corner, isTc = false) {
  const spec = PARTS_CATALOG[type];
  if (!spec) return 0;
  const min = isTc && spec.tpdTcMinNs != null ? spec.tpdTcMinNs : spec.tpdMinNs;
  const max = isTc && spec.tpdTcMaxNs != null ? spec.tpdTcMaxNs : spec.tpdMaxNs;
  if (corner === 'min') return min;
  if (corner === 'typ') return (min + max) * 0.5;
  return max;
}

function verifyTwoFlopSynchronizers(sim) {
  const chipById = new Map(sim.chips.map(c => [c.id, c]));
  return ASYNC_INPUT_ENDPOINTS.map(a => {
    const c1 = chipById.get(a.chipId);
    const c2 = chipById.get(a.stage2Chip);
    const ok1 = !!(c1 && c1.pinMap && c1.pinMap[a.pin] === a.net && (c1.pinMap['1Q'] === a.stage1Out || c1.pinMap['2Q'] === a.stage1Out));
    const ok2 = !!(c2 && c2.pinMap && c2.pinMap[a.stage2Pin] === a.stage1Out && (c2.pinMap['1Q'] === a.stage2Out || c2.pinMap['2Q'] === a.stage2Out));
    return { ...a, verifiedTwoFlop: ok1 && ok2 };
  });
}

function analyzeStaticTiming(sim, { corner = 'max', periodNs = 20.781 } = {}) {
  const asyncCheck = verifyTwoFlopSynchronizers(sim);
  const asyncSet = new Set(ASYNC_INPUT_ENDPOINTS.map(a => `${a.chipId}.${a.pin}`));

  const arrival = new Map();
  const prevArc = new Map();
  const endpoints = [];
  const combEdges = [];

  for (const chip of sim.chips) {
    const pm = chip.pinMap || {};
    const t = chip.type;
    const spec = PARTS_CATALOG[t];

    if (t === '74LVC574A' && pm.CLK === 'CLK_48M') {
      const cq = getPartDelay(t, corner);
      for (let i = 0; i < 8; i++) {
        const qn = pm['Q' + i];
        if (qn && qn !== 'VCC' && qn !== 'GND') {
          if (!arrival.has(qn) || cq > arrival.get(qn)) {
            arrival.set(qn, cq);
            prevArc.set(qn, { src: null, chipId: chip.id, type: t, delay: cq });
          }
        }
        const dn = pm['D' + i];
        if (dn && dn !== 'VCC' && dn !== 'GND') {
          endpoints.push({ chipId: chip.id, type: t, pin: 'D' + i, net: dn, tSetupNs: spec.tSetupNs || 2.0 });
        }
      }
      continue;
    }

    if (t === '74LVC74A') {
      const cq = getPartDelay(t, corner);
      for (const h of ['1', '2']) {
        if (pm[h + 'CLK'] === 'CLK_48M') {
          for (const qp of [h + 'Q', h + 'Q_N']) {
            const qn = pm[qp];
            if (qn && qn !== 'VCC' && qn !== 'GND') {
              if (!arrival.has(qn) || cq > arrival.get(qn)) {
                arrival.set(qn, cq);
                prevArc.set(qn, { src: null, chipId: chip.id, type: t, delay: cq });
              }
            }
          }
          const dn = pm[h + 'D'];
          if (dn && dn !== 'VCC' && dn !== 'GND' && !asyncSet.has(`${chip.id}.${h}D`)) {
            endpoints.push({ chipId: chip.id, type: t, pin: h + 'D', net: dn, tSetupNs: spec.tSetupNs || 2.0 });
          }
        }
      }
      continue;
    }

    if (t === '74LVC161' && pm.CP === 'CLK_48M') {
      const cq = getPartDelay(t, corner);
      const tc = getPartDelay(t, corner, true);
      for (let i = 0; i < 4; i++) {
        const qn = pm['Q' + i];
        if (qn && qn !== 'VCC' && qn !== 'GND') {
          if (!arrival.has(qn) || cq > arrival.get(qn)) {
            arrival.set(qn, cq);
            prevArc.set(qn, { src: null, chipId: chip.id, type: t, delay: cq });
          }
        }
      }
      if (pm.TC && pm.TC !== 'VCC' && pm.TC !== 'GND') {
        if (!arrival.has(pm.TC) || tc > arrival.get(pm.TC)) {
          arrival.set(pm.TC, tc);
          prevArc.set(pm.TC, { src: null, chipId: chip.id, type: t, delay: tc });
        }
        if (pm.CET && pm.CET !== 'VCC' && pm.CET !== 'GND') {
          combEdges.push({ inNet: pm.CET, outNet: pm.TC, delay: tc, chipId: chip.id, type: t + '(CET->TC)' });
        }
      }
      for (const ep of ['PE_N', 'CEP', 'CET', 'D0', 'D1', 'D2', 'D3']) {
        const dn = pm[ep];
        if (dn && dn !== 'VCC' && dn !== 'GND') {
          endpoints.push({ chipId: chip.id, type: t, pin: ep, net: dn, tSetupNs: spec.tSetupNs || 2.5 });
        }
      }
      continue;
    }

    if (COMB_PIN_DEPS[t]) {
      const dly = getPartDelay(t, corner);
      for (const [outPin, inPins] of Object.entries(COMB_PIN_DEPS[t])) {
        const outNet = pm[outPin];
        if (!outNet || outNet === 'VCC' || outNet === 'GND') continue;
        for (const inPin of inPins) {
          const inNet = pm[inPin];
          if (!inNet || inNet === 'VCC' || inNet === 'GND') continue;
          combEdges.push({ inNet, outNet, delay: dly, chipId: chip.id, type: t });
        }
      }
      continue;
    }

    if (t === 'IS61WV5128EDBLL' && pm.WE_N === 'VCC') {
      const dly = getPartDelay(t, corner);
      const addrNets = [];
      for (let i = 0; i < 19; i++) {
        const an = pm['A' + i];
        if (an && an !== 'VCC' && an !== 'GND') addrNets.push(an);
      }
      for (let i = 0; i < 8; i++) {
        const outNet = pm['IO' + i];
        if (!outNet || outNet === 'VCC' || outNet === 'GND') continue;
        for (const inNet of addrNets) {
          combEdges.push({ inNet, outNet, delay: dly, chipId: chip.id, type: t });
        }
      }
    }
  }

  for (let iter = 0; iter < 40; iter++) {
    let changed = false;
    for (const e of combEdges) {
      if (!arrival.has(e.inNet)) continue;
      const cand = arrival.get(e.inNet) + e.delay;
      const cur = arrival.has(e.outNet) ? arrival.get(e.outNet) : -1;
      if (cand > cur + 1e-9) {
        arrival.set(e.outNet, cand);
        prevArc.set(e.outNet, { src: e.inNet, chipId: e.chipId, type: e.type, delay: e.delay });
        changed = true;
      }
    }
    if (!changed) break;
  }

  function traceSourceAndPath(net) {
    const chain = [];
    const seen = new Set();
    let cur = net;
    let srcChip = null;
    while (cur && !seen.has(cur) && chain.length < 30) {
      seen.add(cur);
      const arc = prevArc.get(cur);
      if (!arc) break;
      srcChip = arc.chipId;
      chain.push(`${arc.chipId}(${cur}:${arc.delay.toFixed(1)}ns)`);
      cur = arc.src;
    }
    return { srcChip, path: chain.reverse().join(' -> ') };
  }

  const results = [];
  const mcpTable = [];
  let failingEndpoints = 0;
  let failingSingleCycle = 0;
  let worstArrivalNs = 0;
  let worstSlackNs = Infinity;
  let worstSingleCycleSlackNs = Infinity;

  for (const ep of endpoints) {
    if (!arrival.has(ep.net)) continue;
    const arr = arrival.get(ep.net);
    const isMcp = DECLARED_MCP_ENDPOINT_CHIPS.has(ep.chipId);
    const N = isMcp ? 4 : 1;
    const req = N * periodNs - ep.tSetupNs;
    const slack = req - arr;
    const req1 = periodNs - ep.tSetupNs;
    const slack1 = req1 - arr;

    if (arr > worstArrivalNs) worstArrivalNs = arr;
    if (slack < worstSlackNs) worstSlackNs = slack;
    if (!isMcp && slack1 < worstSingleCycleSlackNs) worstSingleCycleSlackNs = slack1;

    const failed = slack < -1e-6;
    if (failed) failingEndpoints++;
    if (slack1 < -1e-6) failingSingleCycle++;

    const tr = traceSourceAndPath(ep.net);
    if (isMcp && arr > req1) {
      mcpTable.push({
        source: tr.srcChip,
        endpoint: `${ep.chipId}.${ep.pin} (${ep.net})`,
        enable: 'ACTIVE_EN (4x FS / 32x LS)',
        N,
        arrivalNs: +arr.toFixed(3),
        limitNs: +req.toFixed(3),
        slackNs: +slack.toFixed(3),
        passed: !failed
      });
    }
    results.push({
      endpoint: `${ep.chipId}.${ep.pin} (${ep.net})`,
      N,
      arrivalNs: +arr.toFixed(3),
      requiredNs: +req.toFixed(3),
      slackNs: +slack.toFixed(3),
      failed,
      path: failed ? tr.path : null
    });
  }

  results.sort((a, b) => a.slackNs - b.slackNs);
  mcpTable.sort((a, b) => a.slackNs - b.slackNs);

  return {
    corner,
    periodNs,
    passed: failingEndpoints === 0 && asyncCheck.every(a => a.verifiedTwoFlop),
    totalEndpoints: results.length,
    failingEndpoints,
    failingSingleCycleWithoutMcp: failingSingleCycle,
    worstArrivalNs: +worstArrivalNs.toFixed(3),
    worstSlackNs: Number.isFinite(worstSlackNs) ? +worstSlackNs.toFixed(3) : null,
    worstSingleCycleSlackNs: Number.isFinite(worstSingleCycleSlackNs) ? +worstSingleCycleSlackNs.toFixed(3) : null,
    asyncInputEndpoints: asyncCheck,
    declaredMcpCount: mcpTable.length,
    declaredMcpTable: mcpTable.slice(0, 20),
    topFailingPaths: results.filter(r => r.failed).slice(0, 8)
  };
}

module.exports = {
  ASYNC_INPUT_ENDPOINTS,
  DECLARED_MCP_SOURCES,
  DECLARED_MCP_ENDPOINT_CHIPS,
  analyzeStaticTiming
};
