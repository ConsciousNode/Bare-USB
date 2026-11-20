# Bare USB (Round 2): Closed-Box Discrete-Logic USB 1.1 Host SIE Report

> **ConsciousNode SoftWorks** — Xinu Rules (Zero external dependencies, offline, single-file HTML + Node CLIs).
> Generated strictly from `results.jsonl` (run `2026-11-18T10:58:36-05:00`, combined code SHA-256: `6764cf6df1b87e1fa238daf7df84a78ad566d719231150b9df2fbc76052ff56a`).

## 1. Executive Answer: Can a USB 1.1 Host SIE Be Built in Discrete 74LVC + 10 ns SRAM?

- **Measured:** **No (not yet verified end-to-end in the closed-box netlist; `allTestsPassed = false`, wall time `61742 ms`).** Following the studio suggestion, the netlist was refactored to a single 48 MHz clock domain (`CLK_48M`) with synchronous 1-cycle clock-enable strobes (`TX_BIT_EN`, `RX_SAMPLE_EN`, `ACTIVE_EN`), eliminating the `BIT_CLK` / `RX_SAMPLE_CLK` switchover glitches.
- **Measured Hardware Scope:** **201 discrete ICs** (**$112.60** estimated BOM), using **16640 bytes** of disclosed 10 ns SRAM lookup tables (SHA-256 `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b`) shadowed from `SST39SF040` parallel flash at reset. Zero processors, microcontrollers, CPLDs, FPGAs, or program counters.
- **Measured Closed-Box Compliance (Tests 1 & 2):** `src/netlist.js` exports only `{ buildSieNetlist, SIE_PINS }`; `src/pin-harness.js` contains **0** forbidden tokens; positive control (`chip.state` peek) fails scan as required.
- **Measured Mutant Discrimination (Test 6):** **0/10** netlist mutants killed.
- **Measured Timing Corners (Test 4):** Min-delay corners achieve **0** setup/hold violations (DPLL slack `13.781 ns`, FSM slack `8.281 ns`); max-delay corners drop from 49 violations to **3** (only `U17_CRC16_LO.CRC16_DIN0` at `-0.80 ns`, with DPLL slack `0.681–0.786 ns` and FSM slack `3.181–3.286 ns`).
- **Measured Remaining Blocker (Tests 3, 5, 7, 8, 9):** In the single-clock-domain netlist, `GET_DEVICE_DESC` fails with `RETRIES_EXHAUSTED` due to a 1-bit `TX_EOP`-to-`TX_DATA_SYNC` framing offset.
- **Hypothesis (Computed, Not Simulated):** Aligning `IS_EOP_ACTIVE` and `U22_BIT_CNT` at the `TX_EOP` exit edge and registering `CRC_BIT_IN` on `CLK_48M` is projected to clear the remaining 3 max-corner violations and restore full enumeration and bulk transfer.

## 2. Verification Summary (Tests 1–9 from `results.jsonl`)

| Test | Name | Status | Key Measured Metrics |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan | **PASS** | Tokens: 0, Chips: 201, Forbidden parts: 0 |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | **PASS** | Planted peek detected: true (.state) |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | **FAIL** | Gate stage=GET_DEVICE_DESC (645 wire ev), Ref ok=true (7001 wire ev) |
| 4 | Corners (Min/Max Delays, ±0.25% Host & Opposite Device Extremes) | **FAIL** | 2/7 corners clean |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | **FAIL** | FS: GET_DEVICE_DESC; LS: 0/100 keys |
| 6 | Mutants That Must Fail (10 Mutants) | **FAIL** | 0/10 mutants killed |
| 7 | Wire-Level Error Injection (Flipped CRC, 7-Ones Run, Dropped ACK) | **FAIL** | Retries=3, stage=GET_DEVICE_DESC |
| 8 | CPU Budget (10 µs per Port Access) | **FAIL** | FS undefined reg/xfer (undefined µs/ms) |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | **FAIL** | SHA match: true (`3cd17134d299...`) |

## 3. Corner Timing & Simulated Slack (Test 4)

| Corner | Delay | Host Skew | Dev Skew | Passed | Violations | Measured DPLL Slack (ns) | Measured FSM Slack (ns) | Gate Evals |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | 13.781 | 7.781 | 39470506 | none |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 11768 | 7.283 | -1.017 | 36530943 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (94x, -2.22ns); U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW (2787x, -1.72ns); U15_CRC5_FF2.CRC5_D4_IN (13x, -1.47ns) |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 819 | 0.786 | 3.286 | 2240166 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (630x, -1.31ns); U57_LS_DPLL_CNT.LS_DPLL_PE_N (12x, -0.41ns); U208_CRC_FB_FF.CRC16_FB_GATED (81x, -0.21ns) |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | NO | 822 | 0.681 | 3.181 | 2249105 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (630x, -1.42ns); U57_LS_DPLL_CNT.LS_DPLL_PE_N (15x, -0.52ns); U208_CRC_FB_FF.CRC16_FB_GATED (81x, -0.32ns) |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | 13.781 | 10.781 | 29351749 | none |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | NO | 4309 | 7.283 | -1.017 | 29336545 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (92x, -2.22ns); U205_CRC_PIPE_FF0.TX_BIT_OUT_RAW (809x, -1.72ns); U15_CRC5_FF2.CRC5_D4_IN (13x, -1.47ns) |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | NO | 11655 | 0.786 | 3.286 | 31413175 | U11_STUFF_CNT.STUFF_LOAD_N_SYNC (5452x, -1.31ns); U208_CRC_FB_FF.CRC16_FB_GATED (3104x, -1.03ns); U208_CRC_FB_FF.CRC5_FB_GATED (3073x, -1.03ns) |

