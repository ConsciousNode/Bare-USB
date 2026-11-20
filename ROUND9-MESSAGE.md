Round 8 audited. Hashes 11/11, our rerun reproduces all 11 records, and the page loads clean. Thank you for keeping
`parts-library.js` and `sta.js` untouched and for reporting the max failure plainly. That's exactly right. The FSM
registers (U215, U216) and the U217/U218 EOP bypass closed the min corner, and the old two-SRAM loop is gone.

**Round 9 is still about one thing: close timing at max.** One correction to the report's reasoning first.

## The floor is per stage, not per design
Your arithmetic is right: at max, '574 clk→Q 7.0 + SRAM 10.0 + tsu 2.0 = 19.0 ns. So **one clock stage** holds one
SRAM lookup, or about two gates. But nothing says a transmitted bit has to be computed in one stage. A full-speed bit
is 4 clocks (83.1 ns) and a low-speed bit is 32. So:

1. **Work a bit ahead in the TX serializer.** Compute bit n+1 while bit n is on the wire, through registered stages,
   each meeting 20.78 ns at max. For example, register SER_BIT_OUT right after U53, then register TX_BIT_GATED before
   the NRZI and stuff logic. Add stages until every endpoint meets timing. The chain from U34 to U11/U08 is 86.1 ns
   today; split into stages of one SRAM or two gates each, it fits.
2. **Treat the receive side the same way** where it still fails (e.g. U21 → … → U22 PE_N, 53.2 ns at max).
3. **Multicycle paths stay allowed, with proof:**
   - list each one (source, endpoint, enable, N) in a table in the delivery;
   - have the STA check it against N × 20.78 ns;
   - add a dynamic check that its source registers never change except on the enable, plus a mutant that changes one
     off-enable, which must be caught.
4. **Declare the asynchronous inputs.** The bus input synchronizers (U200 BUS_SYNC, U04 DPLL_EDGE) sample D+/D-
   asynchronously. List them in `sta.js` as async endpoints, show each is a two-flop synchronizer, and print the list in
   the report. Our independent STA traces your own TX through the transceiver back into those flops (90 ns at max).
   We want both tools excluding exactly the same declared set and nothing else.

Rules as before: no change to delay data, the period, or the STA's arc rules. More chips are fine; report the count.

## Also this round
1. **Test 3 can't pass as written:** `runReferenceWorkload` never computes `actualHash`, so `refDataSha256` is always
   null. Compute it the same way as the gate side. Its HID branch also uses `idleGapMs`, `harness` and `sim`, which
   aren't defined there.
2. **The page's FS budget card shows "undefined µs".**
3. **Replace Test 8's flat-out-polling figure** with two numbers:
   - CPU accesses per byte transferred on the 64 KB read;
   - idle duty: CPU time spent on USB with only the keyboard attached and idle, polled once per 1 ms frame.
4. **The 64 KB read still has 2 retries on a clean wire.** Find out why, or say plainly that you don't know.

## As always
**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.** "Here's how far it got, and here's exactly what's in the way" is
a good answer. Please say which stage you stopped at and why.
