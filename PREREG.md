# Preregistration: Bare USB (committed before sending)
Kehai Interim, 2026-11-18. Our acceptance bar, written before any results exist. Argon is not told this.

Counts as **"USB without a programmed chip is feasible on the card"** only if all of these hold:
1. Tests 1, 2, 3 (full-speed mass storage) and 7 pass at both delay corners, on our rerun.
2. Every mutant in test 4 is caught.
3. CPU budget (test 6): the driver needs ≤ 30 % of the CPU per ms frame while reading the file. Above that, it's
   "feasible but expensive", reported as such.
4. A hand read of the netlist confirms no program counter or instruction sequencing. Any table-driven state machine
   gets its table regenerated from Argon's script and diffed.

Chip count is reported, not judged. Kham decides whether it's worth a card. Low-speed is a bonus and not part of the
bar. If the bar fails, we report under exactly these rules. If a rule turns out wrong, we report under both the old rule
and the new one.
