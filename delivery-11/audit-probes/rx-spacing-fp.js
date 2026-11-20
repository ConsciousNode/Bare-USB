// probe: histogram of CLK_48M edges between RX_SAMPLE_EN pulses during FS enumeration (reads nets only, drives nothing)
const R = process.argv[2] + '/src/'; const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const { ClosedBoxPinHarness } = require(R + 'pin-harness'); const { UsbLineModel } = require(R + 'line-model');
const { FullSpeedMassStorageDevice } = require(R + 'devices'); const { UsbHostDriver } = require(R + 'driver');
const corner = process.argv[3] || 'max', hs = +(process.argv[4] || -0.25), ds = +(process.argv[5] || 0.25);
const sim = new GateSimulator({ delayCorner: corner }); buildSieNetlist(sim, {});
const line = new UsbLineModel(); line.attachDevice(new FullSpeedMassStorageDevice({ clockSkewPct: ds, seed: 20261118 }));
const h = new ClosedBoxPinHarness(sim, line, { hostClockSkewPct: hs }); h.reset();
const orig = h._tick48M.bind(h); let n = 0, last = null, ovlA = 0, ovlB = 0, ovlC = 0, rxw = 0; const hist = {}; for (const nn of ['RX_WE_PULSE','S_TX_DATA','TX_BIT_EN','RX_SAMPLE_EN','TX_LAT_EN']) if (!sim.netNameToId.has(nn)) throw new Error('no net ' + nn);
h._tick48M = function (k = 1) { for (let i = 0; i < k; i++) { orig(1); n++; if (sim.getNet('RX_WE_PULSE') === 1 && sim.getNet('S_TX_DATA') === 1) ovlA++; if (sim.getNet('RX_WE_PULSE') === 1 && sim.getNet('TX_LAT_EN') === 1) ovlB++; if (sim.getNet('RX_WE_PULSE') === 1 && sim.getNet('TX_BIT_EN') === 1) ovlC++; if (sim.getNet('RX_WE_PULSE') === 1) rxw++; if (sim.getNet('RX_SAMPLE_EN') === 1) { if (last !== null) { const g = n - last; hist[g] = (hist[g] || 0) + 1; } last = n; } } };
const ok = new UsbHostDriver(h).enumerateDevice(1).ok;
console.log(`corner ${corner} host ${hs}% dev ${ds}%: enumerate ${ok}; RX_SAMPLE_EN spacing histogram (clocks: count):`, JSON.stringify(hist), '; RX_WE_PULSE cycles', rxw, '; overlaps: with S_TX_DATA', ovlA, ', with TX_LAT_EN (U93 capture)', ovlB, ', with free-running TX_BIT_EN', ovlC);
