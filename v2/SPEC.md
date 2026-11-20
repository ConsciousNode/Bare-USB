# Bare USB, round 2: the SIE as a closed netlist
ConsciousNode SoftWorks. Xinu rules: one self-contained HTML file plus Node CLIs, zero dependencies, offline.
Inline and label: code copied from the attached files carries a provenance comment.

## Why there is a round 2
Your delivery 1 (attached: `report_20.md`, `bare-usb.zip`) built good gate-level blocks: CRC-5/16, NRZI, bit stuffing,
the turnaround and SOF counters. We reran it bit for bit. But the transaction itself was carried out by JavaScript:
- `GateLevelSIE._executeTransaction()` sequenced token, data and handshake;
- the FSM table (U35/U36) was loaded but never read;
- AUTO_ACK was a JS call;
- the DPLL never ran;
- devices received JS objects instead of D+/D− waveforms;
- error detection partly read flags set by the injector.

So the question (can discrete logic be a USB host?) is still open. Round 2 answers it. "No, and here is the block that
can't be done" is a full and welcome answer. Reuse whatever from delivery 1 is genuinely gate-level.

## The one rule: the SIE is a closed box
The SIE is the netlist and nothing else. The test harness may touch only these pins, and nothing inside:
- **inputs it drives:** the 48 MHz clock, RESET, the register-port pins (port number, 16 data lines, read strobe, write
  strobe);
- **outputs it reads:** the data lines during a read, the IRQ pin;
- **the bus:** the D+/D− pins, which connect only to the line model.

Concretely:
1. **No SIE class with protocol logic.** The harness is a generic pin driver. It may not contain PIDs, packet types,
   toggle bits, ACK/NAK/STALL, CRC, framing, timing decisions, buffer addressing or register meanings. Those live in the
   netlist, in table contents made by the table generator, and in the device models and driver.
2. **The transaction sequence comes from the state register plus its lookup tables**, or from other gates. A table
   generator may compute table contents. Nothing may compute a decision at run time.
3. **Every chip's state is reached only through its pins.** No reading or writing `chip.state`, `mem[]` or nets from
   outside the netlist, except: power-up table loading (which goes through the copy-engine pins or a documented
   loader), and the waveform viewer, which may read nets for display only.
4. **The register interface is gates.** The decoder, latches, transceivers and buffer counters are driven by the port
   pins.
5. **Devices see and produce only D+/D− waveforms.** Each device has its own receiver (its own clock recovery,
   unstuffing, CRC check) and its own transmitter, running on **its own clock, skewed to the spec limits.** Write them
   from the USB 2.0 specification (chapters 7, 8, 9) and the class specs, not from your SIE code.
6. **Receive clock recovery runs.** The host DPLL must recover the device's skewed clock from the waveform. Nothing may
   hand the host an ideal bit array.
7. **Errors are injected only on the wire:** flipped levels, extra levels, a missing handshake. No flags.

## Forbidden (in addition to delivery 1's list, which still applies)
- Any processor, microcontroller, soft core, CPLD, FPGA or programmable logic device. Any program counter or
  instruction sequencing.
- Any harness or wrapper code that interprets packets or registers (rule 1).
- Reading or writing chip internals from outside the netlist (rule 3).
- Passing anything between host and device except D+/D− levels over time.
- Timing figures in the report that come from arithmetic over paths the simulation doesn't run. Report simulated
  timing; label any computed figure as "Hypothesis: computed, not simulated."
- If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
  emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
  must never read or write a guest's private memory.

## Tests (each exercised by a script; results to `results.jsonl` with code hashes)
1. **Closed-box static scan.**
   - The harness and wrapper files contain none of these tokens: PID names, `ACK`, `NAK`, `STALL`, `DATA0`, `DATA1`,
     `crc`, `toggle`, `token`, `.state`, `.mem`.
   - The netlist module exports only the builder and a pin list.
   - No simulator module imports the devices, driver or reference SIE.
   - It prints every exception it allows, with the reason.
2. **Positive control for test 1:** a planted wrapper that peeks at `chip.state` must fail the scan.
3. **Differential:** the gate-level SIE and a behavioural reference SIE, same driver, same devices, give identical D+/D−
   transitions (as timed events within one bit) and identical register traces.
4. **Corners:** min and max gate delays; host clock at ±0.25 %; device clocks at their spec extremes, opposite to the
   host. Every run reports setup/hold violations from the simulation, plus the measured worst-case slack on the DPLL and
   FSM-table paths.
5. **Enumeration and transfer:**
   - The full-speed mass-storage device enumerates, and a 64 KB file reads back with a correct hash.
   - If you build low-speed: the keyboard enumerates and 100 keystrokes arrive in order.
6. **Mutants that must fail.** List any that survive.
   - Delivery 1's five.
   - **Inside the FSM table:** one wrong next-state entry, chosen by a script from entries the workload uses.
   - **AUTO_ACK** sent one bit time too late.
   - **DPLL** resync disabled.
   - **Buffer address counter** carry broken.
   - **Register decoder** with two outputs swapped.
7. **Wire-level error injection:** a flipped CRC bit, a 7-ones run and a dropped ACK are each detected through the
   SIE's own status pins and retried by the driver.
8. **CPU budget**, as in round 1 (10 µs per port access): register accesses per transfer, and CPU time per 1 ms frame.
9. **Determinism:** fixed seeds, byte-identical traces across two runs.
10. **Browser:** the page loads and runs one short transfer with 0 console errors (state how you checked).

## Report (REPORT.md)
- What each test exercised.
- Measured: chip count, BOM, simulated slack per path, CPU budget, surviving mutants.
- Every number comes from `results.jsonl`, and tables are generated, never typed. Write "Measured:" vs "Hypothesis:".
- Do not describe anything as working unless a test exercises it.
- If the closed box can't be made to work, the report says which block failed and why. That is a full answer.
