# Bare-USB
USB, but harder.

A USB 1.1 host (full speed and low speed) built from discrete 74LVC logic, 10 ns SRAM lookup tables and one analog
transceiver: **no microcontroller, no FPGA, no USB controller chip.** It's being designed for the
[Triton card computer](https://github.com/ConsciousNode/Triton-card-computer), whose ternary CPU runs its own USB
drivers through a small register interface.

Everything is in simulation. A gate-level, event-driven simulator runs the chip-by-chip netlist with real part
timings from datasheets, against a simulated thumb drive (FAT16) and a simulated keyboard.

## Status (Round 9, 2026-11-20)
- **Works at the fast-chip (min) corner:** enumerates both devices and reads a 64 KB file **byte-perfect**, and
  types 100/100 keystrokes. 11/11 deliberately broken netlists are caught. Error injection recovers. Runs are
  deterministic.
- **Not yet at the slow-chip (max) corner.** One transmit chain is still about 80 ns of logic in a single 20.8 ns
  clock, and the multicycle-path declarations used to close timing don't hold up (see `AUDIT-9.md`).
- Round 10 asks for real pipelining (`ROUND10-MESSAGE.md`).

**So: not a working design yet, and not a dead end either.** It's a named list of paths that need fixing.

## How it's made
The netlists are built by an outside model (Google Gemini: "Argon", later "Neon") from specs we write. Every
delivery is committed exactly as delivered, before anyone looks at it, and then audited independently:
- hashes checked;
- the full test suite rerun bit for bit;
- an independent static-timing tool;
- hand-written probes;
- the page loaded in a real browser.

The pass bar is preregistered and committed before results exist. When the bar itself turns out wrong, we say so
and report under both rules.

Wrong turns are kept, ours included. `AUDIT-9.md`'s "Our side" section is a spec mistake of ours, owned in public.

## Layout
- `SPEC.md`, `PARTS.md`, `TIMING-BUDGET.md`, `IO-NOTES.md`: the original spec and its delay data. `v2/` is the
  closed-netlist rework.
- `PREREG.md`, `PREREG-v3-addendum.md`, `PREREG-v4-addendum.md`: what counts as success, written in advance.
- `ROUND*-MESSAGE.md`: each request exactly as sent. `ROUND8-REDRAFT-not-sent.md` is a draft that was superseded.
- `delivery-N/`: each delivery as received, with `audit-probes/` where we wrote our own checks.
- `AUDIT-N.md`: the audit of each delivery. `ARRIVED-N.md`: hashes on arrival.

## Running a delivery
```
cd delivery-9/src
node scripts/run-tests.js     # about 11 minutes; writes results.jsonl and REPORT.md
```

## Notes
- USB 1.1 is from 1998, and its specification is freely available. A host needs no USB vendor ID. "USB" here
  describes the protocol; this project isn't certified by or affiliated with the USB-IF.
- MIT license, see `LICENSE`.
