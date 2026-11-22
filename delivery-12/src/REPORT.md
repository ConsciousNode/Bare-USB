# Bare USB — Round 2 Closed-Netlist Verification Report

- **Generated from:** `results.jsonl` (`2026-11-22T01:39:53.525Z`)
- **Code SHA-256:** `48bf42139dff1be2532692f80b60754132b2ae17b98fad3424be09fc516ce51a`
- **Tables Digest:** `91a11e513e57c9ffb7558dd42f61370d3f8ad652d325900a56147bce921c158b (16640 B)`
- **Overall Verdict:** **9 / 9 Tests Passed** (`allTestsPassed=true`)

> **Architecture (Round 12):** Single `48.000 MHz` (`CLK_48M`, `T = 20.781 ns` @ `+0.25%` worst-case crystal) clock domain with synchronous CPU registers (`U44..U51` on `CLK_48M`), registered aligned `ACTIVE_EN`/`TX_BIT_EN`/`RX_SAMPLE_EN` strobes (`U164`, `U222..U223`, DPLL-bounded to `>= 3` clocks everywhere), registered dual-polarity 1-hot state flags (`U228..U238`), 3-stage pipelined TX serializer (`U243..U253`), 3-stage pipelined FSM address/LUT cone (`U241..U242`, `U216`), common-I/O packet buffer SRAMs (`U41`/`U42`, `IS61WV5128EDBLL-10TLI`, no separate `D` pins) driven by 3-state `SN74LVC257A` write muxes (`U106..U109`) with a non-overlapping 1-clock `/OE` bracket (`U201.2`, `U153.1`, `U277.3/4`, `U152.1`), `SN74LVCH245A` bus-hold transceivers (`U46`, `U47`, `U67`, `U68`), synchronous look-ahead SOF counter (`U26..U29`, `U220..U221`), and verified 2-flop bus-input synchronizers (`U04`, `U200 -> U219`).

## 1. Automated Verification Suite Summary (Tests 1–9)

| Test | Name | Result | Details |
|---:|---|:---:|---|
| 1 | Closed-Box Static Scan & Net-Driver Lint | PASS | 0 forbidden tokens/parts; net-driver lint: 0 undriven / 0 multi-driver (874 read nets, 32 tri-state buses); `undriven_net_mutant`: CAUGHT |
| 2 | Positive Control for Test 1 (Planted chip.state Peek) | PASS |  |
| 3 | Differential (Closed-Box Gate-Level SIE vs Reference SIE) | PASS | [corner=min] gate SHA=6c0abc256402…, ref SHA=6c0abc256402…, match=true |
| 4 | Corners, Static Timing, 3-State/Contention, Enable Spacing & Buffer SRAM Verification | PASS | STA min/typ/max=PASS (0/259); corners=7/7; spacing>=3=PASS; SRAM WR/3-state=PASS; 3-state pos-ctrls=3/3 CAUGHT; FP=PASS |
| 5 | Enumeration & Transfer (FS 64 KB FAT16 File & LS 100 Keystrokes) | PASS | 64KB: min=PASS, typ=PASS, max=PASS; 100-key: min=100/100, typ=100/100, max=100/100 |
| 6 | Mutants That Must Fail (12 Mutants incl. MCP Source & Endpoint Off-Enable) | PASS | [corner=min] 12/12 killed (baseline MSC=PASS, HID=PASS, skew=PASS) |
| 7 | Wire-Level Error Injection (Individual & Combined Faults at Min & Max) | PASS | [corner=min, typ & max] combined=3r; min=[corrupt_crc:1r, stuff_error:1r, drop_handshake:1r]; typ=[corrupt_crc:1r, stuff_error:1r, drop_handshake:1r]; max=[corrupt_crc:1r, stuff_error:1r, drop_handshake:1r] |
| 8 | CPU Budget (Accesses/Byte on 64 KB Read & Idle Keyboard Duty) | PASS | 64KB reg/B: min=0.6423, typ=0.6423, max=0.6423; idle KB=6% |
| 9 | Determinism (Fixed Seeds, Byte-Identical Traces) | PASS | [corner=min] deterministic; workload passes |

