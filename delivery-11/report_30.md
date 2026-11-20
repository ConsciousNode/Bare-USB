# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-20T14:31:53.442Z`)
- **Code SHA-256:** `6009d6eb4f5805021d8734f25eb4c0b54428b8d4ca10ede3bc4fb114b60a7912`
- **Tables Digest:** `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b (16640 B)`
- **Overall Verdict:** **9 / 9 Tests Passed** (`allTestsPassed=true`)

> **Architecture:** Single `48.000 MHz` (`CLK_48M`, `T = 20.781 ns` @ `+0.25%` worst-case crystal) clock domain with synchronous CPU registers (`U44..U51` on `CLK_48M`), registered aligned `ACTIVE_EN`/`TX_BIT_EN`/`RX_SAMPLE_EN` strobes (`U164`, `U222..U223`, DPLL-bounded to `>= 3` clocks everywhere), registered dual-polarity 1-hot state flags (`U228..U238`), 3-stage pipelined TX serializer (`U243..U253`), 3-stage pipelined FSM address/LUT cone (`U241..U242`, `U216`), synchronous 1-clock buffer SRAM write one-shot (`U154`), synchronous look-ahead SOF counter (`U26..U29`, `U220..U221`), verified 2-flop bus-input synchronizers (`U04`, `U200 -> U219`), and `10 ns` SRAM LUTs/buffers (`IS61WV5128EDBLL`).

## 1. Automated Verification Suite Summary (Tests 1–9)

| Test | Name | Result | Details |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan & Net-Driver Lint | PASS | 0 forbidden tokens/parts; net-driver lint: 0 undriven / 0 multi-driver (885 read nets); `undriven_net_mutant`: CAUGHT |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | PASS |  |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | PASS | [corner=min] gate SHA=6c0abc256402…, ref SHA=6c0abc256402…, match=true |
| 4 | Corners, Static Timing, Enable Spacing & Buffer SRAM Verification | PASS | STA max=PASS (0/259); corners=7/7; MCP=PASS; spacing>=3=PASS; SRAM WR=PASS; FP=PASS |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | PASS | min: 64KB=PASS, 100-key=100/100 (PASS); max: 64KB=PASS, 100-key=100/100 (PASS) |
| 6 | Mutants That Must Fail (12 Mutants incl. MCP Source & Endpoint Off-Enable) | PASS | [corner=min] 12/12 killed (baseline MSC=PASS, HID=PASS, skew=PASS) |
| 7 | Wire-Level Error Injection (Individual & Combined Faults at Min & Max) | PASS | [corner=min & max] combined=3 retries; min=[corrupt_crc:1r, stuff_error:1r, drop_handshake:1r]; max=[corrupt_crc:1r, stuff_error:1r, drop_handshake:1r] |
| 8 | CPU Budget (Accesses/Byte on 64 KB Read & Idle Keyboard Duty) | PASS | min: 64KB=0.6423 reg/B, idle KB=6% (60 µs/ms); max: 64KB=0.6423 reg/B, idle KB=6% |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | PASS | [corner=min] deterministic; workload passes |

### 1b. Static Net-Driver Lint & Undriven-Net Closure (Round 11)

All five undriven nets identified in Round 10 (`SE0_PREV_N`, `RX_STUFF_ERR`, `STUFF_LOAD_N_RAW`, `RCV_D3`, `TOGGLE_DIFF`) have been resolved (`SE0_PREV_N` driven by `U15_CRC5_FF2.2Q_N`; `U60_ACK_GATE.3` wired to `ERR_STUFF_CMB`; unused legacy inputs tied to `GND`).
- **Baseline Netlist:** **PASS** — `885` read nets, `0` undriven nets, `0` multi-driver errors (`16` declared tri-state `BUS_D0..15` nets with exclusive `OE_N`).
- **Planted Mutant (`undriven_net_mutant`):** **CAUGHT** — detected undriven net(s): `SE0_PREV_N` (read by U150_TX_LAT_CLK_AND.2B).

## 2. Test 5 — Full-Speed 64 KB FAT16 File & Low-Speed 100 Keystrokes

| Corner | Workload | Pass | Violations | Retries | Details |
|---|---|:---:|---:|---:|---|
| `min` | FS 64 KB FAT16 File | YES | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` (expected `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`) |
| `min` | LS 100 HID Keystrokes | YES | 0 | 0 | Exact matches: **100 / 100** |
| `max` | FS 64 KB FAT16 File | YES | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` |
| `max` | LS 100 HID Keystrokes | YES | 0 | 0 | Exact matches: **100 / 100** |

## 3. Timing & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any dynamic corner with synchronous `setupHoldViolations > 0` fails. Setup/hold events on the 3 declared asynchronous first-stage 2-flop synchronizer inputs (`U04_DPLL_EDGE_FF.1D`, `U200_BUS_SYNC_FF.1D/2D`) are reported separately in `Async Sync Events`.

