Round 11 audited and it met the bar: rerun 11/11 byte for byte, 0 undriven nets, per-path MCPs that our own STA
confirms, and all 12 mutants killed at both corners. Thank you. Since then we put your netlist into our own computer's
part library and ran both simulators side by side. Your design and the translation agree on every shared net at
every clock edge, on both bus speeds. That comparison also found three things that only show when the design is
built from real datasheet pinouts. None of them is your logic. They're in what the simulator lets a design get away
with.

## What we found
1. **The SRAM model has pins the real chip doesn't.** `IS61WV5128EDBLL` in `simulator.js` takes write data on
   separate D0..D7 pins beside IO0..IO7. The real IS61WV5128EDBLL has one set of common I/O pins. U41/U42 write through
   D (BUF_DIN_*, from the '157s U106..U109) and read on IO (BD*), so on a real board the write data has no way in.
2. **Nets never float in the simulator.** A disabled '574, '245 or SRAM output just stops updating, so every bus acts
   as if a keeper held it. Two buses are read while nothing drives them:
   - BUS_D0..15, behind U46/U47, read all the time by the hold muxes and gates (U123, U265..U273 and others) but driven
     only during a port access;
   - BD0..15, read by the TX payload muxes (U88...) while the SRAMs' outputs are off.
   On real CMOS those inputs float.
3. **The fix we propose, already checked for function on our side:**
   - U106..U109 become **74LVC257A** (the same mux with 3-state outputs), driving BD directly;
   - their /OE comes from BUF_OE_N through U152's spare inverter (section 1). BUF_OE_N is CPU_WR_DAT | RX_WE_PULSE,
     high exactly in the write windows, when the SRAMs' /OE is already high;
   - U41/U42 lose their D pins;
   - U46, U47, U67 and U68 become **SN74LVCH245A** (bus-hold on the data pins), which keep BUS_D and BD at their last
     driven level. That is what your simulator assumed without saying so.
   No new chip positions. What we can't check is timing, and that's this round.

## Round 12
1. **Make the part models match their datasheets:**
   - the SRAM written from its IO pins (no D pins);
   - a 74LVC257A model (tpd, enable and disable times from its datasheet);
   - an SN74LVCH245A model whose bus-hold cells keep a released net at its last driven level.
   Cite each number's datasheet.
2. **Model three-state and contention honestly in `simulator.js`:**
   - a disabled output releases its net;
   - a net with no enabled driver and no keeper is undriven, and any chip input reading it is a violation (net, time,
     reader);
   - two enabled outputs on one net at once is a violation, with the overlap's duration;
   - report both at min, typ and max.
3. **Apply the fix in item 3 above** (or a better one, with the reason).
4. **Time the new write path** at min, typ and max against the datasheets, each as a measured minimum margin:
   - address setup to /WE;
   - /WE pulse width;
   - write data setup and hold at /WE's rise;
   - SRAM /OE to high-Z before the '257 drives BD;
   - the '257's disable before SRAM /OE re-enables.
   If the margins don't close, say so, and say which gate or delay would close them.
5. **Positive controls (each must be caught):**
   - a keeper removed (U46 back to a plain '245), so a floating read happens;
   - two always-on drivers on one bus;
   - the '257 enable delayed by one gate.
6. **Rerun every earlier test at min, typ and max,** unchanged except for the parts above, and report any test whose
   result moved, with why.

## As always
**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.** "Here's how far it got, and here's exactly what's in the way" is
a good answer. Please say which stage you stopped at and why.
