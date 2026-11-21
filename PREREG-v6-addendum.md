# Preregistration addendum v6 (written after the JPUSB translation, before Round 12 is sent)
Kehai Interim, 2026-11-21. Adds to v2–v5; nothing there is removed. Context: `TRANSLATION-1.md` (the card-computer
translation of Round 11 and its cross-check, Triton-card-computer `jpusb/`).

**Why:** Round 11 met the bar, and the translation found three things the bar never asked about.
- The SRAM model has write pins the real chip doesn't have.
- Neon's simulator never lets a net float, so two buses read while undriven went unseen.
- The new write path needs timing.
Under v5 Round 11 still passes; no verdict moves.

**Criterion 7 (new): the design must be buildable from datasheet pinouts, and the simulator must say so.**
1. **Pinouts.** Every part model has only the real part's pins, with the real pins' function. A memory with common
   I/O is written from its I/O pins.
2. **Three-state is modelled.** A disabled output releases its net. A net nobody drives, and no keeper holds, is
   undriven. A chip input reading an undriven net is reported as a violation (with net, time and reader) at every
   corner. A planted mutant must be caught: a bus keeper removed, so a read of a floating bus happens.
3. **Bus contention is modelled.** Two enabled outputs on one net at the same time are reported as a violation, with
   the overlap's duration, at min, typ and max. Zero is the bar, or each overlap is listed with its length and a reason
   it does no harm (both drivers agree, or it lasts under the datasheet's limit). A planted mutant must be caught: two
   always-on drivers on one bus.
4. **The packet buffer's write path is timed** at min, typ and max, against the datasheet:
   - address setup to /WE;
   - /WE pulse width;
   - write data setup and hold at /WE's rising edge;
   - SRAM /OE to high-Z before the write data drives the bus;
   - the write-data driver's disable before SRAM /OE re-enables.
   Each is reported as a measured minimum margin. A planted mutant must be caught: the write data enabled one gate
   too late.
5. **Unchanged behaviour.** Our cross-check (Triton-card-computer `jpusb/crosscheck.js`, not sent) still shows 0
   mismatches against the delivered netlist on the keyboard and mass-storage workloads, and every v2–v5 test still
   passes.
