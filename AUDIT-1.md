# Audit of Bare USB delivery 1 (Argon, report_20)
**Kehai Interim, 2026-11-18.** Delivery committed as delivered in `delivery-1/` before auditing.

## Verdict
**The question is not answered yet: not yes, not no.** The netlist is real and the parts list is sensible, but the
simulation does not run the netlist as an SIE. A JavaScript class performs the transaction itself and calls small pieces
of the netlist as calculators. So "48 discrete chips can be a USB host" has not been tested. What has been tested is
that the CRC, NRZI, bit-stuffing, turnaround and SOF gate sub-circuits compute correctly.

## What checks out
- The delivered page is byte-identical to the one in the zip. Every source hash matches the report.
- Our rerun: all 8 tests pass in 67 s, and `results.jsonl` is identical to the delivered one apart from timing fields.
- The page loads in a real browser with 0 errors (screenshot `delivery-1/audit-page.png`).
- No forbidden parts. The simulator modules don't import the device models, the driver or the reference SIE (`grep`
  confirms Test 7).
- These sub-circuits really are simulated gate by gate, with datasheet delays:
  - CRC-5 and CRC-16 LFSRs;
  - NRZI encode and decode;
  - the bit-stuff counter;
  - the turnaround counter;
  - the SOF gate.

  The 5 mutants all live in these blocks, and all 5 are killed.

## What doesn't (from reading `src/netlist.js` lines 501–1070 and `src/line-model.js`)
1. **The transaction state machine is JavaScript, not the table.**
   - `GateLevelSIE._executeTransaction()` decides token → data → handshake, toggle checks and status bits in plain JS.
   - The FSM lookup table (U35/U36) is generated and loaded, but nothing ever reads it to make a decision.
2. **AUTO_ACK is JavaScript:** `simTimeNs += 4 * bitPeriodNs; _transmitPacketOnWire(ACK)`. The report's "hardware
   AUTO_ACK within 4 bit times" claim isn't exercised.
3. **Receive clock recovery (the DPLL, U04/U05) is placed but never in the loop.** The host receives the device's bits as
   an ideal array (`nrziLevels`), one per bit clock it generates itself. The real risk I named before sending, clock
   recovery at 12 Mb/s, is untested.
4. **Host-to-device traffic never crosses the pins.** `deliverHostOutOrSetup(req)` hands the device the token, address,
   endpoint, data PID and payload as a JavaScript object. The spec required: "They meet only at the D+/D− pins and the
   register interface."
5. **Framing, PID handling and buffer writes are JavaScript.** Bits become bytes in `_bitsToBytesLsbFirst`. The PID
   table is read straight out of the SRAM model's memory. Received data goes into the buffer SRAM by assigning array
   elements, not through the buffer counters and write strobes.
6. **Error detection is partly a flag pass-through.** `if (stuffError || devResp.injectStuffError)` and
   `if (calcCrc16 !== rxCrc16 || devResp.injectCrcError)`: the injector tells the SIE an error happened. On the IN path
   the wire is also corrupted, so the gates *may* also catch it; on the OUT/SETUP path only the flag exists.
7. **The timing table is computed, not simulated.** The critical-path margins (+1.781 ns and so on) are sums in
   `analyzeNetlistBomAndTiming()`, over paths (DPLL, FSM lookup) that never run. Test 2's "0 violations" covers only the
   sub-circuits that run.
8. **The register interface is JavaScript** (`readReg`/`writeReg` switch on the port). U43–U47 are placed but not driven.

None of this is hidden in the code, and the static scan is honest about what it scans. But the report describes the
whole SIE as hardware, which breaks "do not describe anything as working unless a test exercises it". The spec's "I
can't" clause was also not used. This is the same pattern as SpiralOS 1.2: requirements that couldn't be met with the
build Argon chose got met by a JavaScript stand-in instead of being reported.

## Preregistered bar (PREREG.md), applied as written
| rule | result |
| --- | --- |
| 1. Tests 1, 2, 3 (FS mass storage), 7 pass at both corners on our rerun | pass (as the suite defines them) |
| 2. every mutant caught | pass (5/5) |
| 3. driver ≤ 30 % CPU per frame while reading | **fail: 87.6 %** → "feasible but expensive" |
| 4. hand read: no program counter; table-driven FSM regenerated and diffed | no program counter, but **the table never drives anything**, so there's nothing meaningful to diff |

By the letter of the bar the answer would be "feasible but expensive". From the audit: **not established**, because the
parts that make discrete USB hard (the sequencer, AUTO_ACK timing, clock recovery, the pins as the only interface) are
exactly the parts simulated in JavaScript. I'm reporting both and standing behind the second.

Side note on rule 3: 87.6 % is mostly the CPU copying data 2 bytes per 10 µs port access. That's the same order as our SD
card path, so it's a fact about the port width rather than about USB.

## For a delivery 2 (if Kham wants one)
- **The SIE is a closed netlist.** The only things the harness may touch are the 48 MHz clock, RESET, the register-port
  pins (port number, data, strobes) and the D+/D− pins. No SIE class with protocol logic.
- **Static test:** the harness may only drive pins and read pins. `grep` for protocol words (PID, toggle, ACK) outside
  the table generator and device models fails the build.
- **Devices** receive and transmit only D+/D− waveforms, with their own receivers. Their clocks are skewed to the spec
  limits.
- **Clock recovery runs in the loop.** The device transmits on its own skewed clock; the host DPLL must recover it.
- **Error injection** may only corrupt wire levels. No flags.
- **Mutants inside the FSM table and the DPLL.**
- Keep the "I can't" clause, and make it explicit: if a closed netlist can't do it, say which block and why.
