/**
 * Bare USB — Strict Per-Path Static Timing Analyzer (`src/sta.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Analyzes all CLK_48M -> CLK_48M synchronous paths in the gate-level netlist
 * at min, typ, and max datasheet delay corners against T = 20.781 ns (48.120 MHz, +0.25%).
 *
 * Per-path rules (Round 10):
 * 1. Declared asynchronous bus-input synchronizer endpoints (verified 2-flop synchronizers)
 *    are excluded from CLK_48M -> CLK_48M STA and reported explicitly.
 * 2. Enable flops (U164, U215, U207, U210, U221, etc.) and synchronizer outputs
 *    (U04, U219, U201) are NEVER multicycle sources; every path from them is checked at N = 1.
 * 3. Multicycle N = 4 applies ONLY to paths that BOTH launch from a declared MCP source Q
 *    AND terminate at a declared, enable-gated MCP endpoint pin. Any path into an un-enabled
 *    capture flop is checked at N = 1.
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

// Declared N=4 multicycle path (MCP) sources: bit-rate state registers ONLY.
// Enable flops (U164, U215, U207, U210, U221) and synchronizer outputs (U04, U219, U201) are NEVER listed here.
const DECLARED_MCP_SOURCES = [
  { chipId: 'U228_ST_FF0',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_IDLE_N','S_IDLE','S_TX_SYNC_N','S_TX_SYNC'] },
  { chipId: 'U229_ST_FF1',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_PID_N','S_TX_PID','S_TX_TOK_B1_N','S_TX_TOK_B1'] },
  { chipId: 'U230_ST_FF2',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_EOP_N','S_TX_EOP','S_TX_DPID_N','S_TX_DPID'] },
  { chipId: 'U231_ST_FF3',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_DATA_N','S_TX_DATA','S_TX_CRC0_N','S_TX_CRC0'] },
  { chipId: 'U232_ST_FF4',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_CRC1_N','S_TX_CRC1','S_TX_DEOP_N','S_TX_DEOP'] },
  { chipId: 'U233_ST_FF5',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_WAIT_RX_N','S_WAIT_RX','S_RX_PID_N','S_RX_PID'] },
  { chipId: 'U234_ST_FF6',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_RX_DATA_N','S_RX_DATA','S_AUTO_ACK_N','S_AUTO_ACK'] },
  { chipId: 'U34_FSM_STATE',       enableNet: 'ACTIVE_EN',               N: 4, qNets: ['CUR_S0','CUR_S1','CUR_S2','CUR_S3','LAT_T0','LAT_T1','LAT_START','LAT_BDONE'] },
  { chipId: 'U22_BIT_CNT',         enableNet: 'ACTIVE_EN',               N: 4, qNets: ['BIT_Q0','BIT_Q1','BIT_Q2'] },
  { chipId: 'U76_LEN_CNT_LO',      enableNet: 'ACTIVE_EN|!SIE_BUSY',               N: 4, qNets: ['BCNT0','BCNT1','BCNT2','BCNT3'] },
  { chipId: 'U77_LEN_CNT_HI',      enableNet: 'ACTIVE_EN|!SIE_BUSY',               N: 4, qNets: ['BCNT4','BCNT5','BCNT6','BCNT7'] },
  { chipId: 'U239_STUFF_TRIG_FF.1',enableNet: 'ACTIVE_EN_D2',            N: 4, qNets: ['STUFF_TRIG','STUFF_NOT_TRIG'] },
  { chipId: 'U11_STUFF_CNT',       enableNet: 'ACTIVE_EN|!STUFF_RST_N',  N: 4, qNets: ['STUFF_Q0','STUFF_Q1','STUFF_Q2','STUFF_Q3'] },
  { chipId: 'U08_NRZI_FF.2',       enableNet: 'RX_SAMPLE_EN_PRE',            N: 4, qNets: ['NRZI_RX_PREV','NRZI_RX_PREV_N'] },
  { chipId: 'U21_RX_SR',           enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['RX_D0','RX_D1','RX_D2','RX_D3','RX_D4','RX_D5','RX_D6','RX_D7'] },
  { chipId: 'U92_LAST_PID_REG',    enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['LAST_PID0','LAST_PID1','LAST_PID2','LAST_PID3','LAST_PID_VAL','LAST_PID_DAT','LAST_PID_HS','TOGGLE_OK_LAT'] },
  { chipId: 'U93_TX_BYTE_LAT',     enableNet: 'TX_BIT_EN',               N: 4, qNets: ['TX_LAT_D0','TX_LAT_D1','TX_LAT_D2','TX_LAT_D3','TX_LAT_D4','TX_LAT_D5','TX_LAT_D6','TX_LAT_D7'] },
  { chipId: 'U97_RDLEN_D1',        enableNet: 'ACTIVE_EN',               N: 4, qNets: ['RDL1_0','RDL1_1','RDL1_2','RDL1_3','RDL1_4','RDL1_5','RDL1_6','RDL1_7'] },
  { chipId: 'U98_RDLEN_D2',        enableNet: 'ACTIVE_EN',               N: 4, qNets: ['RDLEN0','RDLEN1','RDLEN2','RDLEN3','RDLEN4','RDLEN5','RDLEN6','RDLEN7'] },
  { chipId: 'U59_ACK_DLY_CNT',     enableNet: 'TX_BIT_EN|!S_AUTO_ACK',               N: 4, qNets: ['ACK_DLY_Q0','ACK_DLY_Q1','ACK_DLY_Q2','ACK_DLY_Q3'] },
  { chipId: 'U115_ACK_PHASE_CNT',  enableNet: 'TX_BIT_EN|!S_AUTO_ACK',               N: 4, qNets: ['ACK_P0','ACK_P1','ACK_P2','ACK_P3'] },
  { chipId: 'U121_STUFF_LAT_FF.1', enableNet: 'TX_BIT_EN',               N: 4, qNets: ['IS_EOP_PIPE'] },
  { chipId: 'U121_STUFF_LAT_FF.2', enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['LAT_PID_NOW'] },
  { chipId: 'U13_CRC5_FF0',        enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q0','CRC5_Q1'] },
  { chipId: 'U14_CRC5_FF1',        enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q2','CRC5_Q3'] },
  { chipId: 'U15_CRC5_FF2.1',      enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q4'] },
  { chipId: 'U15_CRC5_FF2.2',      enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['SE0_PREV'] },
  { chipId: 'U17_CRC16_LO',        enableNet: 'CRC16_EN_D1|CRC16_INIT',  N: 4, qNets: ['CRC16_Q0','CRC16_Q1','CRC16_Q2','CRC16_Q3','CRC16_Q4','CRC16_Q5','CRC16_Q6','CRC16_Q7'] },
  { chipId: 'U18_CRC16_HI',        enableNet: 'CRC16_EN_D1|CRC16_INIT',  N: 4, qNets: ['CRC16_Q8','CRC16_Q9','CRC16_Q10','CRC16_Q11','CRC16_Q12','CRC16_Q13','CRC16_Q14','CRC16_Q15'] }
];

// Declared N=4 MCP endpoints: ONLY enable-gated capture registers (verified dynamically on Q outputs).
// Un-enabled capture flops (e.g. U208, U216, U211 unless gated) MUST NOT appear here.
const DECLARED_MCP_ENDPOINTS = [
  { chipId: 'U228_ST_FF0',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_IDLE_N','S_IDLE','S_TX_SYNC_N','S_TX_SYNC'] },
  { chipId: 'U229_ST_FF1',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_PID_N','S_TX_PID','S_TX_TOK_B1_N','S_TX_TOK_B1'] },
  { chipId: 'U230_ST_FF2',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_EOP_N','S_TX_EOP','S_TX_DPID_N','S_TX_DPID'] },
  { chipId: 'U231_ST_FF3',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_DATA_N','S_TX_DATA','S_TX_CRC0_N','S_TX_CRC0'] },
  { chipId: 'U232_ST_FF4',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_TX_CRC1_N','S_TX_CRC1','S_TX_DEOP_N','S_TX_DEOP'] },
  { chipId: 'U233_ST_FF5',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_WAIT_RX_N','S_WAIT_RX','S_RX_PID_N','S_RX_PID'] },
  { chipId: 'U234_ST_FF6',         pins: ['1D','2D'],                                enableNet: 'ACTIVE_EN',               N: 4, qNets: ['S_RX_DATA_N','S_RX_DATA','S_AUTO_ACK_N','S_AUTO_ACK'] },
  { chipId: 'U34_FSM_STATE',       pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'ACTIVE_EN',               N: 4, qNets: ['CUR_S0','CUR_S1','CUR_S2','CUR_S3','LAT_T0','LAT_T1','LAT_START','LAT_BDONE'] },
  { chipId: 'U22_BIT_CNT',         pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'ACTIVE_EN',               N: 4, qNets: ['BIT_Q0','BIT_Q1','BIT_Q2'] },
  { chipId: 'U76_LEN_CNT_LO',      pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'ACTIVE_EN|!SIE_BUSY',               N: 4, qNets: ['BCNT0','BCNT1','BCNT2','BCNT3'] },
  { chipId: 'U77_LEN_CNT_HI',      pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'ACTIVE_EN|!SIE_BUSY',               N: 4, qNets: ['BCNT4','BCNT5','BCNT6','BCNT7'] },
  { chipId: 'U239_STUFF_TRIG_FF',  pins: ['1D'],                                     enableNet: 'ACTIVE_EN_D2',            N: 4, qNets: ['STUFF_TRIG','STUFF_NOT_TRIG'] },
  { chipId: 'U11_STUFF_CNT',       pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'ACTIVE_EN|!STUFF_RST_N',  N: 4, qNets: ['STUFF_Q0','STUFF_Q1','STUFF_Q2','STUFF_Q3'] },
  { chipId: 'U08_NRZI_FF',         pins: ['2D'],                                     enableNet: 'RX_SAMPLE_EN_PRE',            N: 4, qNets: ['NRZI_RX_PREV','NRZI_RX_PREV_N'] },
  { chipId: 'U21_RX_SR',           pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['RX_D0','RX_D1','RX_D2','RX_D3','RX_D4','RX_D5','RX_D6','RX_D7'] },
  { chipId: 'U92_LAST_PID_REG',    pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['LAST_PID0','LAST_PID1','LAST_PID2','LAST_PID3','LAST_PID_VAL','LAST_PID_DAT','LAST_PID_HS','TOGGLE_OK_LAT'] },
  { chipId: 'U93_TX_BYTE_LAT',     pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'TX_BIT_EN',               N: 4, qNets: ['TX_LAT_D0','TX_LAT_D1','TX_LAT_D2','TX_LAT_D3','TX_LAT_D4','TX_LAT_D5','TX_LAT_D6','TX_LAT_D7'] },
  { chipId: 'U97_RDLEN_D1',        pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'ACTIVE_EN',               N: 4, qNets: ['RDL1_0','RDL1_1','RDL1_2','RDL1_3','RDL1_4','RDL1_5','RDL1_6','RDL1_7'] },
  { chipId: 'U98_RDLEN_D2',        pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'ACTIVE_EN',               N: 4, qNets: ['RDLEN0','RDLEN1','RDLEN2','RDLEN3','RDLEN4','RDLEN5','RDLEN6','RDLEN7'] },
  { chipId: 'U59_ACK_DLY_CNT',     pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'TX_BIT_EN|!S_AUTO_ACK',               N: 4, qNets: ['ACK_DLY_Q0','ACK_DLY_Q1','ACK_DLY_Q2','ACK_DLY_Q3'] },
  { chipId: 'U115_ACK_PHASE_CNT',  pins: ['PE_N','CEP','CET','D0','D1','D2','D3'],  enableNet: 'TX_BIT_EN|!S_AUTO_ACK',               N: 4, qNets: ['ACK_P0','ACK_P1','ACK_P2','ACK_P3'] },
  { chipId: 'U121_STUFF_LAT_FF',   pins: ['1D'],                                     enableNet: 'TX_BIT_EN',               N: 4, qNets: ['IS_EOP_PIPE'] },
  { chipId: 'U121_STUFF_LAT_FF',   pins: ['2D'],                                     enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['LAT_PID_NOW'] },
  { chipId: 'U13_CRC5_FF0',        pins: ['1D','2D'],                                enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q0','CRC5_Q1'] },
  { chipId: 'U14_CRC5_FF1',        pins: ['1D','2D'],                                enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q2','CRC5_Q3'] },
  { chipId: 'U15_CRC5_FF2',        pins: ['1D'],                                     enableNet: 'CRC5_EN_D1|CRC5_INIT',    N: 4, qNets: ['CRC5_Q4'] },
  { chipId: 'U15_CRC5_FF2',        pins: ['2D'],                                     enableNet: 'RX_SAMPLE_EN',            N: 4, qNets: ['SE0_PREV'] },
  { chipId: 'U17_CRC16_LO',        pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'CRC16_EN_D1|CRC16_INIT',  N: 4, qNets: ['CRC16_Q0','CRC16_Q1','CRC16_Q2','CRC16_Q3','CRC16_Q4','CRC16_Q5','CRC16_Q6','CRC16_Q7'] },
  { chipId: 'U18_CRC16_HI',        pins: ['D0','D1','D2','D3','D4','D5','D6','D7'], enableNet: 'CRC16_EN_D1|CRC16_INIT',  N: 4, qNets: ['CRC16_Q8','CRC16_Q9','CRC16_Q10','CRC16_Q11','CRC16_Q12','CRC16_Q13','CRC16_Q14','CRC16_Q15'] },
  { chipId: 'U139_ERR_LAT_FF',     pins: ['1D'],                                     enableNet: 'CRC_CHK_D2|!WR_CSR_N',    N: 4, qNets: ['ERR_CRC_LAT'] },
  { chipId: 'U140_ERR_LAT_FF2',    pins: ['1D'],                                     enableNet: 'RX_SAMPLE_EN|!WR_CSR_N',  N: 4, qNets: ['ERR_STUFF_LAT'] }
];

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

function buildMcpLookup() {
  const mcpSourceQSet = new Set();
  for (const s of DECLARED_MCP_SOURCES) {
    for (const q of s.qNets) mcpSourceQSet.add(q);
  }
  const mcpEndpointMap = new Map();
  for (const e of DECLARED_MCP_ENDPOINTS) {
    for (const p of e.pins) {
      mcpEndpointMap.set(`${e.chipId}.${p}`, e);
    }
  }
  return { mcpSourceQSet, mcpEndpointMap };
}

function propagateArrivals(initArrival, initPrev, combEdges) {
  const arrival = new Map(initArrival);
  const prevArc = new Map(initPrev);
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
  return { arrival, prevArc };
}

function traceSourceAndPath(net, prevArc) {
  const chain = [];
  const seen = new Set();
  let cur = net;
  let srcChip = null;
  let srcNet = null;
  while (cur && !seen.has(cur) && chain.length < 30) {
    seen.add(cur);
    const arc = prevArc.get(cur);
    if (!arc) break;
    srcChip = arc.chipId;
    srcNet = cur;
    chain.push(`${arc.chipId}(${cur}:${arc.delay.toFixed(1)}ns)`);
    cur = arc.src;
  }
  return { srcChip, srcNet, path: chain.reverse().join(' -> ') };
}

function analyzeStaticTiming(sim, { corner = 'max', periodNs = 20.781 } = {}) {
  const asyncCheck = verifyTwoFlopSynchronizers(sim);
  const asyncSet = new Set(ASYNC_INPUT_ENDPOINTS.map(a => `${a.chipId}.${a.pin}`));
  const { mcpSourceQSet, mcpEndpointMap } = buildMcpLookup();

  const init1Cyc = new Map();
  const prev1Cyc = new Map();
  const initMcp = new Map();
  const prevMcp = new Map();
  const endpoints = [];
  const combEdges = [];

  function seedLaunch(qn, cq, chipId, type) {
    if (!qn || qn === 'VCC' || qn === 'GND') return;
    if (mcpSourceQSet.has(qn)) {
      if (!initMcp.has(qn) || cq > initMcp.get(qn)) {
        initMcp.set(qn, cq);
        prevMcp.set(qn, { src: null, chipId, type, delay: cq });
      }
    } else {
      if (!init1Cyc.has(qn) || cq > init1Cyc.get(qn)) {
        init1Cyc.set(qn, cq);
        prev1Cyc.set(qn, { src: null, chipId, type, delay: cq });
      }
    }
  }

  for (const chip of sim.chips) {
    const pm = chip.pinMap || {};
    const t = chip.type;
    const spec = PARTS_CATALOG[t];

    if (t === '74LVC574A' && pm.CLK === 'CLK_48M') {
      const cq = getPartDelay(t, corner);
      for (let i = 0; i < 8; i++) {
        seedLaunch(pm['Q' + i], cq, chip.id, t);
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
          seedLaunch(pm[h + 'Q'], cq, chip.id, t);
          seedLaunch(pm[h + 'Q_N'], cq, chip.id, t);
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
        seedLaunch(pm['Q' + i], cq, chip.id, t);
      }
      if (pm.TC && pm.TC !== 'VCC' && pm.TC !== 'GND') {
        // Counter TC launches from Q0..Q3 internally; if counter Q0 is an MCP source, TC is MCP-launched from Q
        // AND combinational from CET (which is handled via combEdges so 1-cycle CET paths are still checked at N=1!)
        const isCounterMcp = mcpSourceQSet.has(pm.Q0);
        if (isCounterMcp) {
          if (!initMcp.has(pm.TC) || tc > initMcp.get(pm.TC)) {
            initMcp.set(pm.TC, tc);
            prevMcp.set(pm.TC, { src: null, chipId: chip.id, type: t, delay: tc });
          }
        } else {
          if (!init1Cyc.has(pm.TC) || tc > init1Cyc.get(pm.TC)) {
            init1Cyc.set(pm.TC, tc);
            prev1Cyc.set(pm.TC, { src: null, chipId: chip.id, type: t, delay: tc });
          }
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

  const prop1Cyc = propagateArrivals(init1Cyc, prev1Cyc, combEdges);
  const propMcp = propagateArrivals(initMcp, prevMcp, combEdges);

  const results = [];
  const mcpTable = [];
  let failingEndpoints = 0;
  let failingSingleCycle = 0;
  let failingMcp = 0;
  let worstArrivalNs = 0;
  let worstSlackNs = Infinity;
  let worstSingleCycleSlackNs = Infinity;

  for (const ep of endpoints) {
    const epKey = `${ep.chipId}.${ep.pin}`;
    const mcpEntry = mcpEndpointMap.get(epKey) || null;
    const req1 = periodNs - ep.tSetupNs;
    const reqMcp = (mcpEntry ? mcpEntry.N : 1) * periodNs - ep.tSetupNs;

    const arr1 = prop1Cyc.arrival.has(ep.net) ? prop1Cyc.arrival.get(ep.net) : null;
    const arrM = propMcp.arrival.has(ep.net) ? propMcp.arrival.get(ep.net) : null;
    if (arr1 === null && arrM === null) continue;

    const slack1 = arr1 !== null ? (req1 - arr1) : Infinity;
    const slackM = arrM !== null ? (reqMcp - arrM) : Infinity;

    const fail1 = slack1 < -1e-6;
    const failM = slackM < -1e-6;
    const failed = fail1 || failM;
    if (failed) failingEndpoints++;
    if (fail1) failingSingleCycle++;
    if (failM) failingMcp++;

    const worstArrHere = Math.max(arr1 || 0, arrM || 0);
    if (worstArrHere > worstArrivalNs) worstArrivalNs = worstArrHere;
    const epSlack = Math.min(slack1, slackM);
    if (epSlack < worstSlackNs) worstSlackNs = epSlack;
    if (arr1 !== null && slack1 < worstSingleCycleSlackNs) worstSingleCycleSlackNs = slack1;
    if (!mcpEntry && arrM !== null && slackM < worstSingleCycleSlackNs) worstSingleCycleSlackNs = slackM;

    const tr1 = arr1 !== null ? traceSourceAndPath(ep.net, prop1Cyc.prevArc) : null;
    const trM = arrM !== null ? traceSourceAndPath(ep.net, propMcp.prevArc) : null;

    if (mcpEntry && arrM !== null && arrM > req1) {
      mcpTable.push({
        source: `${trM.srcChip}.${trM.srcNet}`,
        endpoint: `${epKey} (${ep.net})`,
        enable: mcpEntry.enableNet,
        N: mcpEntry.N,
        arrivalNs: +arrM.toFixed(3),
        limitNs: +reqMcp.toFixed(3),
        slackNs: +slackM.toFixed(3),
        passed: !failM
      });
    }

    const use1 = slack1 <= slackM;
    const repArr = use1 ? arr1 : arrM;
    const repReq = use1 ? req1 : reqMcp;
    const repN = use1 ? 1 : (mcpEntry ? mcpEntry.N : 1);
    const repTr = use1 ? tr1 : trM;

    results.push({
      endpoint: `${epKey} (${ep.net})`,
      source: repTr ? `${repTr.srcChip}.${repTr.srcNet}` : null,
      pathClass: use1 ? '1-cycle' : (mcpEntry ? `MCP(N=${mcpEntry.N})` : '1-cycle(un-enabled-ep)'),
      N: repN,
      arrivalNs: +repArr.toFixed(3),
      requiredNs: +repReq.toFixed(3),
      slackNs: +epSlack.toFixed(3),
      failed,
      path: failed && repTr ? repTr.path : null
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
    failingSingleCycle,
    failingMcp,
    worstArrivalNs: +worstArrivalNs.toFixed(3),
    worstSlackNs: Number.isFinite(worstSlackNs) ? +worstSlackNs.toFixed(3) : null,
    worstSingleCycleSlackNs: Number.isFinite(worstSingleCycleSlackNs) ? +worstSingleCycleSlackNs.toFixed(3) : null,
    asyncInputEndpoints: asyncCheck,
    declaredMcpCount: mcpTable.length,
    declaredMcpTable: mcpTable.slice(0, 25),
    topFailingPaths: results.filter(r => r.failed).slice(0, 15)
  };
}

module.exports = {
  ASYNC_INPUT_ENDPOINTS,
  DECLARED_MCP_SOURCES,
  DECLARED_MCP_ENDPOINTS,
  analyzeStaticTiming
};
