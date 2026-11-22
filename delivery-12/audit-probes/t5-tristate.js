// probe (Kehai, round-12 audit): Test 5's full-length workloads at one corner, reading the three-state counters that
// Test 5 records only at typ (its min/max records have no floatingReads/contentions; the report prints them as 0).
// Loads the delivered run-tests.js unchanged and only exports safeWorkload from it; options are Test 5's exactly.
// usage: node t5-tristate.js <delivery src dir> <min|max> <msc|hid>
const fs = require('fs'), path = require('path'), Module = require('module');
const file = path.resolve(process.argv[2], 'scripts/run-tests.js');
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.safeWorkload = safeWorkload;', file);
const W = m.exports.safeWorkload, corner = process.argv[3], dev = process.argv[4], t0 = Date.now();
const r = W(dev === 'msc' ? { delayCorner: corner, deviceType: 'msc', fileSectorsToRead: 128 } : { delayCorner: corner, deviceType: 'hid', hidKeystrokesToRead: 100 });
const s = r.sim;
console.log(JSON.stringify({ corner, dev, ok: !!r.ok, stage: r.stage, timingViolations: s.timingViolations.length, floatingReads: s.floatingReadCount || 0,
  contentions: s.contentionCount || 0, maxContentionNs: s.maxContentionDurationNs || 0, firstFloating: (s.floatingReadViolations || [])[0] || null,
  firstContention: (s.contentionViolations || [])[0] || null, sha256: r.fileRes ? r.fileRes.sha256 : null, exactMatches: r.exactMatches, seconds: (Date.now() - t0) / 1000 | 0 }));