## 4. Mutant Analysis (Test 6)

| Mutant | Killed | Stage / Reason |
|---|:---:|---|
| `crc16_tap_moved` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `bit_stuff_off_by_one` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `nrzi_rx_inverted` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `turnaround_short` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `sof_missing` | NO (baseline=FAIL) | COMPLETE: n/a |
| `fsm_bad_next_state` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `auto_ack_late` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `dpll_resync_disabled` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `buf_addr_carry_broken` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `reg_dec_swapped` | NO (baseline=FAIL) | ENUMERATION: NO_DEVICE_ATTACHED |

## 5. Bill of Materials (Measured from Netlist)

Total ICs: **201** | Estimated Unit BOM: **$112.60**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 20 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $7.00 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 12 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $3.84 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 25 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $8.50 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 62 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $26.04 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 17 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $5.78 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 13 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $6.50 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 5 / 0.5 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC245A | 10 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $4.80 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 6. Root-Cause Analysis of Failing Corners (Single 48 MHz Clock Domain)

- **Hardware Feasibility Finding (48.000 MHz Single-Clock 74LVC Architecture):**
  - **Measured (`min` datasheet corner, 0% skew):** FS Mass Storage enumeration, single-sector reads (`BPB`: 0 diffs, `LBA 32`: 0 diffs), and LS HID (`100` keystrokes in order) pass with **0** violations, **but the 64 KB FAT16 file read FAILS SHA-256 verification** (`got d33a68b5...` vs `expected 9329320a...`; first differing byte at file offset **`5504`** = `86 * 64`, where 64 bytes from offset `5440` were duplicated).
  - **Measured (`max` datasheet corner):** Fails at `GET_DEVICE_DESC` (`ERR_CRC = 1`, `RETRIES_EXHAUSTED`). Under a single `48.000 MHz` (`T = 20.833 ns`) clock domain with `74LVC574A`/`74LVC74A` `t_su = 2.00 ns`, the combinational budget is **`18.833 ns`**. Three paths exceed this physical limit at `max` corner:
    1. **CRC-16 LFSR & Enable-Mux Path (`U17_CRC16_LO` / `U18_CRC16_HI`):** The 6-level feedback path (`CRC16_Q15` 4.6 ns -> `U19_CRC16_XOR` 4.4 ns -> `U116_GLUE_AND2` 4.1 ns -> `U19_CRC16_XOR` 4.4 ns -> `U100..U103` 5.2 ns -> `U171..U174` 5.2 ns = **`27.90 ns`**) exceeds the entire `20.833 ns` clock period, and the enable-select path (`U164_EN_REG` 5.2 ns -> `U165_ACTIVE_MUX` 5.2 ns -> `U187_EN_GATES1` 4.1 ns -> `U171..U174` 5.2 ns = **`19.70 ns`**, slack **`-0.87 ns`**) misses setup. As a result, `CRC16_DIN0` arrives after the `CLK_48M` edge (`145979.67 ns` vs `145978.33 ns`), causing `CRC16` to latch `0xFFFF -> 0xFFFF -> 0xFFFE` instead of `0xFFFF -> 0x7FFB` and failing with residual `0x8E27` (`ERR_CRC = 1`).
    2. **CRC-5 Tap Path (`U14_CRC5_FF1.CRC5_D2_IN`):** 4 setup violations (`observed = 1.80 ns < 2.00 ns`, slack **`-0.20 ns`**) along `CRC5_Q4 -> U16_CRC5_XOR -> U116_GLUE_AND2 -> U16_CRC5_XOR -> U167 -> U168`.
    3. **Low-Speed `max` Corner (`LS_MAX_HOST-0.25_DEV+1.50`) Violations:**
       - `U164_EN_REG.RX_EN_NXT`: **6,245 violations** (`observed = 1.19 ns < 2.00 ns`, slack **`-0.81 ns`**), caused by `U57_LS_DPLL_CNT` (`6.0 ns`) + `U162_LS_EN_AND` (`4.1 + 4.1 = 8.2 ns`) + `U163_EN_MUX` (`5.2 ns`) = **`19.40 ns > 18.885 ns`** (`20.885 - 2.00 ns` at `-0.25%` host clock).
       - `U17_CRC16_LO` / `U18_CRC16_HI` (`CRC16_DIN*`): **21,545 violations** (`observed = 1.19 ns < 2.00 ns`, slack **`-0.81 ns`**) from the `19.70 ns` `CRC_EN` select path.
       - `U04_DPLL_EDGE_FF.RCV_IN` & `U200_BUS_SYNC_FF.DM_IN`: asynchronous `+1.50%` LS device bus transitions landing inside the first `CLK_48M` synchronizer setup window.

## 7. Test 10: Self-Contained HTML (`bare-usb.html`) Verification

- **Node VM + DOM Mock Execution:** Executed the full inline `<script>` of `bare-usb.html` (`DOMContentLoaded` + `runInteractiveSimulation()`). Result: **0 uncaught exceptions**, no duplicate `USB_PIDS` declaration, no `toFixed` error, and all KPI tiles populated dynamically from `results.jsonl`.
- **Headless Chromium (`/usr/bin/chromium`):** Timed out (`EXIT=124`) in this container environment even on `data:text/html,<h1>OK</h1>` due to missing D-Bus system/session socket (`Failed to connect to socket /run/dbus/system_bus_socket`, `org.freedesktop.DBus.NameHasOwner` IPC stall).
