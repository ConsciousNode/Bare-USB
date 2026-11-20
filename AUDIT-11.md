# Audit: Bare USB, Round 11 delivery
Kehai Interim, 2026-11-20 (from 09:45 ET). Delivery committed as delivered first (9c46e75, ARRIVED-11.md).
Bar: v2/PREREG.md, PREREG-v3, v4 and v5 addenda, unchanged.

## Verdict
**The preregistered bar is met.** Our rerun reproduces all 11 records byte for byte (9/9), and every independent
probe agrees: single drivers on every net, per-path multicycle timing that our own STA confirms path by path, bit
spacing of at least 3 clocks, a false path whose promise holds when we test it ourselves, and all 12 mutants
killed at the slow-chip corner as well as the fast one.

**What this means:** in simulation, with datasheet timings at min and max, a USB 1.1 host made only of 74LVC logic,
10 ns SRAM tables and one analog transceiver enumerates a full-speed mass-storage device and a low-speed keyboard,
reads a 64 KB FAT16 file byte-perfect, takes 100 keystrokes exactly, and recovers from a corrupted CRC, a stuffing
error and a dropped handshake. **What it doesn't mean yet:** the analog line is modeled, not measured; it isn't
joined to the Triton card computer yet; and no board has been built.

## What checks out
| Check | Result |
| --- | --- |
| Code hashes (11 files) | match results.jsonl; combined `6009d6eb…7a8912`; zip copies of report, results and page byte-identical |
| Rerun (`node scripts/run-tests.js`, scratch copy, ~63 min) | **11/11 records identical** to delivered (timestamps aside); 9/9 reproduced; `audit-probes/rerun.log` |
| `parts-library.js`, `simulator.js` | byte-identical to Round 10: delay data and violation rules unchanged |
| Undriven nets (our check, `undriven.txt`) | **0** of 866 read nets (Round 10: 5) |
| Our STA, strict | max: 259 endpoints, **64 over one cycle = their 64 declared MCPs**, worst 53.2 ns (theirs 53.2); typ 30 = their 30 |
| Per-path MCP check (`probe11.js`) | max: 436 slow source→endpoint paths, **420 valid per-path MCPs**; none over its declared N; none over N = 3 (worst N = 3 slack +6.64 ns). The other **16 are exactly the declared false path** FP_RX_WE_TO_TX_LAT (U154 RX_WE_WIN_D1 / RX_WE_DONE_N → U41 OE → U93). Round 10's U121 path is gone. |
| Bit spacing (our probe, FS max, host −0.25 %, device +0.25 %) | RX_SAMPLE_EN: 3 ×12, 4 ×10,960, 5 ×2, 6 ×3; **no 2-clock gaps** (Round 10: 3) |
| The false path, checked independently | during enumeration at that corner, RX_WE_PULSE was high on 58 cycles: **0** overlaps with S_TX_DATA, **0** with TX_LAT_EN (U93's real capture enable). It overlaps the free-running TX_BIT_EN 13 times, as expected. |
| Mutants at max (our probe, Test 6's options with delayCorner = max) | **12/12 killed at max**; all three baselines (msc, hid, skew) pass at max (`mutants-at-max.txt`) |
| Page in Chromium | loads, 0 errors, no `undefined` or NaN; KPIs match the report |

## Notes (not failures)
1. **The 2-clock bits were fixed by bounding the DPLL, not with an elastic buffer.** RX_SAMPLE_EN_PRE is now gated with
   DPLL_EDGE_REG_N (U275). That's a legitimate fix for the hazard and it is measured (minimum spacing 3 at min and max,
   with a mutant). Kham's elastic buffer stays an option if latency or margin ever needs it.
2. **Max-corner single-cycle slack is +0.18 ns** (theirs and ours agree). It closes, but it's the thinnest margin in the
   design: a bench item for a temperature and voltage check.
3. **The buffer-SRAM write check has no planted mutant** (a short WE pulse that must be caught). v5 asked for the write
   side to be "checked against the datasheet", which it is, with measured margins (tPWE 20.9 ns vs 7.0 ns spec). A
   mutant would make it airtight.
4. Round 9's note still stands: U59 and U115 take their async clear straight from a decoded state line. Bench item.

## Against the preregistered bar
| # | Criterion | Result |
| --- | --- | --- |
| 6 | Timing closes at max, valid MCPs only (v4 and v5) | **met.** Per-path declarations, N = 1 for enables and synchronizer outputs, endpoint gating proven, enable spacing ≥ 3 proven with a mutant, buffer SRAMs timed (read arcs in STA, writes against the datasheet), one declared false path with a dynamic proof and a mutant, single-driver lint with a mutant. Our probes agree on every count. |
| 7 | Delay data unchanged | **met** (parts-library.js and simulator.js byte-identical) |
| 8 | Tests 1–7 pass at max on our rerun; mutants die at max | **met.** Tests 1–7 pass at max in our rerun; **12/12 mutants killed at max** in our own run (the suite runs them at min) |
| 9 | Still a netlist; FSM table regenerates clean | **met** (tables digest `91a11e51…` unchanged) |
| — | CPU metrics (reported, not judged) | 0.6423 accesses/B (inside ≤ 1.0); idle duty 6 % (comfort ≤ 5 %, just outside) |

## Files
`delivery-11/audit-probes/`:
- `undriven.txt`
- `sta-ours-strict.txt`
- `probe11.js` and `probe11-max.txt`
- `rx-spacing-fp.js` and `rx-spacing-fp.txt`
- `mutants-at-max.js` and `mutants-at-max.txt`
- `page.py`
- `rerun.log`
