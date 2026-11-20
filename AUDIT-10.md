# Audit: Bare USB, Round 10 delivery
Kehai Interim, 2026-11-20 (from about 06:10 ET). Delivery committed as delivered first (8910e57, ARRIVED-10.md).
Neon's follow-up diagnosis is kept verbatim in `delivery-10/NEON-DIAGNOSIS-as-pasted.md`.
Bar: v2/PREREG.md, PREREG-v3-addendum.md and PREREG-v4-addendum.md, unchanged.

## Verdict
**The biggest round yet, and the first that works end to end at slow-chip timing in its own suite.** The TX chain
really was pipelined: the worst path went from 80.4 ns to 53.2 ns, and our independent STA agrees. Multicycle paths
are now declared per path, and both planted mutants are caught.

The bar is still not met, for four reasons:
- the delivery's own two failures (Tests 4 and 7);
- five undriven nets, not just the one Neon found;
- packet-buffer SRAM paths the STA never times;
- bit-sample strobes that sometimes come **2 clocks** apart, which breaks the N = 4 assumption on 44 paths.

The last two are gaps in our rules as much as in the design.

## What checks out
| Check | Result |
| --- | --- |
| Code hashes (11 files) | match results.jsonl; combined `4d4498b2…22e0`; zip copies of report, results and page byte-identical |
| Rerun (`node scripts/run-tests.js`, scratch copy, ~59 min) | **11/11 records identical** to delivered (timestamps aside); 7/9 reproduced; `audit-probes/rerun.log` |
| `parts-library.js` | byte-identical to Round 9 (delay data unchanged) |
| `simulator.js` diff (23 lines, read by hand) | only moves setup/hold events on exactly the three declared async inputs (U04 RCV_IN, U200 DP_IN/DM_IN) into a separate list. Nothing else changes. |
| Our STA, strict mode | **max:** 258 endpoints, 65 over one cycle (= their 65 declared MCPs), worst 53.2 ns (= theirs). **typ:** 30 over one cycle. **min:** 0. |
| Per-path MCP check (`probe10.js`) | max: 455 slow source→endpoint paths, **439 valid per-path MCPs**, 16 problems (finding 2). Every valid one also fits N = 3 (worst slack +6.64 ns). |
| Neon's diagnosis, SE0_PREV_N | **confirmed** by our undriven-net check |
| Neon's diagnosis, DPLL-shortened bits | **confirmed and extended** (finding 3) |
| Page in Chromium | loads, 0 errors, no `undefined`, no NaN (the event-table bug is fixed) |
| FSM tables | digest `91a11e51…` unchanged |

## Findings
1. **Five undriven nets** (`audit-probes/undriven.txt`). These are nets some chip reads but no chip drives. Round 9
   had none, so all five arrived this round:
   - `SE0_PREV_N` (U150): Neon's find. It silently turns off receive CRC-16 checking, which is why Test 7's flipped CRC
     never retried and why the bad sector at FS_MAX_HOST−0.25 was accepted.
   - `RX_STUFF_ERR` (U60, the ACK gate): a stuffing error may never block an ACK.
   - `STUFF_LOAD_N_RAW` (U191, U192), `RCV_D3` (U165), `TOGGLE_DIFF` (U113): dangling inputs, possibly on mux
     legs that are never selected.

   The simulator reads an undriven net as 0, so nothing complains. Round 11 needs a static "every read net has
   exactly one driver" test, with a planted mutant.
2. **The packet-buffer SRAMs are never timed.** `sta.js` only times SRAMs whose WE_N is tied to VCC, which means the
   lookup tables. U41 and U42 (the read/write buffer) are skipped entirely. That rule has been in `sta.js` since before
   Round 9, inside the arc rules we froze, so it's a blind spot we share. Through U41's OE_N, our STA finds 16 slow
   paths into U93 (the TX byte latch) from undeclared sources: U121 `LAT_PID_NOW_N` at 41.7 ns and U154 `RX_WE_DONE` at
   37.2 ns, at max. They look like **false paths** (receive-side signals that can't change while U93 captures a
   transmit byte), but a false path has to be declared and proven dynamically, like an MCP. SRAM *write* timing
   (address setup, write pulse width, data setup) isn't checked anywhere.
3. **Bit strobes are sometimes 2 or 3 clocks apart** (`audit-probes/rx-spacing.txt`). At FS max, host −0.25 %,
   device +0.25 %, during enumeration, RX_SAMPLE_EN spacing was:

   | Clocks apart | Count |
   | --- | --- |
   | 2 | 3 |
   | 3 | 12 |
   | 4 | 10,963 |
   | 5 | 2 |

   Every MCP is declared with N = 4, and the dynamic proof checks that sources move only on the enable. **It never
   checks that enables are at least N clocks apart.** All 439 valid MCP paths fit at N = 3, but **44 exceed the N = 2
   limit** (worst: U21 → U22 PE_N, 53.2 ns). Whether the 2-clock gaps land where an MCP capture matters (mid-packet) or
   only during SYNC or EOP is unknown. This is the mechanism behind Neon's U239 diagnosis, and it may hit more than
   U239.
4. **The delivery's own failures, reproduced from its record:**
   - Test 4: FS_MAX_HOST−0.25_DEV+0.25 fails with 0 synchronous violations.
   - Test 7: corrupt_crc never retries.

   Neon's diagnosis ties both to findings 1 and 3, which is consistent with our probes.

## Against the preregistered bar
| # | Criterion | Result |
| --- | --- | --- |
| 6 | Timing closes at max, valid MCPs only (v4 rules) | **not met.** Per-path declarations, N = 1 enable and sync sources, the endpoint gating proof and both mutants are all **met**. The buffer SRAM is untimed (finding 2), and enable spacing is unproven while 2-clock gaps exist (finding 3). |
| 7 | Delay data unchanged | **met** |
| 8 | Tests 1–7 pass at max on our rerun; mutants die at max | **not met.** Tests 4 and 7 fail. |
| 9 | Still a netlist; FSM table regenerates clean | **met** (digest unchanged) |
| — | CPU metrics (reported, not judged) | 0.6423 accesses/B (comfort ≤ 1.0, inside); idle duty 6 % (comfort ≤ 5 %, just outside) |

## Our side
Two of the four blockers are holes in rules we wrote:
- v4 asked for per-path MCPs but didn't require the enable to come at least N clocks apart.
- We froze `sta.js`'s arc rules without noticing they skip any SRAM that can be written.

Both get fixed in a v5 addendum before Round 11 is sent.

## Files
`delivery-10/audit-probes/`:
- `sta-ours-strict.txt`
- `probe10.js` and `probe10.txt` (per-path check, N = 2/3 counts, path trace)
- `undriven.js` and `undriven.txt`
- `rx-spacing.js` and `rx-spacing.txt`
- `page.py`
- `rerun.log`