### 1b. Static Net-Driver Lint & Undriven-Net Closure

- **Baseline Netlist:** **PASS** — `874` read nets, `0` undriven nets, `0` multi-driver errors (`32` declared tri-state `BUS_D0..15` + `BD0..15` nets with exclusive `OE_N`).
- **Planted Mutant (`undriven_net_mutant`):** **CAUGHT** — detected undriven net(s): `SE0_PREV_N` (read by U150_TX_LAT_CLK_AND.2B).

## 2. Test 5 — Full-Speed 64 KB FAT16 File & Low-Speed 100 Keystrokes (`min`, `typ`, `max`)

| Corner | Workload | Pass | Setup/Hold Viol | Floating Reads | Contentions | Retries | Details |
|---|---|:---:|---:|---:|---:|---:|---|
| `min` | FS 64 KB FAT16 File | YES | 0 | 0 | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` |
| `min` | LS 100 HID Keystrokes | YES | 0 | 0 | 0 | 0 | Exact matches: **100 / 100** |
| `typ` | FS 64 KB FAT16 File | YES | 0 | 0 | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` |
| `typ` | LS 100 HID Keystrokes | YES | 0 | 0 | 0 | 0 | Exact matches: **100 / 100** |
| `max` | FS 64 KB FAT16 File | YES | 0 | 0 | 0 | 0 | SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` |
| `max` | LS 100 HID Keystrokes | YES | 0 | 0 | 0 | 0 | Exact matches: **100 / 100** |

## 3. Timing, 3-State/Contention & Corner Matrix (Test 4: `min`, `typ`, `max`)

Any dynamic corner with synchronous `setupHoldViolations > 0`, `floatingReads > 0`, or `contentions > 0` fails.

| Corner | Delay | Host Skew | Dev Skew | Pass | Sync Viol | Floating Reads | Contentions | Async Sync Events | DPLL Slack (ns) | FSM Slack (ns) |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| FS_MIN_HOST+0.25_DEV-0.25 | min | 0.25% | -0.25% | YES | 0 | 0 | 0 | 0 | +13.781 | +15.281 |
| FS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 0 | 0 | 8652 | +7.433 | +9.083 |
| FS_MAX_HOST-0.25_DEV+0.25 | max | -0.25% | 0.25% | YES | 0 | 0 | 0 | 0 | +1.086 | +2.886 |
| FS_MAX_HOST+0.25_DEV-0.25 | max | 0.25% | -0.25% | YES | 0 | 0 | 0 | 0 | +0.981 | +2.781 |
| LS_MIN_HOST+0.25_DEV-1.50 | min | 0.25% | -1.5% | YES | 0 | 0 | 0 | 0 | +13.781 | +15.281 |
| LS_TYP_HOST0_DEV0 | typ | 0% | 0% | YES | 0 | 0 | 0 | 3250 | +7.433 | +9.283 |
| LS_MAX_HOST-0.25_DEV+1.50 | max | -0.25% | 1.5% | YES | 0 | 0 | 0 | 0 | +1.086 | +2.886 |

### 3b. Full-Speed Clock-Skew Sweep (`min` corner, `0%` host skew, `±1.00%` in `0.05%` steps)

- **Points Passed:** **41 / 41**
- **Within USB `±0.50%` Envelope (`-0.50% .. +0.50%`):** **PASS (21 / 21)**
- **Failing Skew Points:** None

### 3c. Strict Per-Path Static Timing Analysis (`CLK_48M -> CLK_48M`, `T = 20.781 ns` @ `48.120 MHz`)

| Corner | Pass | Failing / Total Endpoints | 1-Cycle Fails | MCP Fails | Worst 1-Cycle Slack (ns) | Declared MCPs | Worst Arrival (ns) | Worst Slack (ns) |
|---|:---:|---:|---:|---:|---:|---:|---:|---:|
| `min` | YES | 0 / 259 | 0 | 0 | +13.781 | 0 | 13.5 | +13.781 |
| `typ` | YES | 0 / 259 | 0 | 0 | +7.231 | 30 | 33.35 | +7.231 |
| `max` | YES | 0 / 259 | 0 | 0 | +0.181 | 64 | 53.2 | +0.181 |

**Strict Dynamic MCP Source & Endpoint Proof:**
- **Unmutated Baseline (`min` / `max`):** **PASS** — `0` source off-enable changes and `0` endpoint off-enable captures.
- **Planted Source & Endpoint Mutants:** `mcp_source_changes_off_enable` **CAUGHT** (`190` off-enable changes); `mcp_endpoint_captures_off_enable` **CAUGHT** (`2142` off-enable captures).

### 3d. Dynamic Enable-Spacing Proof (`N = 3` Bounded by DPLL) & Mutant

| Run | Min `RX_SAMPLE_EN` (clks) | Min `ACTIVE_EN` (clks) | Min `TX_BIT_EN` (clks) | Result |
|---|---:|---:|---:|:---:|
| Baseline `min` (`-0.25%/+0.25%`) | 3 | 3 | 4 | PASS |
| Baseline `typ` (`-0.25%/+0.25%`) | 3 | 3 | 4 | PASS |
| Baseline `max` (`-0.25%/+0.25%`) | 3 | 3 | 4 | PASS |
| Mutant `enable_spacing_too_short` (`max`) | 2 | — | — | CAUGHT (<3) |

### 3e. Round 12 Common-I/O Buffer SRAM Write Path, Bus-Hold & 3-State Turnaround Margins

**Datasheet Models (cited from primary vendor PDFs):**
- **ISSI `IS61WV5128EDBLL-10TLI`** ([datasheet](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf), Rev. B, pp. 5, 7): common bidirectional `IO0..IO7` (no `D0..D7` pins), `t_AA = 10.0 ns max`, `t_DOE = 4.5 ns max`, `t_LZOE = 0.0 ns min`, `t_HZOE = 4.0 ns max`, `t_SA = 0.0 ns min`, `t_PWE1 = 8.0 ns min`, `t_SD = 6.0 ns min`, `t_HD = 0.0 ns min`.
- **TI `SN74LVC257A`** ([datasheet](https://www.ti.com/lit/ds/scas294o/scas294o.pdf), SCAS294Q, §5.7, `3.3 V ± 0.3 V`): `t_pd(A/B->Y) = 1.0..4.6 ns`, `t_pd(S->Y) = 1.0..6.4 ns`, `t_en = 1.0..5.6 ns`, `t_dis = 1.0..4.3 ns`.
- **TI `SN74LVCH245A`** ([datasheet](https://www.ti.com/lit/ds/symlink/sn54lvch245a-sp.pdf), SCES008Q, §6.6 & §6.8, `3.3 V ± 0.3 V`): `t_pd = 1.5..6.3 ns`, `t_en = 1.5..8.5 ns`, `t_dis = 1.5..7.5 ns`, active bus-hold latches (`I_I(hold) = ±75 µA` @ `3 V`) on all A/B data pins.

**Design Choice — Non-Overlapping 1-Clock `/OE` Bracket (0 New Chip Positions):** Driving `U106..U109.OE_N` directly from `BUF_OE_N` via `U152` section 1 (without a guard band) causes `2.0 / 5.0 / 8.0 ns` of bus contention on `BD0..BD15` when exiting a write window, because `U41`/`U42` begins driving at `t_LZOE = 0.0 ns` while `U106..U109` is still disabling behind `U152` (`t_pd(04A) + t_dis(257A)`). Reusing spare flip-flop `U201.2` (`CPU_WR_DAT_D1`) and spare gates `U153.1`, `U277.3`, `U277.4` brackets the 1-clock write pulse (`CPU_WR_PULSE | RX_WE_PULSE`) inside a wider `BUF_OE_N = CPU_WR_WIN | RX_WE_WIN` window, giving `>= +10.2 ns` turnaround margin and `0` contention across `min`, `typ`, and `max`.

| Corner | Writes | `t_SA` (`>=0`) | `t_PWE1` (`>=8`) | `t_SD` (`>=6`) | `t_HD` (`>=0`) | SRAM HZ -> '257 EN (`>=0`) | '257 DIS -> SRAM EN (`>=0`) | Floating Reads | Contentions | Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| `min` | 90 | 23.886 ns | 20.886 ns | 20.386 ns | 19.386 ns | +22.386 ns | +18.386 ns | 0 | 0 | YES |
| `typ` | 90 | 26.036 ns | 20.886 ns | 18.986 ns | 16.986 ns | +23.286 ns | +14.336 ns | 0 | 0 | YES |
| `max` | 90 | 28.186 ns | 20.886 ns | 17.586 ns | 14.586 ns | +24.086 ns | +10.286 ns | 0 | 0 | YES |

### 3f. Round 12 3-State & Contention Positive Controls (`max` Corner)

| Positive Control | Fault Planted | Caught | Measured Violation / Margin |
|---|---|:---:|---|
| `keeper_removed` | `U46_BUS_XCVR_LO` reverted to plain `74LVC245A` | YES | `384` floating reads (first: `PORT_D0 @ 10186.667 ns (U46_BUS_XCVR_LO.A1)`) |
| `two_drivers_on_bus` | `U63_RD_CSR_LO.OE_N` tied to `GND` on `BUS_D0..7` | YES | `616` contentions, max overlap `61.5 ns` (first: `BUS_D0 U46_BUS_XCVR_LO.B1=0 vs U63_RD_CSR_LO.B1=0`) |
| `mux257_enable_delayed` | `U106..U109` `OE_N` driven by `BUF_OE_N` via 1 inverter (no 1-clk bracket) | YES | `720` contentions on `BD0..15`, max overlap `8 ns`, `'257 DIS -> SRAM EN = -8.000 ns` |