| Corner | Delay | Host Skew | Dev Skew | Pass | Sync Violations | Async Sync Events | DPLL Slack (ns) | FSM Slack (ns) | Gate Evals | Worst Violating Paths |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | 0 | +13.781 | +15.281 | 66889368 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 8652 | +7.433 | +9.083 | 66927638 | none |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | YES | 0 | 0 | +1.086 | +2.886 | 66634061 | none |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | YES | 0 | 0 | +0.981 | +2.781 | 66904651 | none |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | 0 | +13.781 | +15.281 | 47466964 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 3250 | +7.433 | +9.283 | 47408288 | none |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | YES | 0 | 0 | +1.086 | +2.886 | 47314077 | none |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **41 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** None

### 3c. Strict Per-Path Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

Enable flops (`U164`, `U215`, `U222`, `U223`, `U207`, `U210`, `U221`) and synchronizer outputs (`U04`, `U219`, `U201`) are strictly checked at `N = 1` everywhere. `N = 3` applies to `ACTIVE_EN`/`RX_SAMPLE_EN` bit-rate MCPs (proven `>= 3` clocks everywhere by the DPLL bound); `N = 4` applies only to `TX_BIT_EN` MCPs (mod-4 divider). All `IS61WV5128EDBLL` SRAMs — including packet buffers `U41_BUF_SRAM_LO` and `U42_BUF_SRAM_HI` — are timed from `A0..A18`, `CE_N`, and `OE_N` to `IO0..IO7`.

| Corner | Pass | Failing / Total Endpoints | 1-Cycle Fails | MCP Fails | Worst 1-Cycle Slack (ns) | Declared MCPs | Worst Arrival (ns) | Worst Slack (ns) |
|---|:---:|---:|---:|---:|---:|---:|---:|---:|
| `min` | YES | 0 / 259 | 0 | 0 | +13.781 | 0 | 13.5 | +13.781 |
| `typ` | YES | 0 / 259 | 0 | 0 | +7.231 | 30 | 33.35 | +7.231 |
| `max` | YES | 0 / 259 | 0 | 0 | +0.181 | 64 | 53.2 | +0.181 |

### 3d. Declared Asynchronous Bus Inputs (Excluded from `CLK_48M` STA, Verified 2-Flop Synchronizers)

| Stage 1 Endpoint | Async Net | Stage 1 Out | Stage 2 Endpoint | Synced Net | Verified 2-Flop | Reason |
|---|---|---|---|---|:---:|---|
| `U04_DPLL_EDGE_FF.1D` | `RCV_IN` | `RCV_D1` | `U04_DPLL_EDGE_FF.2D` | `RCV_D2` | YES | Asynchronous differential USB RCV input from USB1T11A |
| `U200_BUS_SYNC_FF.1D` | `DP_IN` | `DP_SYNC_1` | `U219_BUS_SYNC_FF2.1D` | `DP_SYNC` | YES | Asynchronous single-ended D+ input from USB1T11A VP |
| `U200_BUS_SYNC_FF.2D` | `DM_IN` | `DM_SYNC_1` | `U219_BUS_SYNC_FF2.2D` | `DM_SYNC` | YES | Asynchronous single-ended D- input from USB1T11A VM |

### 3e. Declared Per-Path Multicycle Paths (`max` Corner — Top 25 of 64 Paths, `N = 3` for RX/ACTIVE, `N = 4` for TX)

