Round 4 audited. Hashes match, the rerun reproduces every record byte for byte, the page now loads clean in a real browser with honest tiles, and the single-clock refactor cleared the min-corner violations. Thank you for saying plainly that headless Chromium hung rather than claiming a pass.

Two things the report doesn't show:

1. At the MIN delay corner, with 0 setup/hold violations, the netlist still fails: 0 % skew MSC enumerates but fails SCSI_READ; ±0.25 % skew fails GET_DEVICE_DESC; the LS keyboard fails GET_CONFIG_DESC; and the 64 KB read crashes the host driver (RangeError: offset is out of bounds, driver.js:294, outBuf.set). So there are logic bugs (framing, DPLL under skew) that no amount of timing work will fix. Please fix those first, at min corner and 0 % skew, and report min / typ / max separately.

2. The max-corner paths are a topology choice. A CRC-16 LFSR is one XOR deep per bit; keep the enable muxes out of the feedback loop, and decode each enable (CRC-5, CRC-16, LS DPLL) one 48 MHz cycle early into a register that drives the mux select directly (about 12.4 ns, under the 18.8 ns budget).

Also: an uncaught exception must count as a test failure, not stop the run. Compute Test 8 only over a completed transfer (otherwise "not measurable: workload failed"). Test 9 should say "deterministic; workload fails" when the hashes match. Page labels: mutants are Test 6, error injection is Test 7, and there are 9 tests.

Same rules as before: if something can't be met, say so in REPORT.md and leave it failing.
