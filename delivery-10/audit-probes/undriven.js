// probe (Kehai, round-10 audit): nets that are read by some chip pin but driven by no chip output and not a top-level pin.
// Output pins by part type, from the delivered pin lists. Bidirectional pins (SRAM IO, '245 A/B, DPLUS/DMINUS, DP/DM_*) count as drivers.
const R = process.argv[2] + '/src/'; const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist, SIE_PINS } = require(R + 'netlist');
const sim = new GateSimulator({ delayCorner: 'min' }); buildSieNetlist(sim, {});
const OUT = { 'ECS-3953M-480': /^CLK_OUT$/, '74LVC161': /^(Q\d|TC)$/, '74LVC74A': /^\dQ(_N)?$/, '74LVC04A': /Y$/, '74LVC08A': /Y$/, '74LVC32A': /Y$/, '74LVC86A': /Y$/,
  '74LVC157A': /Y$/, '74LVC138A': /_N$/, '74LVC574A': /^Q\d$/, 'IS61WV5128EDBLL': /^IO\d$/, 'SST39SF040': /^DQ\d$/, '74LVC245A': /^[AB]\d$/,
  'USB1T11A': /^(VP|VM|RCV|DPLUS|DMINUS)$/, 'RES-NET-USB': /^(DP|DM)_/ };
const isOut = (c, pin) => (OUT[c.type] || /^$/).test(pin) && !(c.type === '74LVC138A' && /^G2[AB]_N$/.test(pin));
const drivers = new Map(), readers = new Map();
for (const c of sim.chips) for (const [pin, net] of Object.entries(c.pinMap)) { const m = isOut(c, pin) ? drivers : readers; if (!m.has(net)) m.set(net, []); m.get(net).push(c.id + '.' + pin); }
const top = new Set(Object.values(SIE_PINS || {}).flat ? [].concat(...Object.values(SIE_PINS || {}).map(v => Array.isArray(v) ? v : [v])) : []);
const rails = new Set(['VCC', 'GND']); const bad = [];
for (const [net, rs] of readers) if (!drivers.has(net) && !rails.has(net) && !top.has(net)) bad.push([net, rs]);
console.log(`chips ${sim.chips.length}; nets read ${readers.size}; top-level pins ${top.size}; undriven but read: ${bad.length}`);
for (const [n, rs] of bad) console.log(`  ${n}  <- read by ${rs.slice(0, 4).join(', ')}${rs.length > 4 ? ' …' : ''}`);
