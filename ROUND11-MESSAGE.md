Round 10 audited. Hashes 11/11, the delay data is untouched, and the simulator change is exactly the async split we
asked for. The page loads clean. **This is the round the design got through the wall:** the TX chain is pipelined
(worst path 80.4 → 53.2 ns), our independent STA agrees with yours on all 65 multicycle endpoints, the declarations
are per path, and both planted mutants are caught. Thank you, and thank you for the diagnosis. We checked it and it holds up.

## What we found (and where the gaps were ours)
1. **Five undriven nets, not one.** Every one of these is read by a chip and driven by nothing: SE0_PREV_N (yours),
   RX_STUFF_ERR (into the U60 ACK gate, so a stuffing error may never block an ACK), STUFF_LOAD_N_RAW, RCV_D3 and
   TOGGLE_DIFF. The simulator reads them as 0 and says nothing.
2. **The packet buffer SRAMs (U41/U42) are never timed.** `sta.js` only times SRAMs with WE_N tied to VCC. That rule
   predates this round and we froze it, so the blind spot is ours too. Through U41's OE_N we find U121 `LAT_PID_NOW_N`
   → U93 at 41.7 ns and U154 `RX_WE_DONE` → U93 at 37.2 ns at max. Those may be false paths (receive signals that
   can't change while U93 latches a transmit byte), but they need declaring and proving.
3. **Bits can be 2 clocks long, not just 3.** At FS max (host −0.25 %, device +0.25 %) during enumeration we measured
   RX_SAMPLE_EN spacing: 2 clocks ×3, 3 clocks ×12, 4 clocks ×10,963, 5 clocks ×2. All 65 MCPs fit at N = 3, but 44
   paths exceed the N = 2 limit (worst U21 → U22 PE_N, 53.2 ns). Your U239 diagnosis is one case of this. Our v4 rules
   never said "the enable must be at least N clocks apart". They do now.

## Round 11
1. **Apply your two fixes:** drive SE0_PREV_N from U15_CRC5_FF2.2Q_N, and move U239's capture back to ACTIVE_EN_D1.
2. **Drive or remove the other four undriven nets,** and add a static test: every net that is read has exactly one
   driver (or is a top-level pin, or a three-state bus with exclusive enables). Plant an undriven net as a mutant.
3. **Enable spacing:**
   - find where 2- and 3-clock bit intervals occur (mid-packet, or only SYNC/EOP resync);
   - either bound the DPLL so bits are never shorter than the N you declare while MCP values are in use, or declare
     the real minimum and meet it on every path;
   - add a dynamic check of enable spacing at min and max, plus a mutant that shortens one interval.
   - **Option (Kham's idea): an elastic buffer.** A small FIFO right after the receive sampler (one byte is plenty: ±0.5 %
     clock mismatch over a ~600-bit full-speed packet is about 3 bits of drift), written on each RX sample, read on a
     strict every-4-clocks strobe, started half full and flushed at EOP. Downstream logic then always sees 4-clock
     bits. If you build it, report the added receive latency against USB's inter-packet response budget.
4. **Time the buffer SRAMs:**
   - arcs from address, CE_N and OE_N to IO;
   - the write side against the datasheet (address setup to WE, WE pulse width, data setup and hold);
   - anything you exclude is a declared false path with a reason, a dynamic proof and a mutant.
5. **Rerun everything at min and max,** including Test 7 with each fault injected on its own (flipped CRC, 7-ones run,
   dropped ACK), and report each fault's retries separately.

## As always
**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.** "Here's how far it got, and here's exactly what's in the way" is
a good answer. Please say which stage you stopped at and why.
