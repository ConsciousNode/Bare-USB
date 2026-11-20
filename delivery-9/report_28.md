# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-20T06:26:06.233Z`)
- **Code SHA-256:** `e91f47b3f958f5e089f79f81877698c1f3679bf736c7d76011891ce8274089da`
- **Tables Digest:** `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b (16640 B)`
- **Overall Verdict:** **6 / 9 Tests Passed** (`allPassed=false`)

> **Architecture:** Single `48.000 MHz` (`CLK_48M`, `T = 20.781 ns` @ `+0.25%` worst-case crystal) clock domain with synchronous look-ahead SOF counter (`U26..U29`, `U220..U221`), registered synchronous clock-enable strobes, `2`-flop bus-input synchronizers (`U04`, `U200 -> U219`), `10 ns` SRAM LUTs (`IS61WV5128EDBLL`), `3`-cycle pipelined CRC-16/CRC-5 (`U207..U211`), registered FSM LUT outputs (`U215..U218`), and SOF/keep-alive `DONE_SET` + `CPU_START_CLR_N` isolation (`U212..U213`).

## 1. Automated Verification Suite Summary (Tests 1–9)

| Test | Name | Result | Details |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan | PASS |  |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | PASS |  |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | PASS | [corner=min] gate SHA=6c0abc256402…, ref SHA=6c0abc256402…, match=true |
| 4 | Corners & Static Timing Analysis (Min/Typ/Max, CLK_48M @ 20.781 ns) | FAIL | STA max=PASS (0/146); dyn corners=2/7; MCP dyn=PASS (0 off-en, mutant caught) |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | FAIL | min: 64KB=PASS, 100-key=100/100 (PASS); max: 64KB=FAIL, 100-key=FAIL |
| 6 | Mutants That Must Fail (11 Mutants incl. MCP Off-Enable) | PASS | [corner=min] 11/11 killed (baseline MSC=PASS, HID=PASS, skew=PASS) |
| 7 | Wire-Level Error Injection (Flipped CRC, 7-Ones Run, Dropped ACK) | PASS | [corner=min] retries=3, stage=COMPLETE |
| 8 | CPU Budget (Accesses/Byte on 64 KB Read & Idle Keyboard Duty) | FAIL | min: 64KB=0.6581 reg/B, idle KB=8% (80 µs/ms); max: not measurable: workload failed |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | PASS | [corner=min] deterministic; workload passes |

## 2. Test 5 — Full-Speed 64 KB FAT16 File & Low-Speed 100 Keystrokes

