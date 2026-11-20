# Audit of Delivery 6 (Bare USB round 2, round 6 fixes)
**Kehai Interim, 2026-11-18 late evening.**
- **Committed as delivered** in `delivery-6/`: zip, REPORT, results.jsonl, page. The two uploaded pages (`…_5.html` and
  `…_6.html`) are byte-identical. Against the page inside the zip they differ only in two KPI lines: the uploaded copy
  says "not measurable" instead of printing `undefined` when a workload failed. So the uploaded page is slightly newer
  than the zip's.
- **Probes** in `delivery-6/audit-probes/`:
  - `probe6.js`: round 5's job runner, against the delivery's own modules;
  - `sta.js`: a static timing check of the delivered netlist. It reads the chip list, so it is audit-side, not a harness;
  - `page.py`: Playwright.

## Verdict against PREREG v2: not established
All round-6 requests at the min delay corner are met, and that is real progress. But the netlist only works at the min
(best-case silicon) corner. A static timing check shows why: its longest clock-to-clock paths are 2–4× the 48 MHz
period at typical and worst-case delays. You can't order best-case silicon, so as drawn this can't be built.

## What checks out
- **Hashes:** 10/10 source files match results.jsonl. The zip's results and report are byte-identical to the uploaded
  ones.
- **Rerun:** `node scripts/run-tests.js` (771 s here) reproduces **all 11 records** (timestamp and wall time aside), and
  `fs-sweep.json` too.
- **Page in real Chromium:** 0 errors, 0 warnings. The header badge is honest: "2/9 TESTS PASS (7 FAIL)".
- **Round-6 asks, at the min corner:**

  | ask | result |
  | --- | --- |
  | periodic corruptions | **fixed.** 100/100 keystrokes exact (my probe agrees). The 64 KB file's SHA-256 matches. The cause was SOF/keep-alive setting DONE and clearing START; it's now guarded (U212/U213). |
  | FS skew sweep −1% … +1% in 0.05% steps, no failures within ±0.5% | **met: 21/21 within ±0.5%.** 39/41 overall: +0.55% fails at GET_CONFIG_DESC, +0.6 … +0.95% pass, +1.0% fails. That is still non-monotonic just outside the envelope, so some phase sensitivity is left. 0 timing violations at those points, so it's functional. |
  | min-corner Test 5 in results.jsonl | **done** (`fsMassStorageMin`, `lsHidKeyboardMin`). |
  | report from this run only | **done**, apart from a "Tables Digest: `[object Object]`" print bug. |
  | page labels | hard-coded badge gone, "Tests 1–9" and "Test 6 Controls" fixed. **"FSM +-1.02 ns" is still there** (KPI strip and corner table). |

## Findings
1. **Static timing: the design can't run at 48 MHz on real parts.** `audit-probes/sta.js` walks the netlist's
   combinational arcs, gate slice by gate slice. It times each register-to-register path launched and captured by
   CLK_48M, at period 20.78 ns (+0.25%). Strict mode keeps synchronous arcs only, with no async clears and no
   transceiver echo:

   | corner | endpoints with negative slack | worst slack |
   | --- | --- | --- |
   | max | 112 / 134 | **−67.7 ns** (path of 86.0 ns) |
   | typ | 81 / 134 | −34.2 ns |
   | min | 22 / 134 | −1.2 ns |

   - **The shape of the worst paths:** two SRAM lookups and 12–18 gates in a single clock. For example:

     > FSM state → state decoder → S_AUTO_ACK → header-PID mux → **U52 header table** → IS_EOP_STATE → EOP done →
     > EOP_VALID → **U35 FSM table** → TX_OE → ACTIVE_CLK_SEL → ACTIVE_EN → … → stuff counter / byte counter / RX
     > length.

     That alone is 2 × 10 ns of SRAM plus about 15 gates.
   - **Caveat:** structural STA can include false paths, so the exact numbers may be pessimistic. But 112 failing
     endpoints and a factor of 4 at max is not a false-path artefact. It also matches the dynamic checker: 0 violations
     at min; 4,309–11,768 at typ; enumeration dies at max.
   - **A detail worth knowing:** typ shows more violations than max (11,768 vs 819). That's only because max dies at
     GET_DEVICE_DESC after 2.2M gate evaluations, while typ runs 36M. It is not a sign that typ is the harder corner.
   - **Ways out (for round 7):**
     - put a register on the FSM table outputs (one SRAM per cycle);
     - break the EOP_VALID → FSM table → TX_OE → ACTIVE_EN chain;
     - or declare the FSM update a **multicycle path** (it only changes on the once-per-bit ACTIVE_EN: 4 clocks at FS,
       32 at LS) and check those constraints explicitly. Note that even 4 × 20.8 = 83 ns is below the 86 ns worst path
       at max.
