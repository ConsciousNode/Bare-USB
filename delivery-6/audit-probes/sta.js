// Kehai's round-6 audit probe: static timing on the delivered netlist (audit-side, reads the chip list; not a harness).
// Longest register-to-register path per corner vs the 48 MHz period. Registers launched and captured by CLK_48M only.
// Combinational arcs per gate slice (not all-inputs), so the numbers are not inflated. 161 TC: from Q (clk->TC) and CET.
const STRICT = process.env.STRICT === '1'; // STRICT: drop async clear/preset arcs and the transceiver loop (count only plain synchronous paths)
const R = process.argv[2] + '/src/', corner = process.argv[3] || 'max', skew = +(process.argv[4] || 0.25);
const { GateSimulator } = require(R + 'simulator'); const { buildSieNetlist } = require(R + 'netlist');
const sim = new GateSimulator({ delayCorner: corner }); buildSieNetlist(sim, {});
const T = 1000 / (48 * (1 + skew / 100)), name = id => sim.netIdToName[id];
const arcs = new Map(); // outNet -> [{from: inNet|null(launch), d, chip}]
const add = (o, f, d, c) => { if (o === undefined || o === sim.VCC || o === sim.GND) return; if (!arcs.has(o)) arcs.set(o, []); arcs.get(o).push({ f, d, c }); };
const ends = [], cut = []; const clkNet = sim.netNameToId.get('CLK_48M'); const other = new Set();
for (const c of sim.chips) { const p = c.pins, d = c.delayNs, ty = c.type;
  const gate = (ins, outs) => outs.forEach((o, i) => ins.forEach(s => add(p[o], p[s[i]], d, c)));
  if (ty === '74LVC04A') gate([['1A','2A','3A','4A','5A','6A']], ['1Y','2Y','3Y','4Y','5Y','6Y']);
  else if (['74LVC08A','74LVC32A','74LVC86A'].includes(ty)) gate([['1A','2A','3A','4A'], ['1B','2B','3B','4B']], ['1Y','2Y','3Y','4Y']);
  else if (ty === '74LVC157A') ['1','2','3','4'].forEach(k => ['S','G_N',k + 'I0',k + 'I1'].forEach(s => add(p[k + 'Y'], p[s], d, c)));
  else if (ty === '74LVC138A') ['Y0_N','Y1_N','Y2_N','Y3_N','Y4_N','Y5_N','Y6_N','Y7_N'].forEach(o => ['A','B','C','G1','G2A_N','G2B_N'].forEach(s => add(p[o], p[s], d, c)));
  // '245s: only the read-back buffers with DIR tied high (A -> B) are timed; the CPU bus side (BUS_D, PORT_D) is the
  // asynchronous 10 us port interface, not a CLK_48M path, so it is a cut point (no arcs into BUS_D from those buffers)
  else if (ty === '74LVC245A') { if (p.DIR === sim.VCC) for (let i = 1; i <= 8; i++) ['A' + i, 'OE_N'].forEach(s => cut.push([p['B' + i], p[s], d, c])); }
  else if (ty === 'IS61WV5128EDBLL' || ty === 'SST39SF040') { const outs = ty === 'SST39SF040' ? ['DQ0','DQ1','DQ2','DQ3','DQ4','DQ5','DQ6','DQ7'] : ['IO0','IO1','IO2','IO3','IO4','IO5','IO6','IO7'];
    const ins = Object.keys(p).filter(k => /^A\d+$/.test(k) || k === 'CE_N' || k === 'OE_N'); outs.forEach(o => ins.forEach(s => add(p[o], p[s], d, c))); }
  else if (ty === '74LVC574A') { const ck = p.CLK; (ck === clkNet ? null : other.add(c.id + ' CLK=' + name(ck)));
    ['Q0','Q1','Q2','Q3','Q4','Q5','Q6','Q7'].forEach(o => add(p[o], ck === clkNet ? null : 'async', d, c));
    if (ck === clkNet) ['D0','D1','D2','D3','D4','D5','D6','D7'].forEach(s => ends.push({ n: p[s], c, tsu: c.spec.tSetupNs })); }
  else if (ty === '74LVC74A') for (const k of ['1','2']) { const ck = p[k + 'CLK']; if (ck !== clkNet) other.add(c.id + ' ' + k + 'CLK=' + name(ck));
    [k + 'Q', k + 'Q_N'].forEach(o => { add(p[o], ck === clkNet ? null : 'async', d, c); if (!STRICT) [k + 'CLR_N', k + 'PRE_N'].forEach(s => add(p[o], p[s], d, c)); });
    if (ck === clkNet) ends.push({ n: p[k + 'D'], c, tsu: c.spec.tSetupNs }); }
  else if (ty === '74LVC161') { const ck = p.CP; if (ck !== clkNet) other.add(c.id + ' CP=' + name(ck));
    ['Q0','Q1','Q2','Q3'].forEach(o => { add(p[o], ck === clkNet ? null : 'async', d, c); if (!STRICT) add(p[o], p.MR_N, d, c); });
    add(p.TC, ck === clkNet ? null : 'async', c.delayTcNs, c); add(p.TC, p.CET, d, c); if (!STRICT) add(p.TC, p.MR_N, c.delayTcNs, c);
    if (ck === clkNet) ['PE_N','CEP','CET','D0','D1','D2','D3'].forEach(s => ends.push({ n: p[s], c, tsu: c.spec.tSetupNs })); }
  else if (ty === 'USB1T11A' && !STRICT) { ['VP','VM','RCV'].forEach(o => ['DPLUS','DMINUS'].forEach(s => add(p[o], p[s], d, c))); ['DPLUS','DMINUS'].forEach(o => ['VPO','VMO','OE_N'].forEach(s => add(p[o], p[s], d, c))); }
  else if (ty === 'RES-NET-USB') { add(p.DP_BUS, p.DP_XCVR, d, c); add(p.DM_BUS, p.DM_XCVR, d, c); } }
