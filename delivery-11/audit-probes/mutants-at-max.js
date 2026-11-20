// probe (Kehai, round-11 audit): Test 6's mutants and baselines at the max corner (PREREG v3 criterion 8 asks for
// "every mutant dies at max"; the delivered Test 6 runs at min). Loads the delivered run-tests.js unchanged and only
// exports safeWorkload from it; options are the same as Test 6's except delayCorner.
const fs = require('fs'), path = require('path'), Module = require('module');
const file = path.resolve(process.argv[2], 'scripts/run-tests.js');
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.safeWorkload = safeWorkload;', file);
const W = m.exports.safeWorkload, corner = process.argv[3] || 'max', FSM = 0x82;
const ids = ['crc16_tap_moved', 'bit_stuff_off_by_one', 'nrzi_rx_inverted', 'turnaround_short', 'sof_missing', 'fsm_bad_next_state', 'auto_ack_late', 'dpll_resync_disabled', 'buf_addr_carry_broken', 'reg_dec_swapped', 'mcp_source_changes_off_enable', 'mcp_endpoint_captures_off_enable'];
const ok = r => !!r.ok && r.sim && r.sim.timingViolations.length === 0;
const bMsc = W({ delayCorner: corner, deviceType: 'msc', fileSectorsToRead: 1 });
const bHid = W({ delayCorner: corner, deviceType: 'hid', hidKeystrokesToRead: 5, idleGapMs: 4 });
const bSkew = W({ delayCorner: corner, hostClockSkewPct: 0.25, devClockSkewPct: -0.25, deviceType: 'msc', fileSectorsToRead: 1 });
console.log(`baselines at ${corner}: msc ${ok(bMsc)} hid ${ok(bHid)} skew ${ok(bSkew)}`);
let killed = 0;
for (const id of ids) { const hid = id === 'sof_missing', skew = id === 'dpll_resync_disabled';
  const r = W({ delayCorner: corner, hostClockSkewPct: skew ? 0.25 : 0, devClockSkewPct: skew ? -0.25 : 0, mutant: id, fsmMutantAddr: FSM,
    deviceType: hid ? 'hid' : 'msc', fileSectorsToRead: 1, hidKeystrokesToRead: 5, idleGapMs: hid ? 4 : 0 });
  const base = hid ? ok(bHid) : skew ? ok(bSkew) : ok(bMsc); const k = base && !r.ok; if (k) killed++;
  console.log(`  ${id}: ${k ? 'killed' : 'SURVIVED'} (${r.stage}: ${r.reason})`); }
console.log(`mutants at ${corner}: ${killed}/${ids.length} killed`);
