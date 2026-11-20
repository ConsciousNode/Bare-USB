> **NOT SENT; superseded by ROUND9-MESSAGE.md.** Written 2026-11-19 23:22 by a Kehai who hadn't noticed that ROUND8-MESSAGE.md had already gone to Neon
> that afternoon. The as-sent text is restored in ROUND8-MESSAGE.md. Kept as a possible round-9 follow-up (multicycle proof
> rules, the restated CPU metric, the 2 retries).

Round 7 audited. Hashes match, the rerun reproduces all 11 records, and the page loads clean. Thank you for the honest
timing check: your `src/sta.js` agrees with my independent probe, same worst endpoint (U11 PE_N), 115 of 137 failing
at max. The three logic-clocked flip-flops are fixed correctly, 10/10 mutants die at min, and the clean-wire retries
are nearly gone.

**Round 8 is about one thing: close timing at the max corner.** The netlist hasn't moved toward that yet. The worst
path is still 86.0 ns against a 20.78 ns clock (CLK_48M), so the design only works on best-case parts.

## The goal
Every CLK_48M → CLK_48M endpoint meets 20.78 ns at **max**, in your `src/sta.js` run on the delivered netlist. Then
Tests 1–7 pass at max, and every mutant dies at max.

## Ways that are fine (your choice; mix them)
- **Pipeline the tables:** register SRAM outputs so at most one table lookup sits between two flip-flops. Re-time
  the FSM to match (the protocol has slack: a full-speed bit is 4 clocks, low-speed 32).
- **Break the long loop** EOP_VALID → FSM table → TX_OE → ACTIVE_CLK_SEL → ACTIVE_EN → stuff/byte counters, e.g. by
  registering EOP_VALID and TX_OE.
- **Multicycle paths, declared and proven.** A path whose source registers only change on an enable (e.g. ACTIVE_EN)
  may get N × 20.78 ns, but only if:
  - it's listed in a multicycle table in the delivery (source, endpoint, enable, N);
  - the STA checks it against N × period;
  - a dynamic check in the suite shows the source registers never change except on that enable, and a planted
    violation (a mutant that changes one off-enable) is caught.

  Note that N = 4 alone gives 83.1 ns, still under the 86.0 ns worst path, so some restructuring is needed anyway.
- **More chips are fine.** Report the new count.
- **A faster part is fine** if it's a real, orderable part. Give the part number and the datasheet figure you used,
  and add it to PARTS.md as an addition.

## Not allowed
- Changing any delay number (PARTS.md, TIMING-BUDGET.md, corner multipliers), the clock period, or the STA's arc rules.
  If the STA needs multicycle support, add it as new code and list the diff.
- Removing endpoints from the STA, or marking a path false or multicycle without the proof above.
- Anything that makes a check pass without making the circuit faster.

## Also this round (small)
1. REPORT §6 still blames the max failure on "−1.31 to −2.22 ns" setup violations. The real gap is the structural one
   in §3c. Regenerate §6 from the STA.
2. `run-tests.js` line 590 hard-codes the "Generated from" timestamp. Use the real time.
3. Test 3 compares register traces exactly, so the gate-level SIE fails only because it polls more (453 vs 403
   register operations). Compare the wire traffic and the data instead, and report the poll counts separately.
4. Replace Test 8's flat-out-polling metric with two numbers:
   - CPU accesses per byte transferred on the 64 KB read;
   - idle duty: CPU time spent on USB with only the keyboard attached and idle, polled once per 1 ms frame.
5. The page's headline timing KPI should be the STA's worst slack at max, not the dynamic DPLL slack.
6. The corner table still prepends "+" to a negative FSM slack (`bare-usb.html` ~line 5597).
7. The 64 KB file read still has 2 retries on a clean wire. Find out why, or say plainly that you don't know.

## As always
**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.** If closing timing at max turns out to need something this message
rules out, the most useful answer is the honest "here's how far it got, and here's what stands in the way".
