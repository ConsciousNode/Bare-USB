# Triton card computer: parts selection, first pass
**Kehai Interim, 2026-11-18.** It follows from TIMING-BUDGET.md and the RAM decision (3^15 trytes). Prices are
distributor listings checked 2026-11-18 at quantity 1–10. They are planning numbers, not quotes. Everything runs at
**3.3 V**.

## Decisions

1. **Logic family: 74LVC.** 3.3 V, 5 V-tolerant inputs, and worst-case delays already used in the timing budget:
   - 74LVC245A transceiver: 6.3 ns max;
   - 74LVC574A flip-flop: 7.0 ns clock-to-Q, 2 ns setup;
   - **74LVC157A 2:1 mux: 5.2 ns max at 3.3 V** (TI). The budget had estimated 6 ns, so it improves slightly.
2. **The rule (Kham, 2026-11-18): no bits faked by software on a chip.** Binary *parts* are fine; Setun used them too
   (two magnetic cores per trit). What's not allowed is a programmed processor on the card standing in for any part of
   the machine. So **no microcontroller anywhere on the card computer.** (An earlier draft of this file had an RP2350B
   doing the loading and the I/O; that's dropped.)
   - Things that stay binary *material*, and are named as such: dual-rail trit wires; truth tables in SRAM (ALU, dispatch);
     the binary-addressed microsequencer; the dense address conversion at the RAM's doorstep.
   - Peripherals with their own controllers inside (an SD card, a PS/2 keyboard) are off-card devices, like Setun's
     teletype. They store and send bytes; they don't compute for the CPU.
3. **Power-up loader: a copy engine, no program.** Two **SST39SF040** 5 V parallel flash chips (512K×8, 55/70 ns,
   PLCC-32 in a socket; PLCC variants listed active, projected EOL 2034; some TSOP variants discontinued).
   - About 534 KB of images (`roms/`) need two chips.
   - Counter chips (74LVC161 ×5) step addresses; a 74LVC138 picks the destination table; the ALU image is written to
     all 9 slice SRAMs at once. The CPU is held in reset until the counter overflows.
   - The flash outputs swing to 5 V, so they pass through 74LVC245s (5 V-tolerant inputs) before the 3.3 V SRAMs.
     (Check the SST39SF input thresholds against 3.3 V drive: expected TTL-level, *confirm on datasheet*.)
   - New microcode means pulling the socketed flash and burning it in an external programmer, which sits off the
     machine.
4. **Every lookup table lives in 10 ns SRAM,** loaded at power-up.

## Major parts by card (counts are first estimates)

| Card | Part | Qty | Unit price | Notes |
| --- | --- | --- | --- | --- |
| ALU | ISSI IS61WV5128EDBLL-10TLI (512K×8, 10 ns) | 9 | ~$3–6 | one per 3-trit slice; image `alu.bin`, negation folded in |
| ALU | 74LVC574A | ~14 | <$1 | A and B latches, 54 bits each |
| ALU | shifter (see open items) | ? | | the biggest unknown in chip count |
| Control | IS61WV5128EDBLL or smaller 10 ns SRAM | 9 | ~$3–6 | control store: 9 × 1K used of each chip (microword = 72 bits) |
| Control | 10 ns SRAM | 2 | ~$3 | dispatch table (`dispatch.bin`) |
| Control | 74LVC574A | ~12 | <$1 | microword pipeline register (72 bits), IR, flags |
| Control | 74LVC157A / '161 | ~10 | <$1 | next-address select, micro-loop counter, condition select |
| Registers | 10 ns SRAM (e.g. IS61WV1288EEBLL 128K×8) | 7 | ~$3 | register RAM, 54 bits wide (R0–R8, SP, 16 SPRs, temporaries) |
| Memory | ISSI IS61WV204816BLL-10TLI (2M×16, 10 ns) | 16 (or 6 to start) | ~$21–26 | 3^15 trytes; stage it: 3 rows of 2 = 6.3M trytes |
| Memory | 10 ns SRAM + adder logic | ~6–10 | | address conversion (dense); see open items |
| Memory | 74LVC245A / '574A | ~10 | <$1 | MAR, MDR, bus buffers |
| I/O | bare ports: 74LVC595/165 shift registers, latches, step-timer counters, SD socket, PS/2 jack | ~10–15 | <$1 each | **the CPU runs its own drivers** (SD over SPI, bit by bit; PS/2 shifts in on the keyboard clock and raises an IRQ). No DMA; needs a "bare ports" device model in microsim + emulator |
| Video | 2 × fast SRAM, timing counters, resistor DAC | ~20–30 | | option B from the doc; unchanged |
| Front panel | ON-OFF-ON toggles, bi-colour LEDs, step button | | | unchanged |
| Backplane | DIN 41612 96-pin, 3U Eurocard | 1 per card | | see Testsuo's PCB pricing recon |

**Rough memory and table cost:**
- 9 + 9 + 2 + 7 ≈ **27 fast SRAMs for tables and registers**, about $100–150;
- the main RAM: about $130–160 staged, or $340–420 full;
- logic chips: tens of dollars.

That's before PCBs, which Testsuo's recon covers.

## Open design items (they decide chip counts, not feasibility)

1. **The shifter.** The microword asks for 11 shift options (L1, L3, L9, R1, R3, R9, R1C, R1L, L1L, R1O, none) on a
   54-bit dual-rail value. Built from 2:1 muxes as a log shifter (×1, ×3, ×9 stages, each direction) it's dozens of
   chips.
   - Options worth weighing:
     - FET bus-switch muxes (74CBT3253-class, sub-ns, two 4:1 per chip);
     - trimming the option list;
     - doing the rare shifts in two microcycles.
   - The microsim can tell us which options are hot: the same way `timing-mix.js` counted carry cycles.
2. **Dense address conversion.** Three 5-trit groups → binary partials → a 3-input 24-bit binary adder. The timing
   budget assumed 25 ns. Pick the adder: lookup tables in 10 ns SRAM (carry-save), or a fast adder family.
3. **Register RAM width and ports.** One port, 54 bits. Check that every register access the microcode makes fits a
   single port per microcycle. The microsim already enforces this (one `RF_SEL` per word), so it should hold.
4. **The carry-stretch decode** (TIMING-BUDGET.md): a few gates on ALU_FN and BUS/FLAGS feeding the clock generator.
5. **Copy-engine timing and verification:** a readback-compare pass after loading (counters again, plus a comparator)
   would catch a bad flash before the CPU starts.
6. **Bare-ports I/O model:** new device mode for the microsim and a matching spec for the Triton emulator, so the
   differential tests keep working; TritOS gets SD and PS/2 drivers written in ternary code.

## Sources
- TI SN74LVC245A, SN74LVC574A-Q1, SN74LVC157A datasheets; Philips/Nexperia 74LVC574A
- ISSI IS61WV5128EDBLL, IS61WV1288EEBLL, IS61WV204816BLL (DigiKey listings, 2026-11-18)
- Microchip SST39LF040/VF040 status (DigiKey: "Obsolete and no longer manufactured" for SST39LF040-45; Arrow lists
  SST39VF040-70-4I-WHE as obsolete)
- Microchip SST39SF040 (Arrow: SST39SF040-70-4C-NHE-T active; Microchip Direct lists PLCC -55 variant active)
