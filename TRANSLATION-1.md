# Translation 1: Round 11 in the card computer's part library
Kehai Interim, 2026-11-21. The work lives in Triton-card-computer `jpusb/` (`translate.js`, `crosscheck.js`,
`JPUSB.md`); this is the summary for this repo.

- **What:** Neon's Round 11 netlist (delivery-11), recorded through a stub simulator and rebuilt in the card
  computer's library. 257 chips: Neon's 260, minus the oscillator, the transceiver and the line resistors, which are
  the world there.
- **The check:** Neon's GateSimulator and the translation run side by side on Neon's own workloads. Every one of
  1,125 shared nets is compared before every 48 MHz edge, except edges within 40 ns of an asynchronous input change.
- **Result, Neon's drawing (bus-hold assumed):**
  - low-speed keyboard (enumerate + keystroke): 134,348 edges, 0 mismatches;
  - full-speed mass storage (enumerate + SCSI read): 215,506 edges, 0 mismatches.
- **Controls:** 17/17 caught: all 15 of Neon's netlist mutants (on our side only) plus two of ours.
- **Findings:**
  - (1) the buffer SRAMs use model-only write pins;
  - (2) the simulator never floats a net;
  - (3) BUS_D and BD are read while undriven;
  - (4) a bug in the card library's own '161/'74 models (async clear/preset), now fixed.
- **Proposed fix:** '257 write path plus LVCH245 bus-hold. Functionally checked: 0 mismatches on both workloads, with
  BD's combinational cone excluded only inside buffer write windows (83 and 595 edges).
- **Timing** is Round 12 (`ROUND12-MESSAGE.md`, bar in `PREREG-v6-addendum.md`).
