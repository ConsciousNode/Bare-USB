// Kehai's round-6 audit probe: static timing on the delivered netlist (audit-side, reads the chip list; not a harness).
// Longest register-to-register path per corner vs the 48 MHz period. Registers launched and captured by CLK_48M only.
// Combinational arcs per gate slice (not all-inputs), so the numbers are not inflated. 161 TC: from Q (clk->TC) and CET.
const STRICT = process.env.STRICT === '1'; // probe9: lifted from delivery-6/audit-probes/sta.js lines 1-35, arc rules unchanged
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
// ---- probe9 (Kehai, round-9 audit): per-source arrival into each CLK_48M endpoint, checked against the
// delivery's own declarations (src/sta.js exports). Not a harness; reads the netlist only.
const STA = require(R + 'sta');
const asyncSet = new Set(STA.ASYNC_INPUT_ENDPOINTS.map(a => a.chipId + '|' + a.net));
const mcpEnd = STA.DECLARED_MCP_ENDPOINT_CHIPS;
const srcQ = new Map(); for (const s of STA.DECLARED_MCP_SOURCES) for (const q of s.qNets) srcQ.set(q, s);
const ENS = ['ACTIVE_EN','TX_BIT_EN','RX_SAMPLE_EN','CRC5_EN_D1','CRC16_EN_D1'].map(n => sim.netNameToId.get(n)).filter(x => x !== undefined);
// per launch net (a register Q), longest arrival to every net
const launches = []; for (const [o, list] of arcs) for (const a of list) if (a.f === null) launches.push({ q: o, d: a.d, c: a.c });
function fwd(L) { // longest arrival from launch L
  const out = new Map(); const cache = new Map(); const stk = new Set();
  function at(n) { if (n === L.q) return L.d; if (cache.has(n)) return cache.get(n); if (stk.has(n)) return -Infinity; stk.add(n);
    let b = -Infinity; for (const a of arcs.get(n) || []) { if (a.f === null || a.f === 'async' || a.f === undefined) continue; const s = at(a.f); if (s + a.d > b) b = s + a.d; }
    stk.delete(n); cache.set(n, b); return b; }
  return at; }
const fns = launches.map(L => ({ L, at: fwd(L) }));
function cone(n, seen = new Set()) { if (seen.has(n)) return seen; seen.add(n); for (const a of arcs.get(n) || []) if (a.f !== null && a.f !== 'async' && a.f !== undefined) cone(a.f, seen); return seen; }
const qOf = c => Object.entries(c.pins).filter(([k]) => /^(\d?Q|Q\d)$/.test(k)).map(([, v]) => v);
const rows = []; let asyncN = 0, mcpOk = 0;
for (const e of ends) { const req1 = T - e.tsu; const slow = [];
  for (const { L, at } of fns) { const t = at(e.n); if (t > req1) slow.push({ src: L.c.id, q: name(L.q), t }); }
  if (!slow.length) continue;
  const tag = e.c.id + '.' + name(e.n);
  if (asyncSet.has(e.c.id + '|' + name(e.n))) { asyncN++; continue; }
  const isMcp = mcpEnd.has(e.c.id);
  const cn = cone(e.n); const selfHold = qOf(e.c).some(q => cn.has(q)); const enIn = ENS.some(x => cn.has(x));
  const undeclSrc = slow.filter(s => !srcQ.has(s.q)); const over4 = slow.filter(s => s.t > 4 * T - e.tsu);
  const worst = Math.max(...slow.map(s => s.t));
  const verdict = !isMcp ? 'SINGLE-CYCLE FAIL' : over4.length ? 'FAILS EVEN AT N=4' : undeclSrc.length ? 'MCP but undeclared source' : (!selfHold && !enIn) ? 'MCP but endpoint not enable-gated' : 'MCP consistent';
  if (verdict === 'MCP consistent') mcpOk++;
  rows.push({ tag, verdict, worst: worst.toFixed(1), selfHold, enIn, undecl: [...new Set(undeclSrc.map(s => s.src + ':' + s.q))].slice(0, 4).join(',') });
}
console.log(`probe9 ${corner}: endpoints with any path > 1 cycle (excluding ${asyncN} declared-async): ${rows.length}; consistent MCPs: ${mcpOk}`);
const by = {}; rows.forEach(r => (by[r.verdict] ||= []).push(r));
for (const [v, rs] of Object.entries(by)) { console.log(`\n## ${v}: ${rs.length}`); rs.sort((a, b) => b.worst - a.worst).forEach(r => console.log(`  ${r.tag}  worst ${r.worst} ns  hold=${r.selfHold} en=${r.enIn}${r.undecl ? '  undeclared: ' + r.undecl : ''}`)); }
// ---- per-source detail for undeclared sources (worst arrival per source register, per endpoint)
if (process.env.DETAIL) { const agg = new Map();
  for (const e of ends) { const req1 = T - e.tsu; if (asyncSet.has(e.c.id + '|' + name(e.n)) || !mcpEnd.has(e.c.id)) continue;
    for (const { L, at } of fns) { const t = at(e.n); if (t > req1 && !srcQ.has(name(L.q))) { const k = L.c.id + ':' + name(L.q);
      const a = agg.get(k) || { n: 0, worst: 0, ex: '' }; a.n++; if (t > a.worst) { a.worst = t; a.ex = e.c.id + '.' + name(e.n); } agg.set(k, a); } } }
  console.log('\n## undeclared source registers feeding MCP endpoints with > 1 cycle (worst arrival, #endpoints, example)');
  [...agg].sort((a, b) => b[1].worst - a[1].worst).forEach(([k, a]) => console.log(`  ${k.padEnd(40)} ${a.worst.toFixed(1).padStart(6)} ns  x${a.n}  e.g. ${a.ex}`)); }
