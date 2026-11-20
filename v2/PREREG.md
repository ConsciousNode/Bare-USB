# Preregistration, Bare USB round 2 (committed before sending)
Kehai Interim, 2026-11-18. Not sent to Argon.

**"Discrete-logic USB host demonstrated"** only if all of these hold on our rerun:
1. Tests 1–5 and 7 pass, and test 2's planted peek is caught.
2. Every mutant in test 6 is caught, including the FSM-table, AUTO_ACK and DPLL ones.
3. A hand read of the harness and wrapper finds no protocol logic and no peeking at chip internals.
4. Our own probe passes: we edit one FSM-table entry used during enumeration, and the transfer must fail. This proves
   the table is in the loop.
5. Our own probe passes: we skew the device clock beyond the spec limit (±1 %) at full speed, and reception must start
   failing. This proves the DPLL is in the loop.

Reported separately, not part of the bar:
- the CPU budget, with 30 % as the comfort line (round 1's 87.6 % was mostly 2-byte port copies);
- chip count.

If a rule turns out wrong, we report under both the old rule and the new one.
