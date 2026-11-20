const R = process.argv[2] + '/src/';
const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const D = require(R + 'devices'); const { UsbHostDriver } = require(R + 'driver');
const ANETS = ['CUR_S0', 'CUR_S1', 'CUR_S2', 'CUR_S3', 'LAT_T0', 'LAT_T1', 'START_OR_SOF', 'BYTE_DONE', 'LEN_DONE_MUX', 'RX_ACTIVE', 'EOP_VALID', 'FSM_ERR_OR_TO'];
function enumOnce(opts, type, devSkew = 0, record = false) { const sim = new GateSimulator({ delayCorner: 'min' }); buildSieNetlist(sim, opts); const line = new UsbLineModel();
  const d = type === 'hid' ? new D.LowSpeedHidKeyboardDevice({ seed: 42, clockSkewPct: devSkew }) : new D.FullSpeedMassStorageDevice({ seed: 20261118, clockSkewPct: devSkew });
  const latched = new Map();
  if (record) sim.watchNet('CLK_48M', (t, v) => { if (v !== 1 || !sim.getNet('ACTIVE_EN')) return; let a = 0; ANETS.forEach((n, i) => { a |= sim.getNet(n) << i; });
      const cur = a & 15, nxt = ['NXT_S0', 'NXT_S1', 'NXT_S2', 'NXT_S3'].reduce((x, n, i) => x | sim.getNet(n) << i, 0); if (nxt !== cur) latched.set(a, (latched.get(a) || 0) + 1); });
  line.attachDevice(d); const h = new ClosedBoxPinHarness(sim, line, {}); h.reset(); const drv = new UsbHostDriver(h); let e; try { e = drv.enumerateDevice(1); } catch (x) { e = { ok: false, reason: 'CRASH ' + x.message }; }
  let extra = ''; if (e.ok && type === 'msc') { const r = drv.scsiReadSectors(1, 32, 1, { outToggle: 0, inToggle: 0 }); extra = r.ok ? ' + sector ok' : ' + sector FAIL'; e.ok = r.ok; }
  return { ok: e.ok, stage: e.stage || e.reason || 'COMPLETE', retries: drv.totalRetries, latched, extra }; }
if (process.argv[3] === 'fsm') { const base = enumOnce({}, 'hid', 0, true);
  const ents = [...base.latched.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`baseline LS enum ok=${base.ok}; state-changing FSM entries latched at a clock edge during enumeration: ${ents.length}`);
  let fail = 0; for (const [a, cnt] of ents) { const r = enumOnce({ mutant: 'fsm_bad_next_state', fsmMutantAddr: a }, 'hid'); if (!r.ok) fail++;
    console.log(`  entry 0x${a.toString(16).padStart(3, '0')} (state ${a & 15}, taken ${cnt}x) edited: enum ok=${r.ok} ${r.ok ? '' : 'at ' + r.stage}`); }
  console.log(`=> ${fail}/${ents.length} edits of state-changing entries break enumeration`); }
if (process.argv[3] === 'skew') for (const s of [0.4, 0.5, 0.6, 0.75, 0.9, -4.0]) { const r = enumOnce({}, 'msc', s); console.log(`  FS device skew ${s}%: ok=${r.ok}${r.extra} stage=${r.stage} retries=${r.retries}`); }
