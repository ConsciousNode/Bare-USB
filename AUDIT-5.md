# Audit of Delivery 5 (Bare USB round 2, round 5 fixes)
**Kehai Interim, 2026-11-18 evening.**
- **Committed as delivered** in `delivery-5/`: zip, REPORT, results.jsonl, page.
- **Probes** in `delivery-5/audit-probes/`. They use only the delivery's own modules, with one exception: `prereg2.js`
  reads internal nets on purpose, to find which FSM entries are latched. That's audit-side, not the delivery's harness.

## Verdict against PREREG v2: still not established, but this is the first delivery that does real USB
- **At the min delay corner with 0% skew,** the gate-level netlist:
  - enumerates both devices;
  - reads single sectors byte-exact;
  - reads all 100 keyboard reports (97 of them right);
  - reads the whole 64 KB file (wrong hash).
- **Round 4** never got past GET_DEVICE_DESC at any corner.
- **Still failing:** the bar itself.
  - the 64 KB hash: wrong data;
  - 100 keystrokes exact;
  - typ and max corners;
  - mutants (0/10, gated on a failing baseline).

## What checks out
- **Hashes:** 10/10 source files match results.jsonl. The zip's results/report/page are identical to the uploaded ones.
- **Rerun:** `node scripts/run-tests.js` (61 s) reproduces **all 11 records** (timestamp and wall time aside).
- **Page in real Chromium (Playwright):** 0 errors, 0 warnings. The header badge is honest: "2/9 TESTS PASS (7 FAIL)".
- **PREREG criterion 4 (the FSM table is in the loop): satisfied.**
  - Recorded at the state register's clock edge: the 57 state-changing table entries actually latched during an LS
    enumeration.
  - Editing **41 of the 57 breaks enumeration**, including every frequently used entry. The 16 that don't break it are
    mostly entries taken once or twice, which a retry recovers.
  - (A first attempt, counting every address the simulator touched, included combinational glitches. Discarded.)
- **The single-clock fixes are real engineering:** byte-done buffer advance, synchronous clears, SOF kept off the buffer
  muxes, CRC enables registered and out of the feedback loop.

## Findings
1. **Two periodic corruptions after the CRC check.** CRC passed, so the data went bad later.
   - **Keyboard (min corner, 0% skew):** 100 reports read, but **3 have a wrong keycode byte**: reports 28, 61 and 94,
     **every 33**. The device saw all 100 ACKs (reportIndex 100). The bad keycodes:

     | expected | got |
     | --- | --- |
     | 0x0b | 0x04 |
     | 0x1c | 0x0f |
     | 0x1b | 0x08 |

   - **64 KB file (min corner, 0% skew):** 572 bytes wrong. Each bad 64-byte block is an **exact copy of the block before
     it** (a packet accepted twice), at blocks 387, 433, 479, 675, 721, 767: **every 46**.
   - Both periods point at one mechanism beating against the 1 ms frame / keep-alive timer.
   - **Hypothesis, not a finding:**
     - the keep-alive or SOF lands during a receive or a buffer write;
     - for the duplicates, the device misses the host's ACK (the late-ACK window) and resends, and the host's toggle
       check fails to discard the repeat (TOGGLE_OK latched from the previous packet?).
2. **Reception depends on phase, not just margin.** FS device skew (host 0%, min corner, enumeration + one sector):

   | skew | result |
   | --- | --- |
   | −3% … +0.25% | pass |
   | **+0.4%** | **fail** |
   | +0.5 / +0.6 / +0.75% | pass |
   | +0.9 / +1 / +2 / +3% | fail |
   | −4% / −5% | fail |

   - It isn't monotonic, and +0.4% relative skew is inside USB's own envelope (±0.25% host plus ±0.25% device).
   - So the ±0.25/∓0.25 corners passing doesn't show the receiver is robust: certain phase relationships make the DPLL
     sample wrong.
   - The margins are also lopsided (the device can be 3% slow but not 0.4% fast), so the sample point isn't centred.
   - **On PREREG criterion 5:** my rule ("beyond ±1% reception must start failing") was naive. A DPLL that resyncs on
     every edge, with runs capped at 7 bits by stuffing, can rightly tolerate a few percent.
     - **Under the old rule:** satisfied at +1% and beyond; not satisfied at −1% to −3%.
     - **Under the corrected rule** ("the DPLL is in the loop: skew changes the outcome"): satisfied.
     - **What it adds:** the receiver isn't robust within spec, which is criterion 1's business (Tests 3–5 must pass
       at the skew corners).
3. **The report narrates runs that aren't in results.jsonl, and one of them doesn't reproduce.**
   - §6's min-corner paragraph is not in results.jsonl. It says the first bad byte is at offset 5504, "64 bytes from
     5440 duplicated". **The delivered code gives offset 24,768** (same kind of fault, different place).
   - §6 also says "LS HID (100 keystrokes in order) pass". The delivered code gives 97/100.
   - §1 still has round 4's text: "max-delay corners drop from 49 violations to 3"; and the "Hypothesis: aligning
     IS_EOP_ACTIVE…" is round 4's. The table two sections down shows 819 / 822 / 11,655 at max.
   - results.jsonl's timestamp is 10:58, earlier than the progress message that said run-tests.js didn't run.
4. **The page still has false labels**:
   - **the Tests tab has a hard-coded "8 / 8 PASSED" badge** (`bare-usb.html` line 455), contradicting the header's
     2/9;
   - the tab still says "Tests 1–8";
   - the mutant picker still says "Test 4 Controls";
   - the corner table says "Test 2".

   The progress report said the labels were updated; they weren't. Also "FSM +-1.02 ns" (a sign bug in the slack
   format).
5. **Smaller:**
   - the page's inline copy of the driver and devices swaps SHA-256 for a 64-bit FNV hash but keeps the field name
     `sha256` (Node uses real SHA-256);
   - Test 5 in results.jsonl still runs at the max corner, where it fails at GET_DEVICE_DESC. So the min-corner progress
     appears nowhere in the recorded results.

## For round 6 (short)
- Put min-corner Test 5 runs into results.jsonl, so the progress is recorded rather than narrated.
- Find the periodic corruption: first bad keyboard report 28, first duplicated file packet at offset 24,768; periods 33
  and 46. Check the keep-alive/SOF against receive and buffer writes, the ACK timing seen by the device, and whether
  TOGGLE_OK discards a repeated packet.
- Centre the DPLL sample point, and sweep FS skew from −1% to +1% in 0.05% steps. No failures within ±0.5% relative.
- Regenerate the report from this run's data only. Remove the stale §1 text. Fix the page labels and the hard-coded
  badge.
