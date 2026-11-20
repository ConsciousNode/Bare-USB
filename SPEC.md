# Bare USB: a full-speed USB host interface in discrete logic, as a gate-level simulator
ConsciousNode SoftWorks, Xinu rules: one self-contained HTML file plus Node CLIs, zero dependencies, offline.
Inline and label: any code you copy from the attached files carries a provenance comment.

## Background (read this, it is the whole point)
We are designing a computer card built from 74LVC logic, SRAM and parallel flash. Its rule:
**no bits faked by software on a chip.** Binary parts are fine. A programmed processor standing in for part of the
machine is not.

Today the card has no USB, because every USB host interface we know of is a programmed controller. We want to know
whether a USB host interface can be built with **no processor, no microcontroller, no CPLD and no FPGA.** It would use
real, currently sold discrete logic and memory chips, and the card's own CPU would do the protocol work through a
register interface. You are building the **instrument that answers that question.** Whether the answer is yes or no is
not yours to decide in advance.

## Attached
- `PARTS.md`: the card's chosen logic family and parts. Prefer these.
- `TIMING-BUDGET.md`: the datasheet delays we already use (LVC245 6.3 ns, LVC574 7.0 ns clk→Q and 2 ns setup,
  LVC157A 5.2 ns, 10 ns SRAM).
- `IO-NOTES.md`: how the card's CPU reaches I/O. It has word-wide IN/OUT ports with an interrupt line, roughly
  1.1 million instructions per second, and **cannot respond to anything faster than tens of microseconds.**

## What to build
1. **A gate-level netlist simulator.**
   - Event-driven, with named real part numbers (e.g. 74LVC161, 74LVC595, 74LVC86, IS61WV-class SRAM).
   - Pin-level models with min and max propagation delays and setup/hold checks, taken from datasheets you cite.
   - A setup or hold violation is reported, never silently resolved.
2. **The netlist: a USB 1.1 host serial interface engine (SIE),** full-speed (12 Mb/s), plus low-speed (1.5 Mb/s) if
   you can. It is built only from parts in the simulator. It must handle in hardware everything faster than the CPU
   can handle:
   - SOF/keep-alive every 1 ms;
   - SYNC and PID;
   - NRZI encode and decode;
   - bit stuffing and unstuffing;
   - CRC5 and CRC16, generate and check;
   - EOP generation and detection;
   - receive clock recovery (e.g. oversampling);
   - bus turnaround timeouts;
   - sending and receiving handshakes within the spec's turnaround window.

   Packet data passes through buffer SRAM. The CPU sees only a register interface that you design and document.
3. **A line model** for the D+/D− bus with the states J, K, SE0 and idle, attach/detach, and pull-ups and pull-downs.
   Name the analog transceiver part or resistor network you'd use.
4. **Two device models, written independently from the USB 2.0 specification** (chapters 5, 8 and 9 plus the class
   specs). Do not derive them from your SIE code.
   - (a) a low-speed HID boot keyboard (only if you build low-speed);
   - (b) a full-speed mass-storage bulk-only device holding a FAT-formatted test image.
5. **A host driver, in JavaScript, that talks to the SIE only through its register interface.** It enumerates the
   devices, reads keystrokes and reads a file. It runs under a **CPU budget model**:
   - every register access costs 10 µs of simulated time;
   - the driver may not touch the hardware between those accesses.

   This stands in for the ternary CPU.
6. **A behavioral reference SIE** (plain JavaScript, no gates) with the same register interface, for differential
   testing.
7. **The page** shows the waveform viewer (D+/D−, decoded packets), chip count and bill of materials, and the test
   results.

## Forbidden
- Any processor, microcontroller, soft core, CPLD, FPGA or programmable logic device in the netlist.
- **Any program counter or instruction sequencing in the netlist.** State machines are allowed as a state register
  plus logic. If the next-state logic is a lookup table in SRAM or flash, disclose it and give the table's contents a
  generating script.
- A USB controller chip, USB bridge chip or any part with firmware.
- The netlist simulator calling the reference SIE, the device models or the driver for any decision. They meet only at
  the D+/D− pins and the register interface.
- Device models copied from, or shaped by, your SIE code.
- Timing tolerances widened beyond the USB 2.0 spec to make a test pass.
- If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
  emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
  must never read or write a guest's private memory.

## Tests (each one numbered, each one exercised by a script)
1. **Differential:** gate-level SIE and reference SIE, driven by the same driver against the same devices, produce
   identical packet traces at the pins and identical register reads.
2. **Corners:** every test runs at min delays and at max delays. The host clock runs at ±0.25 % (full-speed), and
   device clocks at the spec's tolerance limits.
3. **Enumeration:** the full-speed mass-storage device enumerates, and a 64 KB file reads back with a correct hash.
   With low-speed built, the keyboard enumerates and 100 scripted keystrokes arrive in order.
4. **Positive controls that must fail:** netlist mutants each make a test fail. The mutants are: CRC16 tap moved,
   bit-stuff counter off by one, NRZI inverted on receive, turnaround timer too short, SOF missing. List any mutant
   that survives.
5. **Error injection:** corrupted CRCs, stuffing errors and a dropped handshake get detected and retried, as the spec
   says.
6. **CPU budget:** report, from the measured run, register accesses per transfer and the CPU time per ms frame at the
   10 µs/access cost.
7. **Static scan:** a script proves that no forbidden part type appears in the netlist and that no simulator module
   imports the reference SIE, the devices or the driver.
8. **Determinism:** fixed seeds; two runs give byte-identical traces.

## Report (REPORT.md)
- What was built and what each test exercised.
- Measured: chip count, BOM (generated by script), worst-case timing margins per path, CPU budget numbers, and
  surviving mutants.
- Every number comes from `results.jsonl` (code hashes included), and tables are generated, never typed.
- Write "Measured:" vs "Hypothesis:".
- Do not describe anything as working unless a test exercises it.
- A clear "this part could not be done in discrete logic, here is why" is a full and welcome answer.
