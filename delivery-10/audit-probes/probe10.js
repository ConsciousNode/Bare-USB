// Kehai's round-6 audit probe: static timing on the delivered netlist (audit-side, reads the chip list; not a harness).
// Longest register-to-register path per corner vs the 48 MHz period. Registers launched and captured by CLK_48M only.
// Combinational arcs per gate slice (not all-inputs), so the numbers are not inflated. 161 TC: from Q (clk->TC) and CET.
const STRICT = true; // probe10: arc rules lifted from delivery-6/audit-probes/sta.js lines 1-35, strict mode
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
// ---- probe10 (Kehai, round-10 audit): every launch→endpoint path over one cycle must be a declared per-path MCP
// (source Q in DECLARED_MCP_SOURCES, endpoint pin in DECLARED_MCP_ENDPOINTS), its source must not be an enable flop or a
// synchronizer output, and it must also fit N=3 (a DPLL-shortened bit, per the delivery's own diagnosis).
const STA = require(R + 'sta');
const srcQ = new Set(); for (const s of STA.DECLARED_MCP_SOURCES) for (const q of s.qNets) srcQ.add(q);
const epPin = new Map(); for (const e of STA.DECLARED_MCP_ENDPOINTS) for (const p of e.pins) epPin.set(e.chipId + '.' + p, e);
const asyncSet = new Set(STA.ASYNC_INPUT_ENDPOINTS.map(a => a.chipId + '|' + a.net));
const N1_ONLY = /^(U164|U215|U222|U223|U207|U210|U221|U04|U219|U201)_/;
const launches = []; for (const [o, list] of arcs) for (const a of list) if (a.f === null) launches.push({ q: o, d: a.d, c: a.c });
function fwd(L) { const cache = new Map(), stk = new Set();
  function at(n) { if (n === L.q) return L.d; if (cache.has(n)) return cache.get(n); if (stk.has(n)) return -Infinity; stk.add(n); let b = -Infinity;
    for (const a of arcs.get(n) || []) { if (a.f === null || a.f === 'async' || a.f === undefined) continue; const s = at(a.f); if (s + a.d > b) b = s + a.d; }
    stk.delete(n); cache.set(n, b); return b; } return at; }
const fns = launches.map(L => ({ L, at: fwd(L) }));
const pinOf = (c, net) => Object.entries(c.pinMap).filter(([, v]) => v === name(net)).map(([k]) => k);
let slowPaths = 0, ok = 0; const bad = []; let worstN3 = Infinity;
for (const e of ends) { if (asyncSet.has(e.c.id + '|' + name(e.n))) continue; const req1 = T - e.tsu, req3 = 3 * T - e.tsu;
  const pins = pinOf(e.c, e.n); const declEp = pins.some(p => epPin.has(e.c.id + '.' + p));
  for (const { L, at } of fns) { const t = at(e.n); if (!(t > req1)) continue; slowPaths++;
    const q = name(L.q), why = [];
    if (!declEp) why.push('endpoint not declared'); if (!srcQ.has(q)) why.push('source not declared');
    if (N1_ONLY.test(L.c.id)) why.push('enable/sync source'); if (t > req3) why.push(`over N=3 (${t.toFixed(1)} > ${req3.toFixed(1)})`);
    worstN3 = Math.min(worstN3, req3 - t);
    if (why.length) bad.push(`${L.c.id}:${q} -> ${e.c.id}.${pins.join('/')} ${t.toFixed(1)} ns: ${why.join('; ')}`); else ok++; } }
console.log(`probe10 ${corner}: slow (source,endpoint) paths ${slowPaths}; valid per-path MCP ${ok}; problems ${bad.length}; worst N=3 slack ${worstN3.toFixed(2)} ns`);
[...new Set(bad)].slice(0, 40).forEach(b => console.log('  ' + b));
// ---- trace one launch->endpoint path (TRACE=srcChip:qNet>endpointNet)
if (process.env.TRACE) { const [s, e] = process.env.TRACE.split('>'); const [sc, sq] = s.split(':');
  const L = launches.find(l => l.c.id === sc && name(l.q) === sq); const tgt = sim.netNameToId.get(e);
  const best = new Map(); const stk = new Set();
  function at(n) { if (n === L.q) return { t: L.d, p: [sc + '>' + sq + ` (${L.d})`] }; if (best.has(n)) return best.get(n); if (stk.has(n)) return { t: -Infinity, p: [] }; stk.add(n);
    let b = { t: -Infinity, p: [] }; for (const a of arcs.get(n) || []) { if (a.f === null || a.f === 'async' || a.f === undefined) continue; const s2 = at(a.f);
      if (s2.t + a.d > b.t) b = { t: s2.t + a.d, p: [...s2.p, `${a.c.id}(${a.c.type}) +${a.d} > ${name(n)}`] }; }
    stk.delete(n); best.set(n, b); return b; }
  const r = at(tgt); console.log(`TRACE ${process.env.TRACE}: ${r.t.toFixed(2)} ns`); r.p.forEach(x => console.log('   ' + x)); }
// ---- how many slow paths would fail if the enable can come N=2 or N=3 clocks apart
if (process.env.NCOUNT) { const c = { 2: 0, 3: 0 }; let tot = 0; const ex = {};
  for (const e of ends) { if (asyncSet.has(e.c.id + '|' + name(e.n))) continue;
    for (const { L, at } of fns) { const t = at(e.n); if (!(t > T - e.tsu)) continue; tot++;
      for (const N of [2, 3]) if (t > N * T - e.tsu) { c[N]++; ex[N] = ex[N] || `${L.c.id}:${name(L.q)} -> ${e.c.id}.${name(e.n)} ${t.toFixed(1)} ns`; } } }
  console.log(`slow paths ${tot}; over N=2 limit: ${c[2]} (e.g. ${ex[2] || '-'}); over N=3 limit: ${c[3]}`); }
