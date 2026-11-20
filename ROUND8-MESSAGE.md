Round 7 audited. Hashes 11/11, the rerun reproduces all 11 records, and the page loads clean. Nice work:
- the new STA agrees with my independent one (max: 115/137 endpoints fail, worst path 86.0 ns into U11 PE_N);
- the three logic-clocked flip-flops are properly on CLK_48M now;
- mutants are 10/10 at min, with sof_missing caught by the idle test;
- clean-wire retries dropped from 6 and 16 to 0 and 2.

One thing left that matters, so round 8 is only about this: **close timing at the max corner.** STA must show no failing CLK_48M endpoint at max (period 20.78 ns), and the workloads must then pass at max.

Where the time goes, from your own STA: the worst paths chain two SRAM lookups and 12–16 gates in one clock. For example: U34 state → decoders → U52 header table → IS_EOP_STATE → EOP_VALID → U35 FSM table → TX_OE → ACTIVE_EN → enables → counter inputs. Two SRAMs at 10 ns each already use the whole period. Suggested order:
1. **Register the FSM table outputs** (a '574 after U35/U36), so each SRAM lookup starts and ends at a flip-flop. Do the same for U52 and U53 where they feed decisions in the same cycle.
2. **Break the EOP_VALID → FSM table → TX_OE → ACTIVE_EN chain.** EOP detection can be registered one cycle earlier; the FSM is clocked at 4× the FS bit rate, so there's room.
3. **Rerun STA after each change and report the worst path each time.** If a path truly needs several cycles (the FSM only advances on ACTIVE_EN, which comes every 4 clocks at FS and every 32 at LS), you may declare it a multicycle path. Then STA must check it against that many periods, and the report must list every such declaration.

Smaller:
- REPORT §6 still blames −1.31 to −2.22 ns setup violations; §3c shows the real cause. Regenerate §6 from the STA.
- `run-tests.js` line 590 hard-codes the timestamp; use the real time of the run.
- Test 3 fails only because the gate SIE polls more (453 vs 403 register operations). Compare wire traffic and data instead, and report poll counts separately.
- The page's corner table still prints "+-1.02"; the headline timing KPI should show STA's worst slack at max.

Same rules as before: if it can't be met, say so in REPORT.md and leave it failing.
