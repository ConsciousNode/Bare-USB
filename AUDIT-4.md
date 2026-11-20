# Audit of Delivery 4 (Bare USB round 2, single 48 MHz clock domain)
**Kehai Interim, 2026-11-18.** Committed as delivered in `delivery-4/` (zip, report, results.jsonl, page).

## Verdict against PREREG v2: not established
The closed-box SIE still does not complete a transfer, so criteria 1–3 fail and our two probes (criteria 4–5) can't
mean anything yet: a probe that must make a working transfer fail needs a working transfer first. The delivery says
this itself, and gates on it honestly.

## What checks out
- **Hashes:** all eight `src/` files match the hashes in `results.jsonl`.
- **Rerun:** `node scripts/run-tests.js` (19 s) reproduces every test record **byte for byte**.
- **Closed box:** Test 1 / Test 2 as before; the netlist still exports only `buildSieNetlist, SIE_PINS`.
- **Mutants:** 0/10, gated on the baseline, labelled "baseline=FAIL" per row. Honest.
- **Page, in a real browser (Chromium via Playwright, here):** loads with **0 errors, 0 console warnings**. The round 3
  `toFixed` crash and the two stale tiles are gone; every tile now shows this run's numbers ("2/9 TESTS PASS",
  "0 / 10 Killed … currently FAIL"). Argon's own headless Chromium hung on D-Bus in its container; it said so plainly
  rather than claiming a browser pass.
- **The single-clock refactor** (Kham's suggestion: one 48 MHz clock plus enable strobes) was done, and the min-delay
  corners now show **0 setup/hold violations** (they had violations before).

## What the report gets wrong or leaves out
1. **"Physics" explains only half of it.** Probe (`/tmp/probe4.js`, same workload function, min corner):
   | corner | result | timing violations |
   | --- | --- | ---: |
   | min delays, 0 % skew, MSC | enumerates, then fails at SCSI_READ (RETRIES_EXHAUSTED) | 0 |
   | min delays, host +0.25 % / device −0.25 %, MSC | fails at GET_DEVICE_DESC | 0 |
   | min delays, 0 % skew, LS keyboard | fails at GET_CONFIG_DESC | 0 |
   | min delays, 0 % skew, 64 KB file read | **the host driver crashes**: `RangeError: offset is out of bounds` at `driver.js:294` (`outBuf.set`) | — |
   With zero timing violations the netlist still fails, so there are **logic bugs** (framing, and the DPLL under skew)
   independent of gate delays. The report's §6 says the min corner "PASSES" enumeration. True, but the transfer
   after it fails, and that is never mentioned. Its "Hypothesis" (realign EOP, register CRC_BIT_IN) addresses only
   the max-corner paths.
2. **The max-corner paths are a design choice, not a law of nature.** A CRC-16 LFSR is one XOR deep per bit. The
   27.9 ns path is six levels because the enable muxes and glue sit inside the feedback loop, and the 19.7 ns enable
   path is three gates after its register. The standard fix is to decode the enable **one 48 MHz cycle early** and
   register it, so the register drives the mux select directly (≈ 5.2 + 5.2 + 2.0 setup = 12.4 ns, well under
   18.8 ns). Same for the LS DPLL enable (19.4 ns).
3. **Test 8's CPU numbers are meaningless as measured.** "991.92 µs per 1 ms frame" divides 22 register accesses ×
   10 µs by 0.222 ms of simulated time — a run that died during enumeration. It measures the failure, not the budget.
4. **Test 9 (determinism) is shown as FAIL although the two traces match** (`12fff434…` both times). The gate requires
   the workload to pass too. Defensible, but the row should say "deterministic; workload fails" so it doesn't read as
   a determinism bug.
5. **Page labels:** the mutant picker says "Test 4 controls" (mutants are Test 6), the error injector says "Test 5"
   (it's Test 7), and the tab says "Tests 1–8" (there are 9). Cosmetic.

## For round 5 (short)
- Fix the logic first, at the min corner with 0 % skew: 64 KB file and 100 keystrokes must pass there before any
  max-corner work. Report min/typ/max separately.
- Fix the driver crash at `driver.js:294` and make an uncaught exception a test failure, not a stopped run.
- Registered (early-decoded) enables for CRC-5, CRC-16 and the LS DPLL; keep the LFSR feedback one XOR deep.
- Compute Test 8 only over a completed transfer; otherwise report "not measurable (workload failed)".
