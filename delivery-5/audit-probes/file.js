const crypto = require('crypto'); let captured = null; const orig = crypto.createHash;
crypto.createHash = function (alg) { const h = orig.call(crypto, alg); const u = h.update.bind(h); h.update = d => { if (d && d.length === 65536) captured = Buffer.from(d); return u(d); }; return h; };
const R = process.argv[2] + '/src/';
const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const D = require(R + 'devices'); const { UsbHostDriver } = require(R + 'driver');
const sim = new GateSimulator({ delayCorner: 'min' }); buildSieNetlist(sim, {}); const line = new UsbLineModel(); const d = new D.FullSpeedMassStorageDevice({ seed: 20261118 });
line.attachDevice(d); const h = new ClosedBoxPinHarness(sim, line, {}); h.reset(); const drv = new UsbHostDriver(h);
console.log('enum', drv.enumerateDevice(1).ok); const r = drv.readFat16File64KB(1); const want = Buffer.from(d.image.fileBytes);
const diffs = []; for (let i = 0; i < 65536; i++) if (captured[i] !== want[i]) diffs.push(i);
console.log('ok', r.ok, 'sha', r.sha256.slice(0, 12), 'differing bytes', diffs.length, 'first', diffs[0], 'last', diffs[diffs.length - 1]);
// is a 64-byte packet duplicated? compare each wrong 64-byte block with the previous block of the expected data
const blocks = new Set(diffs.map(i => i >> 6)); for (const b of [...blocks].slice(0, 6)) { const got = captured.subarray(b * 64, b * 64 + 64);
  const src = [...Array(1024).keys()].find(k => want.subarray(k * 64, k * 64 + 64).equals(got)); console.log(`  block ${b} (offset ${b * 64}): got = expected block ${src === undefined ? 'none' : src}`); }
console.log('retries', drv.totalRetries);
