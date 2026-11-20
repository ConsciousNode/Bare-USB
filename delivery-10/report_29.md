# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-20T10:54:59.766Z`)
- **Code SHA-256:** `4d4498b2700decaaa841cd40cebbc1e83d2b5b103b96cf4c5de6a61b964622e0`
- **Tables Digest:** `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b (16640 B)`
- **Overall Verdict:** **7 / 9 Tests Passed** (`allTestsPassed=false`)

> **Architecture:** Single `48.000 MHz` (`CLK_48M`, `T = 20.781 ns` @ `+0.25%` worst-case crystal) clock domain with synchronous CPU registers (`U44..U51` on `CLK_48M`), registered aligned `ACTIVE_EN`/`TX_BIT_EN`/`RX_SAMPLE_EN` strobes (`U164`, `U222..U223`), registered dual-polarity 1-hot state flags (`U228..U238`), 3-stage pipelined TX serializer (`U243..U253`), 3-stage pipelined FSM address/LUT cone (`U241..U242`, `U216`), synchronous look-ahead SOF counter (`U26..U29`, `U220..U221`), verified 2-flop bus-input synchronizers (`U04`, `U200 -> U219`), and `10 ns` SRAM LUTs (`IS61WV5128EDBLL`).

## 1. Automated Verification Suite Summary (Tests 1–9)

| Test | Name | Result | Details |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan | PASS |  |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | PASS |  |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | PASS | [corner=min] gate SHA=6c0abc256402…, ref SHA=6c0abc256402…, match=true |
| 4 | Corners & Static Timing Analysis (Min/Typ/Max, CLK_48M @ 20.781 ns) | FAIL | STA max=PASS (0/258); dyn corners=6/7; MCP dyn=PASS (min+max 0 off-en, 2/2 mutants caught) |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | PASS | min: 64KB=PASS, 100-key=100/100 (PASS); max: 64KB=PASS, 100-key=100/100 (PASS) |
| 6 | Mutants That Must Fail (12 Mutants incl. MCP Source & Endpoint Off-Enable) | PASS | [corner=min] 12/12 killed (baseline MSC=PASS, HID=PASS, skew=PASS) |
| 7 | Wire-Level Error Injection (Flipped CRC, 7-Ones Run, Dropped ACK) | FAIL | [corner=min] retries=2, stage=COMPLETE |
| 8 | CPU Budget (Accesses/Byte on 64 KB Read & Idle Keyboard Duty) | PASS | min: 64KB=0.6423 reg/B, idle KB=6% (60 µs/ms); max: 64KB=0.6423 reg/B, idle KB=6% |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | PASS | [corner=min] deterministic; workload passes |

## 2. Test 5 — Full-Speed 64 KB FAT16 File & Low-Speed 100 Keystrokes

| Corner | Workload | Pass | Violations | Retries | Details |
|---|---|:---:|---:|---:|---|
| `min` | FS 64 KB FAT16 File | YES | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` (expected `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`) |
| `min` | LS 100 HID Keystrokes | YES | 0 | 0 | Exact matches: **100 / 100** |
| `max` | FS 64 KB FAT16 File | YES | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` |
| `max` | LS 100 HID Keystrokes | YES | 0 | 0 | Exact matches: **100 / 100** |

> **Clean-Wire Retries Note:** The `2` clean-wire retries seen on the 64 KB read in Round 7/8 dropped to `0` starting in Round 9. Four FS-path changes landed together in Round 9 (exact 48,000-clock synchronous look-ahead SOF counter, `U200 -> U219` 2-flop bus synchronizer, registered `IS_SOF_XFER`, and `XFER_DONE` SOF gating before `U216`); we did not run an individual ablation to isolate which of those four eliminated the 2 retries.

## 3. Timing & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any dynamic corner with synchronous `setupHoldViolations > 0` fails. Setup/hold events on the 3 declared asynchronous first-stage 2-flop synchronizer inputs (`U04_DPLL_EDGE_FF.1D`, `U200_BUS_SYNC_FF.1D/2D`) are reported separately in `Async Sync Events`.

