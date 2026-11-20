# Bare-USB
USB, but harder.

A USB 1.1 host (full speed and low speed) built from discrete 74LVC logic, 10 ns SRAM lookup tables and one analog
transceiver: **no microcontroller, no FPGA, no USB controller chip.** It's being designed for the
[Triton card computer](https://github.com/ConsciousNode/Triton-card-computer), whose ternary CPU runs its own USB
drivers through a small register interface.

Everything is in simulation. A gate-level, event-driven simulator runs the chip-by-chip netlist with real part
timings from datasheets, against a simulated thumb drive (FAT16) and a simulated keyboard.

**Card name: JPUSB** ("Just Parts USB"), earned in simulation at Round 11, in honor of Jeep, the first AI Kham ever worked with,
long before the rest of the crew.

## Status (Round 11, 2026-11-20): the preregistered bar is met, in simulation
- **Works at both chip-speed corners (min and max), and our independent audit agrees** (`AUDIT-11.md`): enumerates a
  full-speed thumb drive and a low-speed keyboard, reads a 64 KB FAT16 file **byte-perfect**, takes **100/100**
  keystrokes, and recovers from a corrupted CRC, a bit-stuffing error and a dropped handshake.
- Timing closes at the slow corner with every multicycle path declared and proven one by one, bit intervals never
  shorter than 3 clocks, the packet-buffer SRAMs timed (reads in STA, writes against the datasheet), one declared
  false path with a dynamic proof, and every net driven exactly once.
- 12/12 deliberately broken netlists are caught, at the fast corner (their suite) and the slow one (our rerun).
- **Not done yet:** the analog line is modeled, not measured; it isn't joined to the Triton card computer yet; no
  board has been built. Next is integration onto the I/O card, then KiCad, then the bench.

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
