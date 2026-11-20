# Audit of Delivery 8 (Bare USB round 8, Gemini 4 Neon)
**Kehai Interim, 2026-11-19, late evening.** Round 8 asked for one thing: close timing at the max corner.
Committed as delivered in `delivery-8/` (ARRIVED-8.md). Probes: `delivery-6/audit-probes/sta.js` (ours, unchanged),
`delivery-8/audit-probes/page.py`.

## Verdict: not established. Real progress, an honest failure, and one claim that's too strong
- **Max-corner timing is still open:** worst slack −67.72 ns, the same 86.1 ns serializer chain as round 7.
- **The min corner now closes cleanly** (0 failing endpoints; round 7 had 22 marginal).
- The report says plainly that typ and max fail. Nothing was rigged.
- **But "blocked by the physical floor" is too strong** (see below). It's design work left undone, not a law of
  physics.

## What checks out
- **Hashes 11/11.** The zip's page, report and results are byte-identical to the uploaded files.
- **Our rerun** (`node scripts/run-tests.js`) reproduces all **11/11 records** (timing fields aside).
- **The rules held.** `parts-library.js` and `sta.js` are **unchanged** since round 7: same delay data, same arc rules,
  same period. The changes are in `netlist.js`, `run-tests.js` and the report/page builders.
- **Netlist work:** ACTIVE_CLK_SEL registered (U215), FSM table outputs registered (U216), and IS_EOP_STATE taken
  off the U52 table (U217/U218). That breaks the old two-SRAM loop and closes min. 207 chips.
- **Our STA agrees on min** (0 failing). At max, ours gives 122/149 failing at −71.22 ns, theirs 116/146 at −67.72 ns.
  The difference includes new paths **through the USB transceiver** (TX_VPO → U06 → RCV_IN / DP_IN / DM_IN into the
  input synchronizers U04/U200). Those are an asynchronous crossing my probe doesn't exclude, so it's a methodology
  gap on my side, not a finding. Round 9 asks for the async inputs to be declared explicitly so both tools agree.
- **Small asks:**
  - §6 regenerated from the STA: done.
  - Real timestamp (`new Date()`): done.
  - Headline KPI = STA max slack: done.
  - "+-": gone.
  - The page has 0 errors in real Chromium.

## Findings
1. **"Physical floor" is a per-stage limit, not a design limit.** Their numbers are right: '574 clk→Q 7.0 + SRAM
   10.0 + tsu 2.0 = 19.0 ns, so one stage holds one SRAM lookup, or about two gates, at max. But a full-speed bit is
   4 clocks (83.1 ns). The serializer can work one bit ahead in registered stages. Registering U53's output alone
   splits the 86.1 ns chain into halves that each fit a 4-clock window. Round 8 offered pipelining and declared
   multicycle paths; the delivery used neither for the serializer.
2. **Test 3 can't pass for a harness reason.** Test 3 now compares data hashes (as asked), but
   `runReferenceWorkload` never computes `actualHash`, so `refDataSha256` is always null. Its HID branch also uses
   `idleGapMs`, `harness` and `sim`, which aren't defined there.
3. **The page's FS budget KPI reads "undefined µs"** (it takes the failed max-corner workload).
4. The remaining 2 clean-wire retries on the 64 KB read aren't explained (not asked in round 8; round 9 asks).

## Against the preregistration
- **v2 criteria 1–5:** not met (tests 3, 4, 5 fail).
- **v3 addendum:** criterion 6 (timing at max) is not met; 7 (delay data unchanged) **holds**; 8 is not met; 9 holds
  (hand read: no program counter; the tables regenerate).
- **CPU metric (restated, reported separately):** 40.24 accesses per 64-byte transfer = 0.63 per byte (comfort ≤ 1.0).
  Idle duty isn't measured yet.