| Source Q | Endpoint Pin | Enable | N | Arrival (ns) | Limit (ns) | Slack (ns) | Pass |
|---|---|---|---:|---:|---:|---:|:---:|
| `U21_RX_SR.RX_D0` | `U22_BIT_CNT.PE_N (BIT_CNT_LOAD_N)` | `ACTIVE_EN` | 3 | 53.2 | 59.843 | +6.643 | YES |
| `U17_CRC16_LO.CRC16_Q7` | `U139_ERR_LAT_FF.1D (ERR_CRC_D_MUX)` | `CRC_CHK_D2|!WR_CSR_N` | 3 | 39.2 | 60.343 | +21.143 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D0 (RDL1_D0)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D1 (RDL1_D1)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D2 (RDL1_D2)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D3 (RDL1_D3)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D4 (RDL1_D4)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D5 (RDL1_D5)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D6 (RDL1_D6)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U97_RDLEN_D1.D7 (RDL1_D7)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D0 (RDL2_D0)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D1 (RDL2_D1)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D2 (RDL2_D2)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D3 (RDL2_D3)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D4 (RDL2_D4)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D5 (RDL2_D5)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D6 (RDL2_D6)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U98_RDLEN_D2.D7 (RDL2_D7)` | `ACTIVE_EN` | 3 | 31.7 | 60.343 | +28.643 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U76_LEN_CNT_LO.CEP (BCNT_ADV_EN)` | `ACTIVE_EN|!SIE_BUSY` | 3 | 30.3 | 59.843 | +29.543 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U77_LEN_CNT_HI.CEP (BCNT_ADV_EN)` | `ACTIVE_EN|!SIE_BUSY` | 3 | 30.3 | 59.843 | +29.543 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U121_STUFF_LAT_FF.2D (LAT_PID_NOW_D)` | `RX_SAMPLE_EN` | 3 | 27.6 | 60.343 | +32.743 | YES |
| `U21_RX_SR.RX_D0` | `U92_LAST_PID_REG.D7 (LPID_DIN7)` | `RX_SAMPLE_EN` | 3 | 26.8 | 60.343 | +33.543 | YES |
| `U22_BIT_CNT.BIT_Q0` | `U34_FSM_STATE.D7 (FSM_DIN7)` | `ACTIVE_EN` | 3 | 23.5 | 60.343 | +36.843 | YES |
| `U228_ST_FF0.S_IDLE` | `U13_CRC5_FF0.1D (CRC5_D0_IN)` | `CRC5_EN_D1|CRC5_INIT` | 3 | 23.2 | 60.343 | +37.143 | YES |
| `U228_ST_FF0.S_IDLE` | `U13_CRC5_FF0.2D (CRC5_D1_IN)` | `CRC5_EN_D1|CRC5_INIT` | 3 | 23.2 | 60.343 | +37.143 | YES |

**Strict Dynamic MCP Source & Endpoint Proof (Enable Sampled Strictly Before Edge, Unknown Nets Fail):**
- **Unmutated Baseline (`min`):** **PASS** — `0` source off-enable changes, `0` endpoint off-enable captures across `43,996` `CLK_48M` rising edges.
- **Unmutated Baseline (`max`):** **PASS** — `0` source off-enable changes, `0` endpoint off-enable captures across `43,996` `CLK_48M` rising edges.
- **Planted Source Mutant (`mcp_source_changes_off_enable`):** **CAUGHT** — `190` off-enable source changes detected.
- **Planted Endpoint Mutant (`mcp_endpoint_captures_off_enable`):** **CAUGHT** — `2142` off-enable endpoint captures detected.

### 3f. Dynamic Enable-Spacing Proof (`N = 3` Bounded by DPLL) & Mutant

Prior to Round 11, 2-clock `RX_SAMPLE_EN` intervals occurred 3 times during FS enumeration — all outside RX (`S_IDLE`, `S_TX_SYNC`, `S_AUTO_ACK`) when a bus edge reloaded `U05` on `Q == 3` — while 3-clock intervals occurred mid-packet in `S_RX_DATA` (~every 50 bits) under `+0.50%` relative clock drift pull-in. Gating `RX_SAMPLE_EN_PRE` with `DPLL_EDGE_REG_N` (`U275.4Y`) eliminates all 2-clock intervals while preserving exact DPLL phase lock.

| Run | Min `RX_SAMPLE_EN` (clks) | Min `ACTIVE_EN` (clks) | Min `TX_BIT_EN` (clks) | `RX_SAMPLE_EN` Histogram | Result |
|---|---:|---:|---:|---|:---:|
| Baseline `min` (`-0.25%/+0.25%`) | 3 | 3 | 4 | `{"3":12,"4":10965,"6":1}` | PASS |
| Baseline `max` (`-0.25%/+0.25%`) | 3 | 3 | 4 | `{"3":12,"4":10959,"5":2,"6":3}` | PASS |
| Mutant `enable_spacing_too_short` (`max`) | 2 | — | — | `{"2":3,"3":12,"4":10962,"5":2}` | CAUGHT (<3) |

### 3g. Packet Buffer SRAMs (`U41_BUF_SRAM_LO` / `U42_BUF_SRAM_HI`, `IS61WV5128EDBLL-10TLI`)

- **Read-Side STA (`A0..A18`, `CE_N`, `OE_N` -> `IO0..IO7`):** Worst valid path at `max` is `U231_ST_FF3.S_TX_DATA -> U93_TX_BYTE_LAT.D7 (TX_LAT_DIN7)` at **`38.4 ns`** (`N = 4`, limit `81.124 ns`, slack `+42.724 ns`).
- **Without Declared False Path (`ignoreFalsePaths=false`):** `8` endpoints (`U93_TX_BYTE_LAT.D0..D7`) fail 1-cycle STA at `37.3 ns` via `RX_WE_PULSE -> BUF_OE_N -> U41/U42`.

