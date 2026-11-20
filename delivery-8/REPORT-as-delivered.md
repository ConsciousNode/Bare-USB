# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-19T06:34:24.001Z`)
- **Code SHA-256:** `d8233d827041a9a58576047a748d0a414a28f6567ff22b0d5341b6a3e32f3e17`
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
| `max` | FS 64 KB FAT16 File | NO | 381 | SCSI_INQUIRY: CSW_FAILED |
| `max` | LS 100 HID Keystrokes | NO | 900 | Exact matches: 0 / 100 (GET_DEVICE_DESC: RETRIES_EXHAUSTED) |

## 3. Timing & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any corner with `setupHoldViolations > 0` is reported as **NO** (FAIL).

| Corner | Delay | Host Skew | Dev Skew | Pass | Violations | DPLL Slack (ns) | FSM Slack (ns) | Gate Evals | Worst Violating Paths |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | +13.781 | +7.781 | 39592873 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 9079 | +7.283 | +5.233 | 39446539 | U208_CRC_FB_FF.CRC16_FB (3x, -1.28ns); U208_CRC_FB_FF.CRC5_FB (3x, -1.28ns); U205_CRC_PIPE_FF0.CRC_BIT_IN (421x, -0.97ns) |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 100 | +0.786 | +3.286 | 10025461 | U208_CRC_FB_FF.CRC16_FB (33x, -1.64ns); U208_CRC_FB_FF.CRC5_FB (33x, -1.64ns); U215_ACT_SEL_FF.ACTIVE_CLK_SEL_D (4x, -1.41ns) |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | NO | 410 | +0.681 | +3.181 | 16986430 | U208_CRC_FB_FF.CRC16_FB (170x, -1.96ns); U208_CRC_FB_FF.CRC5_FB (174x, -1.96ns); U215_ACT_SEL_FF.ACTIVE_CLK_SEL_D (7x, -1.52ns) |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | +13.781 | +7.781 | 28032939 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 9165 | +7.283 | +9.283 | 28014000 | U205_CRC_PIPE_FF0.CRC_BIT_IN (431x, -0.97ns); U04_DPLL_EDGE_FF.RCV_IN (1086x, -0.83ns); U200_BUS_SYNC_FF.DP_IN (1078x, -0.83ns) |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | NO | 903 | +0.786 | +3.286 | 4179922 | U208_CRC_FB_FF.CRC16_FB (48x, -1.63ns); U208_CRC_FB_FF.CRC5_FB (48x, -1.63ns); U216_FSM_LUT_REG.NXT_S0_RAW (3x, -1.13ns) |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **39 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** `0.55%` (GET_CONFIG_DESC: RETRIES_EXHAUSTED), `1%` (SCSI_READ: RETRIES_EXHAUSTED)

### 3c. Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

| Corner | Pass | Failing / Total Endpoints | Worst Arrival (ns) | Worst Slack (ns) | Worst Path |
|---|:---:|---:|---:|---:|---|
| `min` | YES | 0 / 146 | 18 | +0.281 | `none` |
| `typ` | NO | 84 / 146 | 52.05 | -33.719 | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N)` |
| `max` | NO | 116 / 146 | 86.1 | -67.719 | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N)` |

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

Total ICs: **207** | Estimated Unit BOM: **$114.71**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 21 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $7.35 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 13 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $4.16 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 27 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $9.18 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 61 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $25.62 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 19 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $6.46 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 14 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $7.00 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 5 / 0.5 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC245A | 10 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $4.80 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 6. Root-Cause Summary (Regenerated Strictly from STA & `results.jsonl`)

- **Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`):**
  - **`min` corner:** **PASS** (`0 / 146` failing endpoints, worst arrival `18 ns`, worst slack `+0.281 ns`).
  - **`typ` corner:** **FAIL** (`84 / 146` failing endpoints, worst arrival `52.05 ns`, worst slack `-33.719 ns`, worst endpoint `U11_STUFF_CNT.PE_N (STUFF_LOAD_N)`).
  - **`max` corner:** **FAIL** (`116 / 146` failing endpoints, worst arrival `86.1 ns`, worst slack `-67.719 ns`, worst endpoint `U11_STUFF_CNT.PE_N (STUFF_LOAD_N)`).
- **Structural Timing Blocker at `max` Corner:** Registering `ACTIVE_CLK_SEL` (`U215`), registering `U35/U36` FSM LUT outputs (`U216`), and bypassing `U52` for `IS_EOP_STATE` (`U217/U218`) closed `min`-corner STA (`0 / 146` failing) and broke the two-SRAM `U52 -> EOP_VALID -> U35 -> TX_OE -> ACTIVE_EN` loop. However, closing `max` single-cycle (`20.781 ns`) remains blocked by the physical `74LVC574A` (`7.0 ns`) + `IS61WV5128EDBLL` (`10.0 ns`) floor (`17.0 ns`, leaving `1.78 ns` before `2.0 ns` `t_su`, less than one `3.7 ns` inverter) and the TX serializer chain (`U34 -> U95 -> U194 -> U142 -> U84 -> U86 -> U53 -> U129..U131 -> U71 -> U117 -> U08/U11` = `86.1 ns` at `max`, exceeding even a 4-cycle FS bit period of `83.124 ns`). Therefore `typ` and `max` remain honestly **FAIL**.
