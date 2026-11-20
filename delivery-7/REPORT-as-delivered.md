# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-18T10:58:36-05:00`)
- **Code SHA-256:** `d67c7d84a4a0bb9b58b562a351a3c9282773193015daf229d065ee23bbf80d9e`
- **Tables Digest:** `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b (16640 B)`
- **Overall Verdict:** **5 / 9 Tests Passed** (`allPassed=false`)

> **Architecture:** Single `48.000 MHz` (`CLK_48M`, `T = 20.833 ns`) clock domain with registered synchronous clock-enable strobes, `10 ns` SRAM LUTs (`IS61WV5128EDBLL`), `3`-cycle pipelined CRC-16/CRC-5 (`U205..U211`), and SOF/keep-alive `DONE_SET` + `CPU_START_CLR_N` isolation (`U212..U213`).

## 1. Automated Verification Suite Summary (Tests 1–9)

| Test | Name | Result | Details |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan | PASS |  |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | PASS |  |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | FAIL | [corner=min]  |
| 4 | Corners & Static Timing Analysis (Min/Typ/Max, CLK_48M @ 20.781 ns) | FAIL |  |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | FAIL | min 64KB=PASS, min 100-key=100/100 (PASS); max=FAIL |
| 6 | Mutants That Must Fail (10 Mutants) | PASS | [corner=min] 10/10 killed (baseline MSC=PASS, HID=PASS) |
| 7 | Wire-Level Error Injection (Flipped CRC, 7-Ones Run, Dropped ACK) | PASS | [corner=min]  |
| 8 | CPU Budget (10 µs per Port Access) | FAIL | min: FS=40.24 reg/xfer, LS=17.61 reg/xfer; max: not measurable: workload failed |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | PASS | [corner=min] deterministic; workload passes |

## 2. Test 5 — Full-Speed 64 KB FAT16 File & Low-Speed 100 Keystrokes

| Corner | Workload | Pass | Violations | Details |
|---|---|:---:|---:|---|
| `min` | FS 64 KB FAT16 File | YES | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` (expected `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`) |
| `min` | LS 100 HID Keystrokes | YES | 0 | Exact matches: **100 / 100** |
| `max` | FS 64 KB FAT16 File | NO | 820 | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `max` | LS 100 HID Keystrokes | NO | 66267 | Exact matches: 0 / 100 (COMPLETE: n/a) |

## 3. Timing & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any corner with `setupHoldViolations > 0` is reported as **NO** (FAIL).

| Corner | Delay | Host Skew | Dev Skew | Pass | Violations | DPLL Slack (ns) | FSM Slack (ns) | Gate Evals | Worst Violating Paths |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | +13.781 | +7.781 | 37946967 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 11425 | +7.283 | -1.017 | 39978564 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (54x, -2.22ns); U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW (2665x, -1.72ns); U15_CRC5_FF2.CRC5_D4_IN (10x, -1.47ns) |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 819 | +0.786 | +3.286 | 2321242 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (630x, -1.31ns); U57_LS_DPLL_CNT.LS_DPLL_PE_N (12x, -0.41ns); U208_CRC_FB_FF.CRC16_FB_GATED (81x, -0.21ns) |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | NO | 822 | +0.681 | +3.181 | 2330517 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (630x, -1.42ns); U57_LS_DPLL_CNT.LS_DPLL_PE_N (15x, -0.52ns); U208_CRC_FB_FF.CRC16_FB_GATED (81x, -0.32ns) |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | +13.781 | +7.781 | 26738947 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 4040 | +7.283 | +9.283 | 26723882 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (51x, -2.22ns); U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW (729x, -1.72ns); U15_CRC5_FF2.CRC5_D4_IN (10x, -1.47ns) |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | NO | 9864 | +0.786 | +3.286 | 26688771 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (4280x, -1.31ns); U208_CRC_FB_FF.CRC16_FB_GATED (2799x, -1.03ns); U208_CRC_FB_FF.CRC5_FB_GATED (2767x, -1.03ns) |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **39 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** `0.55%` (GET_CONFIG_DESC: RETRIES_EXHAUSTED), `1%` (SCSI_READ: RETRIES_EXHAUSTED)

### 3c. Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

| Corner | Pass | Failing / Total Endpoints | Worst Arrival (ns) | Worst Slack (ns) | Worst Path |
|---|:---:|---:|---:|---:|---|
| `min` | NO | 22 / 137 | 19.5 | -1.219 | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N_SYNC)` |
| `typ` | NO | 90 / 137 | 52.6 | -34.169 | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N_SYNC)` |
| `max` | NO | 115 / 137 | 86.1 | -67.719 | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N_SYNC)` |

## 4. Mutant Analysis (Test 6)

| Mutant | Killed | Stage / Reason |
|---|:---:|---|
| `crc16_tap_moved` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `bit_stuff_off_by_one` | YES (baseline=PASS) | SCSI_READ: RETRIES_EXHAUSTED |
| `nrzi_rx_inverted` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `turnaround_short` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `sof_missing` | YES (baseline=PASS) | IDLE_KEEPALIVE: DEVICE_SUSPENDED_NO_SOF |
| `fsm_bad_next_state` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `auto_ack_late` | YES (baseline=PASS) | GET_CONFIG_DESC: RETRIES_EXHAUSTED |
| `dpll_resync_disabled` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `buf_addr_carry_broken` | YES (baseline=PASS) | COMPLETE: n/a |
| `reg_dec_swapped` | YES (baseline=PASS) | ENUMERATION: NO_DEVICE_ATTACHED |

## 5. Bill of Materials (Measured from Netlist)

Total ICs: **204** | Estimated Unit BOM: **$113.60**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 20 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $7.00 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 13 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $4.16 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 26 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $8.84 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 62 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $26.04 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 18 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $6.12 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 13 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $6.50 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 5 / 0.5 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC245A | 10 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $4.80 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 6. Root-Cause Summary (`min` vs `typ` / `max`)

- **`min` corner (`0` violations):** Guarding `DONE_SET` and `CPU_START_CLR_N` against `IS_SOF_XFER` (`U212..U213`) eliminated the 1 ms SOF/keep-alive beat corruptions, yielding **100 / 100** exact HID keystrokes, **exact SHA-256** (`9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`) on the 64 KB FAT16 file read, and **21 / 21** passing points across `[-0.50%, +0.50%]` FS skew (`39 / 41` across `[-1.00%, +1.00%]`).
- **`typ` and `max` corners (FAIL):** Under a single `48.000 MHz` (`20.833 ns`) clock, `U11_STUFF_CNT.STUFF_LOAD_N_SYNC` (`-1.31` to `-2.22 ns`), `U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW` (`-1.72 ns` at `typ`), `U57_LS_DPLL_CNT.LS_DPLL_PE_N` (`-0.41` to `-0.52 ns`), and `U208_CRC_FB_FF.CRC16_FB_GATED` / `CRC5_FB_GATED` (`-0.21` to `-1.03 ns`) still violate `74LVC` setup time, so both `typ` and `max` remain failing.
