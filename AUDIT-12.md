# Audit of Round 12 (Kehai Interim, 2026-11-22)
**Verdict: meets the bar.** Everything Round 12 asked for is done, it's measured where it says, and our own independent
cross-check agrees. Three reporting/declaration items, none of which changes a result.

## What was checked
1. **Delivery integrity.** All 11 code hashes match results.jsonl (combined `48bf4213…ce51a`). The separate uploads
   are byte-identical to the zip's REPORT.md, results.jsonl and bare-usb.html (ARRIVED-12.md).
2. **The diff against Round 11, read by hand:**
   - netlist: U106–U109 are now 74LVC257A driving BD directly; U41/U42 have no D pins; U46, U47, U67 and U68 are
     SN74LVCH245A; the /OE bracket is built from spare gates (U277 sections 3 and 4, U201.2, U153.1). 260 ICs, the
     same as Round 11 (our translation's 257 leaves out the oscillator, transceiver and passives).
   - **pin-harness.js changed (3 lines):** the host now releases PORT_D0..15 after every access. That is the honest
     direction: the old harness held the port bus forever, a hidden keeper. It makes the checks stricter, and it's
     why `keeper_removed` finds a floating read on U46's A side. No accessor, console or auditor script changed.
3. **The three-state model (simulator.js), read by hand.**
   - A net with no enabled driver and no keeper is marked floating, and every listener actually reading it is
     reported at that moment. A floating net is also reported when a chip starts reading it later: transceiver
     enable, flip-flop clock, SRAM write.
   - Contention is timed from the second driver's enable to the release.
   - Keepers exist only on SN74LVCH245A A/B pins.
   - Soft spot (no effect on any result): a keeper's power-up value is 0, where a real bus-hold cell's is
     indeterminate. Nothing reads those buses before they are first driven.
4. **Independent cross-check:** Neon's Round 12 netlist retranslated into the card computer's part library
   (`jpusb/translate.js`, no fixes of ours needed any more) and run beside Neon's simulator, every shared net
   compared before every 48 MHz edge.
   - hid: 137,288 edges × 1,109 nets, **0 mismatches**; msc: 205,065 edges × 1,109 nets, **0 mismatches**.
   - BD is now compared at every edge, write windows included.
   - Only FL_D0..7 float in our model: the boot flash's data pins, read by nothing outside reset (JPUSB finding 4).
   - Controls: `neon:mux257_enable_delayed` 21 mismatches and `swap574` 27, both stopped the run. `keeper_removed`
     shows 0 mismatches and no float on our side, because on our side PORT_D is a world input, always driven. That
     control is caught by Neon's simulator only (384 floating reads). Our side will see that boundary for real when
     the JPUSB is wired to the backplane (JPUSB step 2).
   - Raw output: `delivery-12/audit-probes/crosscheck-{hid,msc}.txt`.
5. **The declared false paths (sta.js).** Without them, 8 endpoints fail at max (worst −16.8 ns), all paths from the
   buffer write controls through BD into the TX byte latch U93. USB 1.1 is half-duplex, so they are false.
   - **Our check of the strong form:** on our side of the cross-check, the TX latch never captures (TX_LAT_EN = 1)
     while the '257s drive or an RX or CPU write window or pulse is on. **0 of 1,105 captures** (289 hid + 816 msc).

## Findings
1. **Test 5's min and max runs never counted floating reads or contentions** (only typ did), and generate-report.js
   prints a missing field as `|| 0`, so REPORT.md §2 shows unmeasured zeros at min and max. Test 4's shorter corner
   runs do count both at min and max (all 0).
   - **Measured by us:** `audit-probes/t5-tristate.js` loads the delivered run-tests.js unchanged, exports only
     safeWorkload, and runs Test 5's exact workloads. All four: **0 floating, 0 contentions, 0 timing violations**.
     msc min 1,885 s and max 2,074 s, file SHA-256 `9329320a…74e29` both; hid 100/100 at both.
     (`audit-probes/t5-tristate.txt`)
   - So the zeros are true, but the report shouldn't have printed them.
2. **sta.js cuts more than DECLARED_FALSE_PATHS says.** Line 424 drops every path through any 74LVC257A onto BD, not
   only the enable path FP_WR_MUX_TO_TX_LAT declares. The reasoning covers it (a disabled '257 can't affect BD), but
   the declaration should match the code.
3. **Two of the three dynamic invariants are weaker than their reasons.** FP_CPU_WR_TO_TX_LAT and FP_WR_MUX_TO_TX_LAT
   check only S_TX_DATA, while the reasons say U93 also captures in S_TX_DPID. The strong form (against TX_LAT_EN)
   holds in our check above.

## Not re-run
The full 111-minute suite wasn't rerun end to end. We reran the parts that carry the new claims: the cross-check on
both workloads, plus Test 5's four long workloads with the counters Test 5 left out.