### 3g. Declared False Paths & Dynamic Proof

- **Dynamic Invariant (`!(RX_WE_PULSE && S_TX_DATA) && !(RX_WE_PULSE && TX_LAT_EN)`):** `0` overlaps at `min`, `0` at `typ`, `0` at `max` (**PASS**).
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

### 4b. Wire-Level Error Injection — Individual & Combined Faults (Test 7: `min`, `typ`, `max`)

| Corner | Fault(s) | Pass | Retries Executed | Violations | Stage / Reason |
|---|---|:---:|---:|---:|---|
| `min` | `corrupt_crc` | YES | 1 | 0 | COMPLETE |
| `min` | `stuff_error` | YES | 1 | 0 | COMPLETE |
| `min` | `drop_handshake` | YES | 1 | 0 | COMPLETE |
| `typ` | `corrupt_crc` | YES | 1 | 0 | COMPLETE |
| `typ` | `stuff_error` | YES | 1 | 0 | COMPLETE |
| `typ` | `drop_handshake` | YES | 1 | 0 | COMPLETE |
| `max` | `corrupt_crc` | YES | 1 | 0 | COMPLETE |
| `max` | `stuff_error` | YES | 1 | 0 | COMPLETE |
| `max` | `drop_handshake` | YES | 1 | 0 | COMPLETE |
| `min` | `corrupt_crc` + `stuff_error` + `drop_handshake` (combined) | YES | 3 | 0 | COMPLETE |

