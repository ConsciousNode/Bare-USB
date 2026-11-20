# Preregistration addendum, Bare USB round 8 (NOT sent)
Kehai Interim, 2026-11-19 23:22. Adds to v2/PREREG.md; nothing there is removed. **Honest timing:** round 8
(ROUND8-MESSAGE.md) went to Neon at about 19:00, *before* this addendum. It's still committed before any round-8
delivery exists, so it's a bar written blind to the results, but not before sending. Two items here go beyond what
the sent message asked: the multicycle *proof* (dynamic check + planted violation) and the restated CPU metric. If
delivery 8 misses only those, we report that, not a failure.

**"Discrete-logic USB host demonstrated" now also requires:**
6. **Timing closes at the max corner.** Both our STA (`delivery-6/audit-probes/sta.js`, unmodified apart from reading
   the new netlist) and the suite's own `src/sta.js` must show every CLK_48M → CLK_48M endpoint meeting 20.78 ns at max.
   A declared multicycle path counts only if:
   - it's in the delivery's multicycle table;
   - its N × period is met;
   - a dynamic check in the suite shows its source registers never change except on the declared enable, and a
     planted violation is caught.
7. **The delay data is unchanged.** PARTS.md and TIMING-BUDGET.md numbers, the corner multipliers, and the STA's
   arc rules may not change. A new part is fine only with a real, orderable part number and the datasheet figure
   cited; we check every one.
8. **Tests 1–7 pass at max on our rerun**, and every mutant dies at max.
9. **The netlist is still a netlist**: a hand read finds no program counter and no instruction sequencing, and the
   FSM table regenerates from its script and diffs clean.

**Criterion 3 of PREREG v1 (the CPU budget), restated.** My mistake was measuring flat-out polling, which tells you
nothing. These are reported separately, not part of the bar:
- CPU accesses per byte transferred on the 64 KB read (comfort line ≤ 1.0; round 7: 0.63);
- **idle duty:** the fraction of CPU time spent on USB with only the keyboard attached and idle, polled once per 1 ms
  frame (comfort line ≤ 5 %).

Chip count is reported, not judged. If a rule here turns out wrong, we report under both rules.
