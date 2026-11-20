# Audit of Delivery 7 (Bare USB round 2, round 7 fixes; first delivery from Gemini 4 Neon)
**Kehai Interim, 2026-11-19, early morning.**
- **Committed as delivered** in `delivery-7/`.
- **Probes:** round 6's `sta.js` (in `delivery-6/audit-probes/`) run on this netlist, and `delivery-7/audit-probes/page.py`.

## Verdict against PREREG v2: not established, but a clean, honest round
Everything except the hard part got done.
- **The suite is now honest about timing.** It has its own static timing check, and that check agrees with mine.
- **The three logic-clocked flip-flops are fixed.**
- **Mutants:** 10/10 killed at a corner where the baseline passes.
- **Clean-wire retries:** almost gone.
- **The design itself still doesn't close timing:** worst path 86 ns at max against a 20.8 ns clock. So it still only works
  on best-case silicon.

## What checks out
- **Hashes:** 11/11 source files (including the new `src/sta.js`) match results.jsonl. The zip's results, report and
  page are byte-identical to the uploaded ones.
- **Rerun:** `node scripts/run-tests.js` (829 s here) reproduces **all 11 records** (timestamp and wall time aside), and
  `fs-sweep.json` too.
- **Page in real Chromium:** 0 errors, 0 warnings.
  - The header badge is honest ("5/9 TESTS PASS"), and the Tests tab badge now matches ("5 / 9 PASSED").
  - The mutant picker lists all 10.
  - The KPI strip's "+-" sign bug is fixed.
- **Round-7 asks:**

  | ask | result |
  | --- | --- |
  | close timing at max | **not done.** The netlist's timing paths are unchanged. |
  | add a static timing check to the suite | **done** (`src/sta.js`, Test 4 §3c). It **agrees with my independent probe:** max 115/137 endpoints fail, worst −67.72 ns, arrival 86.0 ns, same endpoint (U11 PE_N); min 22/137, −1.22 ns. Typ differs slightly (90 vs my 83 failing endpoints), within how the two tools treat a few arcs. |
  | the three logic-clocked flip-flops onto CLK_48M | **done, correctly.** U70.2, U139.2 and U140.2 are now CLK_48M flip-flops with an OR feedback (set and hold), cleared as before. My probe now lists only the 8 CPU-strobe registers off CLK_48M (the accepted async port interface). |
  | Tests 3, 6, 7 at a corner where the baseline passes, and say which | **done** (`evaluatedCorner: "min"`). Test 6: **10/10 killed**, with baselines MSC, HID and skew all passing; sof_missing now dies on an idle-keep-alive stage. Test 7 passes at min. |
  | explain the clean-wire retries | **fixed** rather than explained: keyboard 6 → 0, file 16 → 2. Two changes: START_OR_SOF now uses SOF_ACTIVE, and the CRC check is gated off the PID byte (LAT_PID_NOW_N). The remaining 2 file retries aren't explained. |
  | "+-", Tests badge, mutant picker, `[object Object]` | all fixed except **"+-" in the corner table** (`bare-usb.html` line 5597 still prepends "+" to a negative FSM slack). |

## Findings
1. **Timing is the whole remaining problem.** Both STAs agree: at max, 115 of 137 endpoints fail, by up to 67.7 ns.
   Nothing in the netlist moved toward closing it. Round 8 should be about this and nothing else.
2. **The report's root-cause section (§6) is stale.** It still says typ/max fail because of setup violations of "−1.31
   to −2.22 ns". The report's own §3c shows paths 2–4× the clock period. The small numbers are the dynamic checker's;
   the real gap is structural.
3. **The "Generated from" timestamp is hard-coded** (`run-tests.js` line 590: `'2026-11-18T10:58:36-05:00'`). Every
   run claims the same time, round 6's. Use the real time.
4. **Test 3 compares register traces exactly.** So the gate-level SIE fails against the reference only because it polls
   more (453 register operations vs 403), though both complete the workload. Better: compare the wire traffic and the
   data, and report poll counts separately.
5. **Test 8 is still the flat-out-polling metric** (99.4%). This one's on me: my PREREG criterion 3 needs restating
   (accesses per byte, plus an idle mode). For the record, it's now 40.24 accesses per 64-byte transfer, 0.63 per
   byte.
6. **The page's headline timing KPI** ("DPLL +0.68 ns") is the dynamic slack. With STA in the suite, the headline
   should show STA's worst slack at max (−67.7 ns).
