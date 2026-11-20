Round 9 audited. Hashes 11/11, our rerun reproduces all 11 records, `parts-library.js` and the STA arc rules are
untouched, and the page loads clean. Thank you for the honest root-cause on U208/U216; it's right. Test 3, the
budget card and the restated Test 8 are fixed. The SOF tick still measures exactly 48,000 clocks. Our STA and yours now agree to the
tenth of a nanosecond, and on exactly the same three async inputs.

## One correction first, and it's ours
Round 9's multicycle rule only said the **source** must change only on the enable. That isn't enough. The
**capturing** flop must also take data only on the enable edge (hold mux or enable pin). Otherwise it stores a
value mid-flight, which is exactly what your simulator caught at U208 and U216. You followed our rule as written.

## What we found in the multicycle table
1. `analyzeStaticTiming` gives N = 4 to **every path into** a listed endpoint chip. It never checks where the path
   starts. Paths from these sources must stay single-cycle, and today they don't meet it at max:
   - the enable flops (U164 TX_BIT_EN / RX_SAMPLE_EN, U215 ACTIVE_CLK_SEL), 23.8 ns into about 55 endpoints;
   - the synchronizer outputs (U219 DP_SYNC / DM_SYNC, U04 RCV_D2, U201 SE0_NOW), 32 ns into U216 and U11.
2. Twelve listed endpoints capture on every edge: U208 ×2, U216 ×8, U211 ×2.
3. `DECLARED_MCP_SOURCES` lists U93 as `TX_LAT0..7`, but the nets are `TX_LAT_D0..7`. `getNet()` returns 0 for an
   unknown name, so the dynamic check never watched U93.

## Round 10: close timing at max, for real
1. **Pipeline the TX chain.** U34 → … → U11 / U08 is still one 80.4 ns path. Work a bit ahead: register
   SER_BIT_OUT after U53, register TX_BIT_GATED before NRZI and stuffing, and add stages until each one is a single
   SRAM lookup or about two gates. Do the same for U216's next-state cone and U208's CRC feedback.
2. **Multicycle paths stay allowed, per path:**
   - list source Q, endpoint pin, enable and N for each one, and have the STA apply N to that path only;
   - enable flops and synchronizer outputs are never multicycle sources;
   - the endpoint must be enable-gated;
   - the dynamic check samples the enable **before** the edge, fails on an unknown net name, watches sources
     **and** endpoints, and runs at min and max;
   - add one planted mutant per rule (source changes off-enable, endpoint captures off-enable). Both must be caught.
3. **Report declared-async first-stage setup events separately** in the simulator. They're what the second flop is
   for. Every other violation still fails the corner.
4. **Say why the 2 clean-wire retries went away** (the DPLL re-registering?), or say you don't know.
5. The bus-event table on the page prints `undefined` in three columns.
6. Optional: U59 and U115 take their async clear from a decoded state line. A synchronous clear (PE_N load of
   zero) avoids decoder glitches on real hardware.

## As always
**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.** "Here's how far it got, and here's exactly what's in the way" is
a good answer. Please say which stage you stopped at and why.
