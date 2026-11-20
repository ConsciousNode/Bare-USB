const R = process.argv[2] + '/src/';
const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const D = require(R + 'devices'); const { UsbHostDriver } = require(R + 'driver');
function enumOnce(opts, type, devSkew = 0) { const sim = new GateSimulator({ delayCorner: 'min' }); buildSieNetlist(sim, opts); const line = new UsbLineModel();
  const d = type === 'hid' ? new D.LowSpeedHidKeyboardDevice({ seed: 42, clockSkewPct: devSkew }) : new D.FullSpeedMassStorageDevice({ seed: 20261118, clockSkewPct: devSkew });
  line.attachDevice(d); const h = new ClosedBoxPinHarness(sim, line, {}); h.reset(); const drv = new UsbHostDriver(h); let e; try { e = drv.enumerateDevice(1); } catch (x) { e = { ok: false, reason: 'CRASH ' + x.message }; }
  let extra = ''; if (e.ok && type === 'msc') { const r = drv.scsiReadSectors(1, 32, 1, { outToggle: 0, inToggle: 0 }); extra = r.ok ? ' + sector ok' : ' + sector FAIL'; e.ok = r.ok; }
  return { ok: e.ok, stage: e.stage || e.reason || 'COMPLETE', retries: drv.totalRetries, sim, extra }; }
const which = process.argv[3];
if (which === 'fsm') { const base = enumOnce({}, 'hid'); const used = [...base.sim.fsmAccessedAddresses].sort((a, b) => a - b);
  console.log(`baseline LS enum ok=${base.ok}; FSM-table entries used: ${used.length}`);
  // pick entries that change state (the ones the enumeration actually steps through), spread across the list
  const picks = [used[Math.floor(used.length * 0.2)], used[Math.floor(used.length * 0.5)], used[Math.floor(used.length * 0.8)]];
  for (const a of picks) { const r = enumOnce({ mutant: 'fsm_bad_next_state', fsmMutantAddr: a }, 'hid'); console.log(`  FSM entry 0x${a.toString(16)} edited: enum ok=${r.ok} stage=${r.stage} retries=${r.retries} -> ${r.ok ? 'PROBE NOT SATISFIED (transfer still works)' : 'transfer fails (table is in the loop)'}`); } }
if (which === 'skew') for (const s of [0, 0.25, -0.25, 1.0, -1.0, 2.0, -2.0, 3.0, -3.0, 5.0, -5.0]) { const r = enumOnce({}, 'msc', s); console.log(`  FS device skew ${s}%: ok=${r.ok}${r.extra} stage=${r.stage} retries=${r.retries}`); }