## 5. CPU Budget (Test 8 — `min`, `typ`, `max`)

| Corner | Metric | Result | Details |
|---|---|---:|---|
| `min` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B) |
| `min` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs) |
| `typ` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B) |
| `typ` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs) |
| `max` | FS 64 KB Read — Reg Accesses / Byte | 0.6423 reg/B | 42,093 reg accesses / 65,536 B (6.423 µs/B) |
| `max` | Idle LS Keyboard Duty (1 poll / 1 ms frame) | 6% | 60 µs / 1 ms frame (6 reg/frame, 5/5 NAKs) |

## 6. Bill of Materials (Measured from Netlist)

Total ICs: **260** | Estimated Unit BOM: **$135.18**

| Part | Qty | Package | tpd (min..max ns) | tsu / th (ns) | Ext USD | Datasheet |
|---|---:|---|---:|---:|---:|---|
| ECS-3953M-480-BN | 1 | SMD 5x7mm 4-Pad | 0.5..2 | 0 / 0 | $1.45 | [PDF](https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf) |
| 74LVC161PW | 22 | TSSOP-16 / SOIC-16 | 1.5..6 | 2.5 / 1.5 | $10.12 | [PDF](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) |
| SN74LVC74A | 48 | SOIC-14 / TSSOP-14 | 1.5..5.2 | 2 / 1.2 | $16.80 | [PDF](https://www.ti.com/product/SN74LVC74A) |
| SN74LVC04A | 12 | SOIC-14 / TSSOP-14 | 1..3.7 | 0 / 0 | $3.84 | [PDF](https://www.ti.com/product/SN74LVC04A) |
| SN74LVC08A | 31 | SOIC-14 / TSSOP-14 | 1..4.1 | 0 / 0 | $10.54 | [PDF](https://www.ti.com/product/SN74LVC08A) |
| SN74LVC157A | 72 | SOIC-16 / TSSOP-16 | 1..5.2 | 0 / 0 | $30.24 | [PDF](https://www.ti.com/product/SN74LVC157A) |
| USB1T11ABQX | 1 | TSSOP-14 / MLP-16 | 2..16 | 0 / 0 | $0.78 | [PDF](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) |
| USB-TERM-PASSIVES | 1 | 0603 SMD (x4) | 0.1..0.4 | 0 / 0 | $0.08 | [PDF](https://www.usb.org/document-library/usb-20-specification) |
| SN74LVC86A | 6 | SOIC-14 / TSSOP-14 | 1..4.6 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/product/SN74LVC86A) |
| SN74LVC32A | 23 | SOIC-14 / TSSOP-14 | 1..3.8 | 0 / 0 | $7.82 | [PDF](https://www.ti.com/product/SN74LVC32A) |
| SN74LVC574A | 18 | SOIC-20 / TSSOP-20 | 1.5..7 | 2 / 1.5 | $9.00 | [PDF](https://www.ti.com/product/SN74LVC574A) |
| SN74LVC138A | 3 | SOIC-16 / TSSOP-16 | 1..5.8 | 0 / 0 | $1.20 | [PDF](https://www.ti.com/product/SN74LVC138A) |
| IS61WV5128EDBLL-10TLI | 7 | TSOP-II 44 | 2.5..10 | 6 / 0 | $31.50 | [PDF](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) |
| SST39SF040-55-4I-NHE | 1 | PLCC-32 (Socketed) | 15..55 | 0 / 0 | $2.85 | [PDF](https://www.microchip.com/en-us/product/sst39sf040) |
| SN74LVC257A | 4 | SOIC-16 / TSSOP-16 | 1..4.6 | 0 / 0 | $1.76 | [PDF](https://www.ti.com/lit/ds/scas294o/scas294o.pdf) |
| SN74LVCH245A | 4 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $2.16 | [PDF](https://www.ti.com/lit/ds/symlink/sn54lvch245a-sp.pdf) |
| SN74LVC245A | 6 | SOIC-20 / TSSOP-20 | 1.5..6.3 | 0 / 0 | $2.88 | [PDF](https://www.ti.com/product/SN74LVC245A) |

## 7. Round 12 Closure Summary & Delta vs Round 11

- **Overall Verdict:** **9 / 9 Tests Passed** (`allTestsPassed=true`) across `min`, `typ`, and `max` corners with `0` synchronous setup/hold violations, `0` floating-net reads, and `0` bus contentions.
- **Tests Whose Result Moved vs Round 11:** **None** — all 9 earlier tests remain `PASS` across `min`, `typ`, and `max` (with `typ` newly added to Tests 5, 7, and 8). Total IC count stayed unchanged (`0` new chip positions), while estimated unit BOM rose by `$0.32` (4× `74LVC157A` → `SN74LVC257A` at `+$0.02` each, 4× `74LVC245A` → `SN74LVCH245A` at `+$0.06` each).