for (const [o, f, d, c] of cut) if (!/^BUS_D/.test(name(o))) add(o, f, d, c);
// arrival from CLK_48M launches only; async sources (port bus, D+/D-, other clocks) contribute nothing (they're not this clock's paths)
const memo = new Map(), onstack = new Set(); let loops = 0;
function arr(n) { if (memo.has(n)) return memo.get(n); if (onstack.has(n)) { loops++; return { t: -Infinity, path: ['LOOP@' + name(n)] }; }
  onstack.add(n); let best = { t: -Infinity, path: [] };
  for (const a of arcs.get(n) || []) { let src;
    if (a.f === null) src = { t: 0, path: [a.c.id + '(launch)'] }; else if (a.f === 'async' || a.f === undefined) continue; else src = arr(a.f);
    if (src.t + a.d > best.t) best = { t: src.t + a.d, path: [...src.path, a.c.id + '>' + name(n)] }; }
  onstack.delete(n); memo.set(n, best); return best; }
const res = ends.map(e => { const a = arr(e.n); return { end: e.c.id + '.' + name(e.n), t: a.t, slack: T - e.tsu - a.t, path: a.path }; }).filter(r => r.t > -Infinity).sort((a, b) => a.slack - b.slack);
const bad = res.filter(r => r.slack < 0);
console.log(`STA${STRICT ? ' (strict: sync arcs only)' : ''} ${corner} corner, period ${T.toFixed(3)} ns (host skew ${skew >= 0 ? '+' : ''}${skew}%): ${res.length} CLK_48M endpoints, ${bad.length} with negative slack; combinational loops seen: ${loops}`);
for (const r of res.slice(0, 8)) console.log(`  ${r.slack.toFixed(2).padStart(7)} ns  ${r.end}  arrival ${r.t.toFixed(2)}: ${r.path.join(' > ')}`);
console.log(`registers NOT on CLK_48M (${other.size}): ${[...other].join('; ')}`);