2. **Not one clock domain.** The netlist header says every flip-flop is on CLK_48M, but 11 registers aren't:
   - CPU-strobe clocks (CMD/TARGET/TXLEN latches, START, buffer address): an accepted asynchronous port interface;
   - **three clocked by combinational logic:**
     - U139.2 on ERR_TIMEOUT_CMB = TURN_TIMEOUT & CTRL_TURN_EN;
     - U140.2 on SOF_TRIG_ST;
     - U70.2 on SOF_TRIG_OUT.

     A glitch on any of these clocks the flip-flop. Those three should be clock-enabled on CLK_48M.
3. **Mutants (Test 6) were judged at max, where the baseline fails, so nothing could be killed.** I reran all 10 at
   min, with the LS keyboard (enumerate + 100 keystrokes, `probe6.js`):
   - **baseline:** 100/100;
   - **killed (7):** crc16_tap_moved, bit_stuff_off_by_one, nrzi_rx_inverted, turnaround_short, fsm_bad_next_state,
     auto_ack_late, reg_dec_swapped;
   - **survived (3), each because this workload can't see it:**
     - `sof_missing`: polling keeps the device awake, so it never sees a 3 ms idle;
     - `buf_addr_carry_broken`: 8-byte packets never carry past the low nibble;
     - `dpll_resync_disabled`: short LS packets at 0% skew.

     They need the FS 64-byte workload, an idle gap and a skewed device.
4. **Retries on a clean wire.** At min with no injected faults, the baseline needs 6 retries for the keyboard and 16 for
   the file. A clean line should need none, so something still goes wrong now and then and gets retried away. The
   report doesn't mention it.
5. **CPU budget (Test 8 / PREREG criterion 3): the metric can't fail differently.**
   - The driver polls flat out, and simulated time only advances by its 10 µs accesses, so "99.4% of each 1 ms frame"
     is close to 100% by construction.
   - **A more telling number,** from their own counts: 40.47 accesses per 64-byte transfer = **0.63 accesses per
     byte**. The floor for a 16-bit port is 0.5, so overhead is 26%.
   - **My PREREG criterion 3 needs restating.** "≤ 30% per frame" only makes sense if the driver is allowed to pace
     itself. Better: accesses per byte, plus an idle-wait mode (IRQ or sleep) measured separately.
6. **Page leftovers:**
   - "+-1.02 ns" in two places;
   - the Tests tab badge is blank ("—");
   - the mutant picker lists 5 of the 10 mutants;
   - the packet table shows bus transitions with `undefined` in the speed/length/bits columns;
   - the in-page copy still swaps SHA-256 for FNV-64 under the name `sha256` (Node uses real SHA-256).

## For round 7 (short)
- Make it close timing at the **max** corner. Pick one: pipeline the FSM table outputs, or declare multicycle paths and
  prove them. Add a static timing check to the suite (any path over the period at max fails).
- Run Tests 3, 6 and 7 at a corner where the baseline passes, and say which. When max passes, run them at max.
- Move the three logic-clocked flip-flops onto CLK_48M with enables.
- Explain the clean-wire retries (6 keyboard, 16 file).
- Fix: "+-" slack format, Tests tab badge, the mutant picker (all 10), `[object Object]`.