| Corner | Delay | Host Skew | Dev Skew | Pass | Sync Violations | Async Sync Events | DPLL Slack (ns) | FSM Slack (ns) | Gate Evals | Worst Violating Paths |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | 0 | +13.781 | +15.281 | 67838035 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 8652 | +7.283 | +9.083 | 67876430 | none |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 0 | 0 | +0.786 | +2.886 | 67579507 | none |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | YES | 0 | 0 | +0.681 | +2.781 | 67853713 | none |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | 0 | +13.781 | +15.281 | 48136351 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 3250 | +7.283 | +9.283 | 48076305 | none |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | YES | 0 | 0 | +0.786 | +2.886 | 47980737 | none |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **41 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** None

### 3c. Strict Per-Path Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

Enable flops (`U164`, `U215`, `U222`, `U223`, `U207`, `U210`, `U221`) and synchronizer outputs (`U04`, `U219`, `U201`) are strictly checked at `N = 1` everywhere. `N = 4` applies ONLY to paths launching from a declared MCP source Q and terminating at a declared, enable-gated MCP endpoint pin.

| Corner | Pass | Failing / Total Endpoints | 1-Cycle Fails | MCP Fails | Worst 1-Cycle Slack (ns) | Declared MCPs (`N=4`) | Worst Arrival (ns) | Worst Slack (ns) |
|---|:---:|---:|---:|---:|---:|---:|---:|---:|
| `min` | YES | 0 / 258 | 0 | 0 | +13.781 | 0 | 13.5 | +13.781 |
| `typ` | YES | 0 / 258 | 0 | 0 | +7.231 | 22 | 33.35 | +7.231 |
| `max` | YES | 0 / 258 | 0 | 0 | +0.181 | 65 | 53.2 | +0.181 |

### 3d. Declared Asynchronous Bus Inputs (Excluded from `CLK_48M` STA, Verified 2-Flop Synchronizers)

| Stage 1 Endpoint | Async Net | Stage 1 Out | Stage 2 Endpoint | Synced Net | Verified 2-Flop | Reason |
|---|---|---|---|---|:---:|---|
| `U04_DPLL_EDGE_FF.1D` | `RCV_IN` | `RCV_D1` | `U04_DPLL_EDGE_FF.2D` | `RCV_D2` | YES | Asynchronous differential USB RCV input from USB1T11A |
| `U200_BUS_SYNC_FF.1D` | `DP_IN` | `DP_SYNC_1` | `U219_BUS_SYNC_FF2.1D` | `DP_SYNC` | YES | Asynchronous single-ended D+ input from USB1T11A VP |
| `U200_BUS_SYNC_FF.2D` | `DM_IN` | `DM_SYNC_1` | `U219_BUS_SYNC_FF2.2D` | `DM_SYNC` | YES | Asynchronous single-ended D- input from USB1T11A VM |

### 3e. Declared Per-Path `N = 4` Multicycle Paths (`max` Corner — Top 25 of 65 Paths, Limit = `4 × 20.781 - t_su`)

