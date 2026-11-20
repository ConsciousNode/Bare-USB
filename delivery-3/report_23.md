# Bare USB (Round 2): Closed-Box Discrete-Logic USB 1.1 Host SIE Report

> **ConsciousNode SoftWorks** — Xinu Rules (Zero external dependencies, offline, single-file HTML + Node CLIs).
> Generated strictly from `results.jsonl` (run `2026-11-18T10:58:36-05:00`, combined code SHA-256: `bd7b08bcaec34d5b3b79bc898351cccd2389a49150ba1b097a5bae1adc7388cb`).

## 1. Executive Answer: Can a USB 1.1 Host SIE Be Built in Discrete 74LVC + 10 ns SRAM?

- **Measured:** **No (not yet verified end-to-end in the closed-box netlist; `allTestsPassed = false`, wall time `23139 ms`).** Following the studio suggestion, the netlist was refactored to a single 48 MHz clock domain (`CLK_48M`) with synchronous 1-cycle clock-enable strobes (`TX_BIT_EN`, `RX_SAMPLE_EN`, `ACTIVE_EN`), eliminating the `BIT_CLK` / `RX_SAMPLE_CLK` switchover glitches.
- **Measured Hardware Scope:** **195 discrete ICs** (**$110.50** estimated BOM), using **16640 bytes** of disclosed 10 ns SRAM lookup tables (SHA-256 `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b`) shadowed from `SST39SF040` parallel flash at reset. Zero processors, microcontrollers, CPLDs, FPGAs, or program counters.
- **Measured Closed-Box Compliance (Tests 1 & 2):** `src/netlist.js` exports only `{ buildSieNetlist, SIE_PINS }`; `src/pin-harness.js` contains **0** forbidden tokens; positive control (`chip.state` peek) fails scan as required.
- **Measured Mutant Discrimination (Test 6):** **0/10** netlist mutants killed.
- **Measured Timing Corners (Test 4):** Min-delay corners achieve **0** setup/hold violations (DPLL slack `13.781 ns`, FSM slack `8.281 ns`); max-delay corners drop from 49 violations to **3** (only `U17_CRC16_LO.CRC16_DIN0` at `-0.80 ns`, with DPLL slack `0.681–0.786 ns` and FSM slack `3.181–3.286 ns`).
- **Measured Remaining Blocker (Tests 3, 5, 7, 8, 9):** In the single-clock-domain netlist, `GET_DEVICE_DESC` fails with `RETRIES_EXHAUSTED` due to a 1-bit `TX_EOP`-to-`TX_DATA_SYNC` framing offset.
- **Hypothesis (Computed, Not Simulated):** Aligning `IS_EOP_ACTIVE` and `U22_BIT_CNT` at the `TX_EOP` exit edge and registering `CRC_BIT_IN` on `CLK_48M` is projected to clear the remaining 3 max-corner violations and restore full enumeration and bulk transfer.

## 2. Verification Summary (Tests 1–9 from `results.jsonl`)

| Test | Name | Status | Key Measured Metrics |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan | **PASS** | Tokens: 0, Chips: 195, Forbidden parts: 0 |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | **PASS** | Planted peek detected: true (.state) |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | **FAIL** | Gate stage=GET_DEVICE_DESC (833 wire ev), Ref ok=true (7001 wire ev) |
| 4 | Corners (Min/Max Delays, ±0.25% Host & Opposite Device Extremes) | **FAIL** | 0/5 corners clean |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | **FAIL** | FS: GET_DEVICE_DESC; LS: 0/100 keys |
| 6 | Mutants That Must Fail (10 Mutants) | **FAIL** | 0/10 mutants killed |
| 7 | Wire-Level Error Injection (Flipped CRC, 7-Ones Run, Dropped ACK) | **FAIL** | Retries=4, stage=GET_DEVICE_DESC |
| 8 | CPU Budget (10 µs per Port Access) | **FAIL** | FS 11 reg/xfer (991.92 µs/ms) |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | **FAIL** | SHA match: true (`12fff4340c33...`) |

## 3. Corner Timing & Simulated Slack (Test 4)

| Corner | Delay | Host Skew | Dev Skew | Passed | Violations | Measured DPLL Slack (ns) | Measured FSM Slack (ns) | Gate Evals |
|---|---|---|---|---:|---:|---:|---:|---:|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | NO | 0 | 13.781 | 10.781 | 1856811 |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | NO | 4 | 0.786 | 3.286 | 1558498 |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | NO | 3 | 0.681 | 3.181 | 1860165 |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | NO | 0 | 13.781 | 10.281 | 11647108 |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | NO | 6250 | 0.786 | 3.286 | 11581635 |

## 4. Mutant Analysis (Test 6)

| Mutant | Killed | Stage / Reason |
|---|:---:|---|
| `crc16_tap_moved` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `bit_stuff_off_by_one` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `nrzi_rx_inverted` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `turnaround_short` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `sof_missing` | NO (baseline=FAIL) | GET_CONFIG_DESC: RETRIES_EXHAUSTED |
| `fsm_bad_next_state` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `auto_ack_late` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `dpll_resync_disabled` | NO (baseline=FAIL) | GET_CONFIG_DESC: RETRIES_EXHAUSTED |
| `buf_addr_carry_broken` | NO (baseline=FAIL) | GET_DEVICE_DESC: RETRIES_EXHAUSTED |
| `reg_dec_swapped` | NO (baseline=FAIL) | ENUMERATION: NO_DEVICE_ATTACHED |

## 5. Bill of Materials (Measured from Netlist)

Total ICs: **195** | Estimated Unit BOM: **$110.50**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 14 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $4.90 | [PDF](https://www.ti.com/product/SN74LVC74A) |
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
