// Kehai's round-6 audit probe (same as round 5's probe5.js): runs one job against the delivery's own modules.
const R = process.argv[2] + '/src/';
const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const D = require(R + 'devices'); const { UsbHostDriver } = require(R + 'driver'); const crypto = require('crypto');
function run({ corner = 'min', host = 0, dev = 0, type = 'hid', mutant = null, fsmMutantAddr = null, what = 'keys100' }) {
  const sim = new GateSimulator({ delayCorner: corner }); buildSieNetlist(sim, { mutant, fsmMutantAddr });
  const line = new UsbLineModel(); const d = type === 'hid' ? new D.LowSpeedHidKeyboardDevice({ clockSkewPct: dev, seed: 42 }) : new D.FullSpeedMassStorageDevice({ clockSkewPct: dev, seed: 20261118 });
  line.attachDevice(d); const h = new ClosedBoxPinHarness(sim, line, { hostClockSkewPct: host }); h.reset(); const drv = new UsbHostDriver(h);
  let out = {}; try {
    const e = drv.enumerateDevice(1); if (!e.ok) return { result: `enum FAIL at ${e.stage || e.reason} (${e.reason || ''})`, viol: sim.timingViolations.length };
    if (what === 'keys100') { const k = drv.readHidKeystrokes(1, 100); const exp = D.generateScriptedKeystrokes(100, 42); let m = 0; if (k.ok) for (let i = 0; i < 100; i++) if (Buffer.from(k.reports[i]).equals(Buffer.from(exp[i]))) m++; out.result = `keys ok=${k.ok} exact=${m}/100${k.ok ? '' : ' fail at ' + k.index + ' ' + k.reason}`; }
    if (what === 'sector') { const r = drv.scsiReadSectors(1, 32, 1, { outToggle: 0, inToggle: 0 }); out.result = r.ok ? `sector 32 ok, diffs ${[...r.data].filter((b, i) => b !== d.image.disk[32 * 512 + i]).length}` : `sector FAIL ${r.reason}`; }
    if (what === 'file') { const r = drv.readFat16File64KB(1); if (!r.ok) out.result = `file FAIL ${r.stage} ${r.reason}`; else {
        out.result = `file read, sha256 ${r.sha256.slice(0, 12)} vs expected ${d.image.expectedSha256.slice(0, 12)} (${r.sha256 === d.image.expectedSha256 ? 'MATCH' : 'MISMATCH'})`; } }
  } catch (err) { out.result = 'CRASH ' + err.message; }
  out.viol = sim.timingViolations.length; out.retries = drv.totalRetries; return out; }
const job = JSON.parse(process.argv[3]); console.log(JSON.stringify(job), '=>', JSON.stringify(run(job)));
