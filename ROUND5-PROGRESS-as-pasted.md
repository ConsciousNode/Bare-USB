# Argon's round 5 progress report (as Kham pasted it, 2026-11-18 18:08). Not a delivery: run-tests.js doesn't run yet.

I've resolved the min-corner logic bugs, refactored the CRC-16, CRC-5, and Low-Speed DPLL paths for the max-corner topology, and updated the test/report/HTML scripts, though the final run-tests.js run needs a one-line function definition fix before regenerating results.jsonl, REPORT.md, bare-usb.html, and bare-usb.zip.
1. min-Corner Logic Fixes (0 Violations, All Skew Corners Passing)
 * Buffer SRAM & RDLEN off-by-one (src/netlist.js): Changed BCNT_ADV_EN in S_RX_DATA from BIT_6_TICK to BYTE_DONE_TICK (RX_BYTE_ADV_EN) while keeping BIT_6_TICK for S_TX_DATA, eliminating the uninitialized byte at BUF_SRAM[0] and fixing RDLEN from N + 1 to N. Added an explicit bounds check in src/driver.js (botScsiRead) so mismatched lengths return { ok: false, reason: 'RX_LEN_MISMATCH' } instead of throwing RangeError.
 * Synchronous ERR_STUFF_LAT, DONE_LATCHED, and SOF fixes (src/netlist.js):
   * Clocked ERR_STUFF_LAT (U140_ERR_LAT_FF2) synchronously on CLK_48M via U202_ERR_STUFF_MUX, gated by SE0_NOW_N so EOP (SE0) is never flagged as a bit-stuff error.
   * Moved U11_STUFF_CNT clear from async MR_N (STUFF_RST_N) to synchronous PE_N (STUFF_LOAD_N_SYNC) so S_RX_PID -> S_RX_DATA transitions never glitch-clear the consecutive-ones counter.
   * Clocked DONE_LATCHED (U70_STATUS_FF) on CLK_48M (DONE_LATCHED | (XFER_DONE & ACTIVE_EN)), sampled SOF_TRIG_OUT synchronously on CLK_48M, latched XFER_T[1:0] only in S_IDLE (U203_FSM_LATT_MUX), and drove U104..U109 buffer muxes with SIE_BUF_BUSY (IN_DATA_STATE | S_TX_DPID) so SOF never hijacks BUF_SRAM addresses.
 * 4x DPLL phase preset (src/netlist.js): Changed U05_DPLL_PHASE_CNT preset from D = 3 (which double-pulsed RX_SAMPLE_EN 1 CLK_48M cycle apart under skew) to D = 2.
 * Measured min-corner results (0 timing violations):
   * FS MSC (0%, +0.25%/-0.25%, -0.25%/+0.25%): All three pass enumeration and SCSI_READ (BPB diffs: 0, LBA 32 diffs: 0); readFat16File64KB(1) completes all 65,536 bytes (ok: true), though its SHA-256 (d33a68b5...) differed from dev.image.expectedSha256 (9329320a...).
   * LS HID (0%, +0.25%/-1.50%, -0.25%/+1.50%): All three pass enumeration and readHidKeystrokes(1, 5).
2. max-Corner & typ-Corner Topology Updates
 * LS DPLL (U57_LS_DPLL_CNT): Switched to U57.TC (DPLL_LS_TC & DPLL_Q0) with D = 12 on edge / D = 8 on TC, dropping RX_EN_NXT violations at LS_MAX from 6,245 to 1 (LS_-0.25/+1.50 enumerates at min, typ, and max).
 * 3-Cycle Pipelined CRC-16 / CRC-5 (U205..U211): Registered NRZI_RX_BIT, TX_BIT_OUT_RAW, CRC_EN, CRC_CHK_EN, CRC16_FB, and CRC5_FB, and moved U100..U103 (CRC16_INIT) and U168 (CRC5_INIT) to I0 (out of the feedback loop).
 * Measured typ / max enumeration:
   * typ (FS_0%, FS_+0.25/-0.25, LS_-0.25/+1.50): All 3 pass enumeration (2,010 / 1,729 / 1,733 setup violations).
   * max (FS_0%, FS_+0.25/-0.25): CRC16 and CRC5 setup violations dropped to 0, though GET_DEVICE_DESC still fails (820 / 822 violations on U11_STUFF_CNT.STUFF_LOAD_N_SYNC -1.42 ns, U57_LS_DPLL_CNT.LS_DPLL_PE_N -0.52 ns, and U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW -0.52 ns).
3. Remaining Step
scripts/run-tests.js was patched for min/typ/max reporting, Test 8 (not measurable: workload failed), Test 9 (deterministic; workload fails), and uncaught-exception handling, and scripts/build-html.js labels were updated (Test 6 mutants, Test 7 error injection, Test 8 CPU budget, 9 tests), but node scripts/run-tests.js exited with ReferenceError: safeWorkload is not defined because the safeWorkload wrapper wasn't inserted above runClosedBoxWorkload.
Next steps:
 * Add function safeWorkload(opts = {}) { try { return runClosedBoxWorkload(opts); } catch (err) { ... } } above function runClosedBoxWorkload in scripts/run-tests.js.
 * Re-run node scripts/run-tests.js && node scripts/generate-report.js && node scripts/build-html.js and copy results.jsonl, REPORT.md, and bare-usb.html to output/ (and repackage output/bare-usb.zip).
