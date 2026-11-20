Follow-Up Diagnosis (Read-Only, No Files Modified)
Test 7 (corrupt_crc missed — 2 retries instead of >= 3):

Isolating each fault individually at min corner shows stuff_error (1 retry) and drop_handshake (1 retry) both trigger retries, while corrupt_crc executes 0 retries.

Instrumenting CRC_CHK_D2 and ERR_CRC_LAT under corrupt_crc gives crcChkCount: 0 and errCrcCount: 0.

Root cause: In src/netlist.js, SE0_PREV_N currently has no driver (only a consumer on U150_TX_LAT_CLK_AND.2B): the old U152 inverter was disconnected when migrating to U15_CRC5_FF2.2Q_N, but '2Q_N': 'SE0_PREV_N' was never added to U15_CRC5_FF2. Because SE0_PREV_N stays 0, SE0_FIRST_BIT and CRC_CHK_D2 never pulse, disabling RX CRC-16 error latching.

FS_MAX_HOST-0.25_DEV+0.25 (enum: true, scsi1sec: true, viol: 0, hashMatch: false):

Comparing the read sector against the expected 512 bytes shows 25 differing bytes starting at offset 167 (exp = 0xfe, a run of consecutive ones requiring a stuffed 0), followed by bytes 168..191 all shifted left by 1 bit (0x8e → 0x1d, 0x4e → 0x9d, 0x10 → 0x20, 0x28 → 0x50, 0xca → 0x94, 0x2a → 0x55, 0xc6 → 0x8c), with 0 retries.

Root cause: Two effects combined:

Missed unstuff on a DPLL-shortened 3-clock bit: U239_STUFF_TRIG_FF (STUFF_TRIG / STUFF_NOT_TRIG) captures on ACTIVE_EN_D2 (Cycle 2, Q updating on Cycle 3). Under +0.50% relative device skew (-0.25% host / +0.25% device), a 4× DPLL phase pull-in shortens a bit interval from 4 CLK_48M cycles to 3 cycles, so RX_SAMPLE_EN fires on Cycle 3 before STUFF_NOT_TRIG has settled to 0 for the stuffed 0 bit.

Uncaught bad packet (retries: 0): Because SE0_PREV_N is undriven (CRC_CHK_D2 = 0), the SIE did not catch the resulting CRC-16 mismatch on that shifted packet.

If you'd like me to apply both fixes for Round 11—wiring U15_CRC5_FF2.2Q_N: 'SE0_PREV_N' and moving U239_STUFF_TRIG_FF capture back to Cycle 1 (ACTIVE_EN_D1, with STUFF_TRIG_RAW arriving <= 18.781 ns directly)—and re-run the full suite, just say the word.
