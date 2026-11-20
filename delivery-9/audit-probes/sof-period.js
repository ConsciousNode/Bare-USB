// probe: count CLK_48M edges between SOF_1MS_TICK pulses (reads one net; does not drive anything)
const R = process.argv[2] + '/src/'; const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const sim = new GateSimulator({ delayCorner: process.argv[3] || 'min' }); buildSieNetlist(sim, {});
const h = new ClosedBoxPinHarness(sim, new UsbLineModel(), { hostClockSkewPct: 0 }); h.reset();
let n = 0, last = null, prev = 0; const gaps = [];
for (let i = 0; i < 150000 && gaps.length < 3; i++) { h._tick48M(1); n++; const v = sim.getNet('SOF_1MS_TICK'); if (v === 1 && prev !== 1) { if (last !== null) gaps.push(n - last); last = n; } prev = v; }
console.log('SOF_1MS_TICK rising-edge spacing in CLK_48M cycles:', gaps.join(', '), '(USB FS frame = 48000 at 48 MHz)');