| Source Q | Endpoint Pin | Enable | N | Arrival (ns) | Limit (ns) | Slack (ns) | Pass |
|---|---|---|---:|---:|---:|---:|:---:|
| `U21_RX_SR.RX_D0` | `U22_BIT_CNT.PE_N (BIT_CNT_LOAD_N)` | `ACTIVE_EN` | 4 | 53.2 | 80.624 | +27.424 | YES |
| `U17_CRC16_LO.CRC16_Q7` | `U139_ERR_LAT_FF.1D (ERR_CRC_D_MUX)` | `CRC_CHK_D2|!WR_CSR_N` | 4 | 39.2 | 81.124 | +41.924 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D0 (RDL1_D0)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D1 (RDL1_D1)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D2 (RDL1_D2)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D3 (RDL1_D3)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D4 (RDL1_D4)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D5 (RDL1_D5)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D6 (RDL1_D6)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D7 (RDL1_D7)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D0 (RDL2_D0)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D1 (RDL2_D1)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D2 (RDL2_D2)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D3 (RDL2_D3)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D4 (RDL2_D4)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D5 (RDL2_D5)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D6 (RDL2_D6)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D7 (RDL2_D7)` | `ACTIVE_EN` | 4 | 31.7 | 81.124 | +49.424 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U76_LEN_CNT_LO.CEP (BCNT_ADV_EN)` | `ACTIVE_EN|!SIE_BUSY` | 4 | 30.3 | 80.624 | +50.324 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U77_LEN_CNT_HI.CEP (BCNT_ADV_EN)` | `ACTIVE_EN|!SIE_BUSY` | 4 | 30.3 | 80.624 | +50.324 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U115_ACK_PHASE_CNT.CEP (ACK_PHASE_EN)` | `TX_BIT_EN|!S_AUTO_ACK` | 4 | 30.3 | 80.624 | +50.324 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U115_ACK_PHASE_CNT.CET (ACK_PHASE_EN)` | `TX_BIT_EN|!S_AUTO_ACK` | 4 | 30.3 | 80.624 | +50.324 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U93_TX_BYTE_LAT.D0 (TX_LAT_DIN0)` | `TX_BIT_EN` | 4 | 27.6 | 81.124 | +53.524 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U93_TX_BYTE_LAT.D1 (TX_LAT_DIN1)` | `TX_BIT_EN` | 4 | 27.6 | 81.124 | +53.524 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U93_TX_BYTE_LAT.D2 (TX_LAT_DIN2)` | `TX_BIT_EN` | 4 | 27.6 | 81.124 | +53.524 | YES |

**Strict Dynamic MCP Source & Endpoint Proof (Enable Sampled Strictly Before Edge, Unknown Nets Fail):**
- **Unmutated Baseline (`min`):** **PASS** — `0` source off-enable changes, `0` endpoint off-enable captures across `43,996` `CLK_48M` rising edges.
- **Unmutated Baseline (`max`):** **PASS** — `0` source off-enable changes, `0` endpoint off-enable captures across `43,996` `CLK_48M` rising edges.
- **Planted Source Mutant (`mcp_source_changes_off_enable`):** **CAUGHT** — `190` off-enable source changes detected.
- **Planted Endpoint Mutant (`mcp_endpoint_captures_off_enable`):** **CAUGHT** — `2141` off-enable endpoint captures detected.

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
| `mcp_endpoint_captures_off_enable` | YES (baseline=PASS) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |

## 5. CPU Budget (Test 8 — Accesses/Byte on 64 KB Read & Idle Keyboard Duty)

| Corner | Metric | Result | Details |
|---|---|---:|---|
| `min` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B, 39.23 reg/xfer) |
| `min` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs, 0 viol) |
| `max` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B, 39.23 reg/xfer) |
| `max` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs, 0 viol) |

## 6. Bill of Materials (Measured from Netlist)

Total ICs: **261** | Estimated Unit BOM: **$135.29**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 49 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $17.15 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 12 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $3.84 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 31 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $10.54 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 77 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $32.34 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 22 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $7.48 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 18 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $9.00 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 5 / 0.5 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC245A | 10 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $4.80 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 7. Round 10 Closure Summary (Regenerated Strictly from STA & `results.jsonl`)

- **Strict Per-Path STA (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`):**
  - **`min` corner:** **PASS** (`0 / 258` failing, worst slack `+13.781 ns`).
  - **`typ` corner:** **PASS** (`0 / 258` failing, worst slack `+7.231 ns`).
  - **`max` corner:** **PASS** (`0 / 258` failing, `0` 1-cycle fails, `0` MCP fails, worst 1-cycle slack `+0.181 ns`, worst `N=4` MCP arrival `53.2 ns`).
- **Dynamic Timing & Full Workloads:** All 7 dynamic corners (`min`, `typ`, `max`) recorded `0` synchronous setup/hold violations (with declared async first-stage synchronizer events reported separately). Overall suite: **7 / 9 tests passed**.