| Corner | Workload | Pass | Violations | Details |
|---|---|:---:|---:|---|
| `min` | FS 64 KB FAT16 File | YES | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` (expected `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`, retries=0) |
| `min` | LS 100 HID Keystrokes | YES | 0 | Exact matches: **100 / 100**, retries=0 |
| `max` | FS 64 KB FAT16 File | NO | 374 | SCSI_INQUIRY: CSW_FAILED |
| `max` | LS 100 HID Keystrokes | NO | 2327 | Exact matches: 0 / 100 (COMPLETE: n/a) |

## 3. Timing & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any dynamic corner with `setupHoldViolations > 0` is reported as **NO** (FAIL).

| Corner | Delay | Host Skew | Dev Skew | Pass | Violations | DPLL Slack (ns) | FSM Slack (ns) | Gate Evals | Worst Violating Paths |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | +13.781 | +7.781 | 39980390 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 8674 | +7.283 | +5.233 | 39832472 | U216_FSM_LUT_REG.XFER_DONE_GATED (20x, -1.37ns); U04_DPLL_EDGE_FF.RCV_IN (2888x, -0.83ns); U200_BUS_SYNC_FF.DP_IN (2888x, -0.83ns) |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 75 | +0.786 | +3.286 | 10117678 | U208_CRC_FB_FF.CRC16_FB (26x, -1.64ns); U208_CRC_FB_FF.CRC5_FB (26x, -1.64ns); U216_FSM_LUT_REG.NXT_S0_RAW (9x, -1.13ns) |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | NO | 381 | +0.681 | +3.181 | 17139661 | U208_CRC_FB_FF.CRC16_FB (164x, -1.96ns); U208_CRC_FB_FF.CRC5_FB (168x, -1.96ns); U216_FSM_LUT_REG.NXT_S0_RAW (20x, -1.34ns) |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | +13.781 | +7.781 | 28317288 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 3275 | +7.283 | +9.283 | 28295851 | U216_FSM_LUT_REG.XFER_DONE_GATED (23x, -1.37ns); U04_DPLL_EDGE_FF.RCV_IN (1086x, -0.83ns); U200_BUS_SYNC_FF.DP_IN (1078x, -0.83ns) |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | NO | 432 | +0.786 | +3.286 | 28235779 | U208_CRC_FB_FF.CRC16_FB (176x, -1.64ns); U208_CRC_FB_FF.CRC5_FB (180x, -1.64ns); U216_FSM_LUT_REG.NXT_S0_RAW (28x, -1.13ns) |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **39 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** `0.55%` (GET_CONFIG_DESC: RETRIES_EXHAUSTED), `1%` (SCSI_READ: RETRIES_EXHAUSTED)

### 3c. Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

| Corner | Pass | Failing / Total Endpoints | Worst 1-Cycle Slack (ns) | Declared MCPs (`N=4`) | Worst Arrival (ns) | Worst Slack (ns) | Worst Failing Endpoint |
|---|:---:|---:|---:|---:|---:|---:|---|
| `min` | YES | 0 / 146 | +13.781 | 0 | 17 | +13.781 | `none` |
| `typ` | YES | 0 / 146 | +7.231 | 74 | 48.75 | +7.231 | `none` |
| `max` | YES | 0 / 146 | +0.481 | 99 | 80.5 | +0.224 | `none` |

### 3d. Declared Asynchronous Bus Inputs (Excluded from `CLK_48M` STA, Verified 2-Flop Synchronizers)

| Stage 1 Endpoint | Async Net | Stage 1 Out | Stage 2 Endpoint | Synced Net | Verified 2-Flop | Reason |
|---|---|---|---|---|:---:|---|
| `U04_DPLL_EDGE_FF.1D` | `RCV_IN` | `RCV_D1` | `U04_DPLL_EDGE_FF.2D` | `RCV_D2` | YES | Asynchronous differential USB RCV input from USB1T11A |
| `U200_BUS_SYNC_FF.1D` | `DP_IN` | `DP_SYNC_1` | `U219_BUS_SYNC_FF2.1D` | `DP_SYNC` | YES | Asynchronous single-ended D+ input from USB1T11A VP |
| `U200_BUS_SYNC_FF.2D` | `DM_IN` | `DM_SYNC_1` | `U219_BUS_SYNC_FF2.2D` | `DM_SYNC` | YES | Asynchronous single-ended D- input from USB1T11A VM |

### 3e. Declared `N = 4` Multicycle Paths (`max` Corner — Top 20 of 99 Paths, Limit = `4 × 20.781 - t_su`)

| Source | Endpoint | Enable | N | Arrival (ns) | Limit (ns) | Slack (ns) | Pass |
|---|---|---|---:|---:|---:|---:|:---:|
| `U34_FSM_STATE` | `U11_STUFF_CNT.PE_N (STUFF_LOAD_N)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 80.4 | 80.624 | +0.224 | YES |
| `U34_FSM_STATE` | `U08_NRZI_FF.1D (NRZI_TX_D_EN)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 80.5 | 81.124 | +0.624 | YES |
| `U34_FSM_STATE` | `U11_STUFF_CNT.CEP (STUFF_CNT_EN)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 71.1 | 80.624 | +9.524 | YES |
| `U34_FSM_STATE` | `U11_STUFF_CNT.CET (STUFF_CNT_EN)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 71.1 | 80.624 | +9.524 | YES |
| `U34_FSM_STATE` | `U208_CRC_FB_FF.1D (CRC16_FB)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 62.3 | 81.124 | +18.824 | YES |
| `U34_FSM_STATE` | `U208_CRC_FB_FF.2D (CRC5_FB)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 62.3 | 81.124 | +18.824 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D7 (XFER_DONE_GATED)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 54.6 | 81.124 | +26.524 | YES |
| `U21_RX_SR` | `U22_BIT_CNT.PE_N (BIT_CNT_LOAD_N)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 53.2 | 80.624 | +27.424 | YES |
| `U34_FSM_STATE` | `U34_FSM_STATE.D4 (FSM_DIN4)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 52.5 | 81.124 | +28.624 | YES |
| `U34_FSM_STATE` | `U34_FSM_STATE.D5 (FSM_DIN5)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 52.5 | 81.124 | +28.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D0 (NXT_S0_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D1 (NXT_S1_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D2 (NXT_S2_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D3 (NXT_S3_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D4 (TX_OE_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D5 (CTRL_RX_EN_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U34_FSM_STATE` | `U216_FSM_LUT_REG.D6 (CTRL_TURN_EN_RAW)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 50.5 | 81.124 | +30.624 | YES |
| `U17_CRC16_LO` | `U139_ERR_LAT_FF.1D (ERR_CRC_D_MUX)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 39.2 | 81.124 | +41.924 | YES |
| `U115_ACK_PHASE_CNT` | `U115_ACK_PHASE_CNT.CEP (ACK_PHASE_EN)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 37 | 80.624 | +43.624 | YES |
| `U115_ACK_PHASE_CNT` | `U115_ACK_PHASE_CNT.CET (ACK_PHASE_EN)` | `ACTIVE_EN (4x FS / 32x LS)` | 4 | 37 | 80.624 | +43.624 | YES |

**Dynamic MCP Source-Enable Proof (`CLK_48M` Cycle-by-Cycle Verification):**
- **Unmutated Baseline:** **PASS** — `0` off-enable source Q transitions across `43,996` checked `CLK_48M` rising edges during FS MSC enumeration.
- **Negative Control Mutant (`mcp_source_changes_off_enable`):** **CAUGHT** — `55` off-enable transitions detected (first offender: `U34_FSM_STATE.CUR_S0`, `enumOk=false`).

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
| `mcp_source_changes_off_enable` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |

## 5. CPU Budget (Test 8 — Accesses/Byte on 64 KB Read & Idle Keyboard Duty)

| Corner | Metric | Result | Details |
|---|---|---:|---|
| `min` | FS 64 KB Read — Reg Accesses / Byte | 0.6581 reg/B | 43,130 reg accesses / 65,536 B (6.581 µs/B, 40.2 reg/xfer) |
| `min` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 8% | 80 µs / 1 ms frame (8 reg/frame, 5/5 NAKs, 0 viol) |
| `max` | FS 64 KB Read — Reg Accesses / Byte | not measurable | not measurable: workload failed |
| `max` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 8% | 80 µs / 1 ms frame (5/5 NAKs, 482 viol — FAIL due to timing violations) |

## 6. Bill of Materials (Measured from Netlist)

Total ICs: **209** | Estimated Unit BOM: **$115.40**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 22 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $7.70 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 13 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $4.16 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 28 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $9.52 | [PDF](https://www.ti.com/product/SN74LVC08A) |
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

## 7. Root-Cause Summary (Regenerated Strictly from STA & `results.jsonl`)

- **Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`):**
  - **`min` corner:** **PASS** (`0 / 146` failing endpoints, worst arrival `17 ns`, worst slack `+13.781 ns`).
  - **`typ` corner:** **PASS** (`0 / 146` failing endpoints, worst arrival `48.75 ns`, worst slack `+7.231 ns`).
  - **`max` corner:** **PASS** (`0 / 146` failing endpoints, worst 1-cycle slack `+0.481 ns`, worst `N=4` MCP arrival `80.5 ns`, worst MCP slack `+0.224 ns`).
- **Remaining Dynamic `max`-Corner Blocker (Why Tests 4, 5, and 8 Remain FAIL):** Although static timing now closes at `0 / 146` failing endpoints across `min`, `typ`, and `max` (with verified 2-flop async synchronizers and dynamically proven `N = 4` MCPs), the event-driven simulator (`src/simulator.js`) still checks setup/hold on **every** `CLK_48M` rising edge at un-enabled capture flip-flops `U208_CRC_FB_FF` (`CRC16_FB`, `CRC5_FB`) and `U216_FSM_LUT_REG` (`NXT_S0_RAW`), which receive `N = 4` combinational nets that transition near intermediate `CLK_48M` edges (`1..3`). At `max` corner, `U208_CRC_FB_FF` and `U216_FSM_LUT_REG` record dynamic setup violations (`-1.80 ns` and `-1.23 ns`), and `FS_MAX_HOST-0.25_DEV+0.25` fails enumeration. Converting `U208` and `U216` to bit-rate-enabled capture (or pipelining their upstream logic into registered 1-cycle stages) is required to clear dynamic `max`-corner violations and pass `FS_MAX_HOST-0.25_DEV+0.25`. Therefore Tests 4, 5, and 8 remain honestly **FAIL**.