**Write-Side Timing vs `IS61WV5128EDBLL-10TLI` Datasheet** (synchronous 2-flop one-shot on `U154_RX_WE_FF` produces a glitch-free 1-clock `WE_N` pulse, eliminating the 3 combinational `1.0 ns`/`5.9 ns` runt glitches caught during Round 11 bring-up):

| Corner | Writes Checked | `t_SA` (spec `>= 0.0 ns`) | `t_PWE` (spec `>= 7.0 ns`) | `t_SD` (spec `>= 5.0 ns`) | `t_HD` (spec `>= 0.5 ns`) | Pass |
|---|---:|---:|---:|---:|---:|:---:|
| `min` | 90 | 23.886 ns | 20.886 ns | 45.771 ns | 37.771 ns | YES |
| `max` | 90 | 28.186 ns | 20.886 ns | 54.271 ns | 8.386 ns | YES |

**Declared False Path & Dynamic Proof:**
- **`FP_RX_WE_TO_TX_LAT` (`U124_BUF_OE_OR: RX_WE_PULSE -> BUF_OE_N` into `U93_TX_BYTE_LAT`):** USB 1.1 is half-duplex: RX_WE_PULSE is gated by S_RX_DATA (RX buffer write), whereas U93_TX_BYTE_LAT only captures buffer bytes during TX (S_TX_DPID/S_TX_DATA) when S_RX_DATA=0 and RX_WE_WIN=0.
- **Dynamic Invariant (`!(RX_WE_PULSE && S_TX_DATA) && !(RX_WE_PULSE && TX_LAT_EN)`):** `0` overlaps at `min`, `0` overlaps at `max` (**PASS**).
- **Planted Mutant (`false_path_violated`):** **CAUGHT** — `1280` illegal RX/TX overlap cycles detected.

## 4. Mutant Analysis (Test 6) & Wire-Level Error Injection (Test 7)

### 4a. Netlist Mutants (Test 6)

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

### 4b. Wire-Level Error Injection — Individual & Combined Faults (Test 7)

| Corner | Fault(s) | Pass | Retries Executed | Violations | Stage / Reason |
|---|---|:---:|---:|---:|---|
| `min` | `corrupt_crc` | YES | 1 | 0 | COMPLETE |
| `min` | `stuff_error` | YES | 1 | 0 | COMPLETE |
| `min` | `drop_handshake` | YES | 1 | 0 | COMPLETE |
| `max` | `corrupt_crc` | YES | 1 | 0 | COMPLETE |
| `max` | `stuff_error` | YES | 1 | 0 | COMPLETE |
| `max` | `drop_handshake` | YES | 1 | 0 | COMPLETE |
| `min` | `corrupt_crc` + `stuff_error` + `drop_handshake` (combined) | YES | 3 | 0 | COMPLETE |

## 5. CPU Budget (Test 8 — Accesses/Byte on 64 KB Read & Idle Keyboard Duty)

| Corner | Metric | Result | Details |
|---|---|---:|---|
| `min` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B, 39.23 reg/xfer) |
| `min` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs, 0 viol) |
| `max` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B, 39.23 reg/xfer) |
| `max` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs, 0 viol) |

## 6. Bill of Materials (Measured from Netlist)

Total ICs: **260** | Estimated Unit BOM: **$134.86**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 48 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $16.80 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 12 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $3.84 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 31 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $10.54 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 76 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $31.92 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 23 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $7.82 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 18 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $9.00 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 5 / 0.5 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC245A | 10 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $4.80 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 7. Round 11 Closure Summary (Regenerated Strictly from STA & `results.jsonl`)

- **Strict Per-Path STA (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`, incl. `U41`/`U42` Buffer SRAM Read Arcs):**
  - **`min` corner:** **PASS** (`0 / 259` failing, worst slack `+13.781 ns`).
  - **`typ` corner:** **PASS** (`0 / 259` failing, worst slack `+7.231 ns`).
  - **`max` corner:** **PASS** (`0 / 259` failing, `0` 1-cycle fails, `0` MCP fails, worst 1-cycle slack `+0.181 ns`, worst `N=3` MCP arrival `53.2 ns`).
- **Dynamic Timing, Enable Spacing, Buffer SRAM Writes & Fault Recovery:** All 7 dynamic corners (`min`, `typ`, `max`) recorded `0` synchronous setup/hold violations; `RX_SAMPLE_EN` and `ACTIVE_EN` spacing is bounded `>= 3` clocks at `min` and `max`; `U41`/`U42` writes meet all `IS61WV5128EDBLL-10TLI` specs with zero glitches; all 3 wire faults recover individually at `min` and `max`; and all 5 Round 11 mutants (`undriven_net_mutant`, `enable_spacing_too_short`, `false_path_violated`, plus MCP source/endpoint mutants) are caught. Overall suite: **9 / 9 tests passed**.
