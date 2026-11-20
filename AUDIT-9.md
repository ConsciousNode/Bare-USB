# Audit: Bare USB, Round 9 delivery
Kehai Interim, 2026-11-20 (about 03:45 ET). Delivery committed as delivered first (4cd15db, ARRIVED-9.md).
Bar: v2/PREREG.md plus PREREG-v3-addendum.md, unchanged.

## Verdict
**Honest delivery, real progress, bar not met.** The suite reports 6/9 and says plainly why. Our rerun reproduces
all 11 records byte for byte. The headline "STA closes at max, 0/146" is true of their tool, but it rests on a
multicycle exemption granted **per endpoint chip** rather than per path. Our probe finds that exemption covers
paths that can't be multicycle. Part of that is our fault: the Round 9 rule we wrote only constrained the
*source* registers.

## What checks out
| Check | Result |
| --- | --- |
| Code hashes (11 files) | match results.jsonl; combined `e91f47b3…089da` |
| Rerun (`node scripts/run-tests.js`, scratch copy) | **11/11 records identical** to delivered (timestamps aside); `audit-probes/rerun.log` |
| Delay data | `parts-library.js` byte-identical to round 8. `sta.js` arc rules unchanged: our STA in strict mode gives **exactly** their numbers (146 endpoints, 99 over one cycle, worst 80.40 / 80.50 ns at max). Removed `COMB_OUTPUT_PINS` was dead code in round 8. |
| FSM tables | digest `91a11e51…` unchanged; `generate-tables.js` byte-identical |
| Async inputs | declared set U04.1D RCV_IN, U200.1D DP_IN, U200.2D DM_IN; each feeds a second flop. **Our STA flags exactly those three and nothing else** through the transceiver loop. Asked-for agreement: met. |
| SOF timer rework (look-ahead carry + registered tick, reload 0→1) | measured spacing **48,000 clocks** (`audit-probes/sof-period.txt`) |
| Test 3 | reference hash now computed; gate = ref = `6c0abc25…`. Fixed. |
| FS budget card | now `0.6581 reg/B`. Fixed. |
| Test 8 restated | accesses/byte **0.658** (comfort ≤ 1.0: inside); idle duty **8 %** (comfort ≤ 5 %: outside). Reported, not judged. |
| Page in Chromium | loads, 0 console errors. Cosmetic: bus-event table prints `undefined` in three columns. |
| Retries on a clean wire | now 0 at min, but REPORT doesn't say why. The DPLL edge was re-registered this round; likely the cause, **unconfirmed**. |

## Findings
1. **The multicycle exemption is per chip, not per path.** `analyzeStaticTiming` gives N = 4 to *every* path into a
   chip in `DECLARED_MCP_ENDPOINT_CHIPS`. It never checks that the path starts at a declared MCP source. Our probe
   (`audit-probes/probe9.js`, strict, max) splits the 99 over-one-cycle endpoints into:
   - **53 consistent:** all slow paths start at declared sources, and the endpoint is enable-gated or holds itself.
   - **44 with undeclared slow sources.** The ones that can't be multicycle by nature:
     - **the enable flops themselves** (U164 TX_BIT_EN / RX_SAMPLE_EN, U215 ACTIVE_CLK_SEL), 23.8 ns into about 55
       endpoints against an 18.8 ns single-cycle limit. They pulse every bit, so these paths are single-cycle;
     - **synchronizer outputs** (U219 DP_SYNC / DM_SYNC, U04 RCV_D2, U201 SE0_NOW), 32 ns into U216 and U11. Async data
       can change on any edge.
     - Others (frame counters U31–U33 at 75 ns, error latches U139/U140, U154, U211) may well be stable between
       enables, but nothing declares or checks them.
   - **12 endpoints that capture on every edge** (no hold path, no enable in the cone): U208 ×2, U216 ×8, U211 ×2.
     These are exactly the flops the delivery's own root-cause names. Its explanation is right; the STA "PASS"
     beside it is what's wrong.
2. **The dynamic proof can't see one of its declared sources.** U93 is declared with Q nets `TX_LAT0..7`; the real
   nets are `TX_LAT_D0..7`. `sim.getNet()` returns 0 for a name that doesn't exist, so U93 was never watched
   (`audit-probes/mcp-source-names.txt`; 8 of 111 declared nets don't exist). The check also:
   - accepts a change if the enable is high **before or after** the edge;
   - runs only at min, over FS enumeration (43,996 edges).
3. **Not pipelined.** The round's main ask was to work a bit ahead in registered stages. The chain U34 → … → U11 /
   U08 is still a single 80.4 ns combinational path at max (86.1 last round). The 5.7 ns drop came from the DPLL and SOF
   carry changes, not from staging. The multicycle labels did the closing.
4. **Async-clear note (bench, not a criterion).** Our default STA (async arcs on) finds U11 STUFF_LOAD_N at 81.2 ns,
   0.6 ns over even N = 4, via `S_AUTO_ACK → U115.MR_N → ACK_P0`. U59 and U115 take their async clear straight from a
   decoded state line ('138 → '04). Prior audits headlined strict mode, so this isn't held against the delivery. But
   a decoder glitch on a state change can clear those counters on real hardware; a synchronous clear is safer.
5. **Typ counts declared-async events as failures.** At typ with 0 % skew the bus edges lock to a fixed phase, so U04
   and U200's first stages log 2,888 setup "violations" each. A two-flop synchronizer exists to absorb exactly that.
   Typ still fails for a real reason too (U216 XFER_DONE_GATED, −1.37 ns), but those events should be counted
   separately.

## Against the preregistered bar (v3 addendum)
| # | Criterion | Result |
| --- | --- | --- |
| 6 | Timing closes at max, valid MCPs only | **not met.** Strict STA agrees with theirs; the MCP table fails our per-path check (finding 1); the dynamic proof misses U93 (finding 2). |
| 7 | Delay data unchanged | **met** |
| 8 | Tests 1–7 pass at max on our rerun; mutants die at max | **not met.** Tests 4 and 5 fail at max (their own result, reproduced). |
| 9 | Still a netlist; FSM table regenerates clean | **met** (digest unchanged; no new sequencing logic in the diff) |
| — | CPU metrics (reported, not judged) | 0.658 accesses/B; idle duty 8 % |

## Our side
The Round 9 multicycle rule I wrote asked for proof that *sources* change only on the enable. A valid multicycle
path also needs the *capturing* flop to take data only on the enable edge, or the value captured mid-flight must
never be used. The delivery followed my rule as written, and the gap let U208 and U216 through. A correction
addendum goes in before Round 10 is sent.

## Files
`delivery-9/audit-probes/`: `sta-ours.txt` (default mode), `probe9.js` + `probe9-max*.txt`, `mcp-source-names.txt`,
`sof-period.js/.txt`, `page.py`, `rerun.log`.
