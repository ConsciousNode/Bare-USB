# Bare USB: Full-Speed & Low-Speed USB 1.1 Host SIE in Discrete 74LVC Logic and 10 ns SRAM

**ConsciousNode SoftWorks — Engineering Verification Report (2026-11-18T09:01:58-05:00)**

## 1. Executive Answer & Hypothesis vs. Measured Findings

- **Hypothesis:** A USB 1.1 Host Serial Interface Engine (SIE) supporting Full-Speed (12 Mb/s) and Low-Speed (1.5 Mb/s) can be constructed without any processor, microcontroller, CPLD, FPGA, or instruction sequencer by combining a 3.3 V differential analog transceiver ([onsemi USB1T11A](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf)), discrete 74LVC counters/shift-registers/flip-flops/gates ([TI 74LVC Logic Family](https://www.ti.com/lit/ug/scbd152b/scbd152b.pdf)), and 10 ns asynchronous static RAM ([ISSI IS61WV5128EDBLL-10TLI](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf)) shadowed at power-up from parallel flash ([Microchip SST39SF040](https://www.microchip.com/en-us/product/sst39sf040)), while meeting the Triton card computer's 10 µs per port access CPU budget (`IO-NOTES.md`).
- **Measured:** **Yes.** Across all 8 automated verification suites (`allTestsPassed = true`, total runtime `72143 ms`), the **48-chip** discrete gate-level netlist (**$44.31** estimated BOM) passes differential verification against a behavioral reference SIE, meets worst-case min/max timing delays over −40 °C to +85 °C at 3.3 V ± 0.3 V with **0** setup/hold violations, enumerates both a Full-Speed Mass Storage Bulk-Only device and a Low-Speed HID Boot Keyboard, reads back a 64 KB (`65536`-byte) FAT16 file with matching SHA-256 (`9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`), receives **100/100** scripted keystrokes in order, kills **5/5** netlist mutants, detects and retries injected CRC16, bit-stuffing, and dropped-handshake errors, and consumes **35.31** register accesses/transfer (**875.66 µs** CPU time per 1 ms frame) during sustained Full-Speed Bulk-IN transfers.

## 2. What Was Built & Architectural Disclosure

### 2.1 Hardware Partitioning (Hardware SIE vs. Ternary CPU Driver)
Because the Triton CPU executes ~1.1M instructions/s and each 16-bit `IN`/`OUT` port access costs **10 µs** (`IO-NOTES.md`), the CPU cannot bit-bang 12 Mb/s Full-Speed (83.33 ns/bit) or 1.5 Mb/s Low-Speed (666.67 ns/bit), nor can it turn around an `ACK` handshake in software within the [USB 2.0 Specification](https://www.usb.org/document-library/usb-20-specification) §7.1.18 window (2 to 6.5 bit times = 166.7 ns to 541.7 ns at Full-Speed). Therefore, the discrete-logic SIE handles in hardware:
1. **4x Oversampling DPLL & Clock Recovery (`U01..U05`):** A 48.000 MHz CMOS crystal oscillator (`ECS-3953M-480-BN`) drives a [Nexperia 74LVC161](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) prescaler (`÷4` = 12 MHz for Full-Speed, `÷32` = 1.5 MHz for Low-Speed selected by [TI SN74LVC157A](https://www.ti.com/product/SN74LVC157A)) and a dual-flip-flop edge detector ([TI SN74LVC74A](https://www.ti.com/product/SN74LVC74A) + [TI SN74LVC86A](https://www.ti.com/product/SN74LVC86A)) that synchronizes phase on every incoming NRZI transition.
2. **Analog Line Transceiver & Termination (`U06..U07`):** An [onsemi USB1T11A](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) 3.3 V differential USB 1.1 transceiver paired with 27 Ω ±1% series termination resistors and 15 kΩ ±5% host downstream pull-down resistors (`RES-NET-USB`).
3. **NRZI Encode/Decode & Bit-Stuffing/Unstuffing (`U08..U12`):** `74LVC74A` state flip-flops, `74LVC86A` XOR gates, and [TI SN74LVC04A](https://www.ti.com/product/SN74LVC04A) inverters perform NRZI encoding/decoding (`0` = transition, `1` = hold). A `74LVC161` synchronous counter (`U11_STUFF_CNT`) and [TI SN74LVC08A](https://www.ti.com/product/SN74LVC08A) AND comparator (`U12_STUFF_AND`) count 6 consecutive `1` bits (`Q2=1, Q1=1, Q0=0`), inhibiting the transmit shift register ([TI SN74LVC165A](https://www.ti.com/product/SN74LVC165A)) for 1 bit clock to stuff a `0` on transmit, or stripping the stuffed `0` (and flagging `ERR_STUFF` if `1`) on receive.
4. **Token CRC-5 & Data CRC-16 LFSRs (`U13..U19`):** Three `74LVC74A` dual flip-flops + `74LVC86A` XOR implement $G(x) = x^5 + x^2 + 1$ for Token/SOF packets. Two [TI SN74LVC574A](https://www.ti.com/product/SN74LVC574A) octal flip-flops (`U17..U18`) + `74LVC86A` XOR (`U19`) implement $G(x) = x^{16} + x^{15} + x^2 + 1$ for `DATA0`/`DATA1` packets.
5. **18-Bit Bus Turnaround Timer & EOP Detector (`U23..U25`):** Two cascaded `74LVC161` counters and a `74LVC08A` comparator declare `ERR_TIMEOUT` if no device SYNC arrives within 18 bit times ([USB 2.0 Specification](https://www.usb.org/document-library/usb-20-specification) §7.1.19.1).
6. **Autonomous 1.000 ms SOF / Low-Speed Keep-Alive Generator (`U26..U33`):** Four cascaded `74LVC161` counters divide the 48 MHz clock by 48,000 (1.000 ms) to trigger either a Full-Speed `SOF` packet with the 11-bit frame number from `U31..U33` or a Low-Speed 2-bit `SE0` keep-alive strobe without CPU intervention.
7. **Shadowed 10 ns SRAM Next-State Lookup Table (`U34..U38` — Disclosed per `SPEC.md`):** Following `PARTS.md` Decisions 3 & 4, the SIE transaction state machine has **no program counter and no instruction sequencing**. It is a Moore/Mealy state register (`U34_FSM_STATE`, `74LVC574A`) whose next state and hardware control strobes (including hardware `AUTO_ACK` within 4 bit times of a valid `IN` `DATA0`/`DATA1` EOP) are looked up combinationally in two 10 ns [ISSI IS61WV5128EDBLL-10TLI](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) SRAMs (`U35..U36`, 4,096 × 16-bit) and one PID check table SRAM (`U37`, 256 × 8-bit), shadowed at power-up from `U38_BOOT_FLASH` ([Microchip SST39SF040](https://www.microchip.com/en-us/product/sst39sf040)). The table contents are generated deterministically by `scripts/generate-tables.js` (`sha256: e5585c597eacd3efa26b990ca831d3533c1db90a18fa3ed45e90dabbea31e86e`).
8. **Dual-Bank 16-Bit Packet Buffer SRAM & Backplane Port Interface (`U39..U48`):** Two `IS61WV5128EDBLL-10TLI` SRAMs (`U41..U42`, even/odd bytes), two `74LVC161` word-address counters (`U39..U40`), a [TI SN74LVC138A](https://www.ti.com/product/SN74LVC138A) port decoder (`U43`), `74LVC574A` command/target latches (`U44..U45`), and two [TI SN74LVC245A](https://www.ti.com/product/SN74LVC245A) 8-bit bus transceivers (`U46..U47`) expose a 16-bit word-wide register file so the CPU transfers 2 bytes per 10 µs `IN`/`OUT` instruction.

### 2.2 CPU Register Interface (16-Bit I/O Ports `0x00..0x06`)

| Port | Name | Direction | Bit Fields & Description |
| :--- | :--- | :--- | :--- |
| `0x00` | `SIE_CSR` | Read (`STATUS`) | `[0]` BUSY, `[1]` DONE, `[2]` ERR_TIMEOUT, `[3]` ERR_CRC, `[4]` ERR_STUFF, `[5]` ATTACHED, `[6]` LOW_SPEED, `[7]` SOF_SENT, `[11:8]` LAST_PID, `[12]` TOGGLE_OK, `[13]` IRQ_PENDING, `[14]` RESET_BUSY, `[15]` SPEED_MODE |
| `0x00` | `SIE_CSR` | Write (`CMD`) | `[3:0]` TOKEN_PID, `[4]` DATA_TOGGLE (`0`=DATA0, `1`=DATA1), `[5]` AUTO_ACK, `[6]` AUTO_SOF_EN, `[7]` SPEED_SEL (`0`=FS, `1`=LS), `[8]` START_XFER, `[9]` BUS_RESET, `[10]` CLR_IRQ, `[11]` BUF_RST, `[12]` IRQ_EN |
| `0x01` | `SIE_TARGET` | Read / Write | `[6:0]` 7-bit USB Device Address (`0..127`), `[10:7]` 4-bit Endpoint Number (`0..15`) |
| `0x02` | `SIE_LEN` | Read / Write | Write: `TX_LEN` (`0..64` bytes, resets `BUF_PTR` to 0); Read: `RX_LEN` (`0..64` bytes received in last `IN` packet) |
| `0x03` | `SIE_DATA16` | Read / Write | 16-bit little-endian auto-incrementing Buffer SRAM data port (`U41` low byte, `U42` high byte; advances `U39..U40` word counter on each `IN`/`OUT`) |
| `0x04` | `SIE_FRAME` | Read | `[10:0]` 11-bit hardware USB frame number (`0..2047`) from `U31..U33` |
| `0x05` | `SIE_BUF_PTR` | Read / Write | `[7:0]` Buffer SRAM 16-bit word address pointer (`0..255`) |
| `0x06` | `SIE_DIAG` | Read | `[7:0]` Hardware CRC error counter, `[15:8]` Hardware Bit-Stuff & Turnaround Timeout error counter |

## 3. Measured Bill of Materials (BOM) & Chip Count

- **Measured:** Total discrete component count = **48 chips/networks**, total estimated BOM cost = **$44.31 USD** (at quantity 1–10 pricing).

| Part Type | Manufacturer Part Number | Category | Qty | Unit ($) | Ext ($) | Min Delay (ns) | Max Delay (ns) | Setup / Hold (ns) | Datasheet Source |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `ECS-3953M-480` | [ECS-3953M-480-BN](https://www.ti.com/lit/ug/scbd152b/scbd152b.pdf) | oscillator | 1 | $1.45 | $1.45 | 0.5 | 2.0 | 0.0 / 0.0 | Standard 48.000 MHz 3.3V CMOS XO (4x oversampling of 12 Mb/s Full-Speed USB) |
| `74LVC161` | [74LVC161PW](https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf) | counter | 15 | $0.46 | $6.90 | 1.5 | 6.0 | 2.5 / 1.5 | Nexperia 74LVC161 Rev.6, VCC=3.3V±0.3V, -40..85°C: CP->Q 1.5..6.0 ns, CP->TC 1.5..6.9 ns, tsu 2.5 ns, th 1.5 ns |
| `74LVC157A` | [SN74LVC157A](https://www.ti.com/product/SN74LVC157A) | multiplexer | 1 | $0.42 | $0.42 | 1.0 | 5.2 | 0.0 / 0.0 | TI SN74LVC157A (SCAS292) & TIMING-BUDGET.md: tpd 1.0..5.2 ns at 3.3V |
| `74LVC74A` | [SN74LVC74A](https://www.ti.com/product/SN74LVC74A) | flip_flop | 5 | $0.35 | $1.75 | 1.5 | 5.2 | 2.0 / 1.2 | TI SN74LVC74A (SCAS287), VCC=3.3V±0.3V, -40..85°C: clk->Q 1.5..5.2 ns, tsu 2.0 ns, th 1.2 ns |
| `USB1T11A` | [USB1T11ABQX](https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf) | analog_transceiver | 1 | $0.78 | $0.78 | 2.0 | 16.0 | 0.0 / 0.0 | onsemi USB1T11A Rev.4: tpd(D+/D- to RCV)=16 ns max, tpd(VPO/VMO to D+/D-)=14 ns max at 3.3V |
| `RES-NET-USB` | [USB-TERM-PASSIVES](https://www.usb.org/document-library/usb-20-specification) | passive | 1 | $0.08 | $0.08 | 0.1 | 0.4 | 0.0 / 0.0 | USB 2.0 Specification §7.1.1 & Table 7-7: Rpd = 15 kΩ ±5% on host D+/D-, Rs = 27 Ω series termination |
| `74LVC86A` | [SN74LVC86A](https://www.ti.com/product/SN74LVC86A) | logic_gate | 3 | $0.36 | $1.08 | 1.0 | 4.6 | 0.0 / 0.0 | TI SN74LVC86A (SCAS288), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..4.6 ns |
| `74LVC04A` | [SN74LVC04A](https://www.ti.com/product/SN74LVC04A) | logic_gate | 1 | $0.32 | $0.32 | 1.0 | 3.7 | 0.0 / 0.0 | TI SN74LVC04A (SCAS281), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..3.7 ns |
| `74LVC08A` | [SN74LVC08A](https://www.ti.com/product/SN74LVC08A) | logic_gate | 3 | $0.34 | $1.02 | 1.0 | 4.1 | 0.0 / 0.0 | TI SN74LVC08A (SCAS283), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..4.1 ns |
| `74LVC574A` | [SN74LVC574A](https://www.ti.com/product/SN74LVC574A) | flip_flop | 5 | $0.50 | $2.50 | 1.5 | 7.0 | 2.0 / 1.5 | TI SN74LVC574A / Nexperia 74LVC574A & TIMING-BUDGET.md: clk->Q 1.5..7.0 ns, tsu 2.0 ns, th 1.5 ns |
| `74LVC165A` | [SN74LVC165A](https://www.ti.com/product/SN74LVC165A) | shift_register | 1 | $0.48 | $0.48 | 1.5 | 6.4 | 2.0 / 1.5 | TI SN74LVC165A (SCAS295), VCC=3.3V±0.3V, -40..85°C: CLK->QH 1.5..6.4 ns, tsu 2.0 ns, th 1.5 ns |
| `74LVC595A` | [SN74LVC595A](https://www.ti.com/product/SN74LVC595A) | shift_register | 1 | $0.48 | $0.48 | 1.5 | 6.8 | 2.0 / 1.5 | TI SN74LVC595A (SCASE93), VCC=3.3V±0.3V, -40..85°C: CP->Q 1.5..6.8 ns, tsu 2.0 ns, th 1.5 ns |
| `IS61WV5128EDBLL` | [IS61WV5128EDBLL-10TLI](https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf) | sram | 5 | $4.50 | $22.50 | 2.5 | 10.0 | 5.0 / 0.5 | ISSI IS61WV5128EDBLL-10TLI & TIMING-BUDGET.md: tAA=10.0 ns max (2.5 ns min), tSD=5.0 ns, tSA=0 ns |
| `SST39SF040` | [SST39SF040-55-4I-NHE](https://www.microchip.com/en-us/product/sst39sf040) | flash_rom | 1 | $2.85 | $2.85 | 15.0 | 55.0 | 0.0 / 0.0 | Microchip SST39SF040-55-4I-NHE & PARTS.md: tAA=55.0 ns max, shadowed into 10 ns SRAM at reset |
| `74LVC138A` | [SN74LVC138A](https://www.ti.com/product/SN74LVC138A) | decoder | 1 | $0.40 | $0.40 | 1.0 | 5.8 | 0.0 / 0.0 | TI SN74LVC138A (SCAS291), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..5.8 ns |
| `74LVC245A` | [SN74LVC245A](https://www.ti.com/product/SN74LVC245A) | transceiver | 2 | $0.48 | $0.96 | 1.5 | 6.3 | 0.0 / 0.0 | TI SN74LVC245A (SCAS218) & TIMING-BUDGET.md: tpd 1.5..6.3 ns at 3.3V |
| `74LVC32A` | [SN74LVC32A](https://www.ti.com/product/SN74LVC32A) | logic_gate | 1 | $0.34 | $0.34 | 1.0 | 3.8 | 0.0 / 0.0 | TI SN74LVC32A (SCAS286), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..3.8 ns |
| **Total** | **Discrete USB 1.1 Host SIE** | **All Allowed Parts** | **48** | — | **$44.31** | — | — | — | Zero MCUs / CPLDs / FPGAs |

## 4. Measured Worst-Case Critical-Path Timing Margins

- **Measured:** Across all critical paths at worst-case −40 °C to +85 °C datasheet maximum delays (`TIMING-BUDGET.md`) and with the 48.000 MHz clock running at the fast +0.25% Full-Speed tolerance limit ($T_{48\text{MHz,min}} = 20.781\text{ ns}$, $T_{12\text{MHz,min}} = 83.124\text{ ns}$), every path maintains positive timing slack (tightest 48 MHz state-table lookup margin = **+1.781 ns**; tightest 12 MHz bit-domain static margin = **+58.824 ns**).

| Critical Path | Clock Domain | Clock Budget (ns) | Component Delay Breakdown | Min Delay (ns) | Max Delay (ns) | Worst-Case Margin (ns) |
| :--- | :--- | ---: | :--- | ---: | ---: | ---: |
| 48 MHz DPLL Oversample & Edge Resync (U06 USB1T11A -> U04 74LVC74A -> U09 74LVC86A -> U10 74LVC04A -> U05 74LVC161 setup) | 48 MHz Oversample Clock | 20.781 | 74LVC74A clk->Q (5.2 ns) + 74LVC86A (4.6 ns) + 74LVC04A (3.7 ns) + 74LVC161 setup (2.5 ns) | 6.00 | 16.00 | **+4.781** |
| SIE Next-State Lookup in Shadowed 10 ns SRAM (U34 74LVC574A -> U35/U36 IS61WV5128EDBLL -> U34 74LVC574A setup) | 48 MHz / 12 MHz SIE State Clock | 20.781 | 74LVC574A clk->Q (7.0 ns) + IS61WV5128EDBLL tAA (10.0 ns) + 74LVC574A setup (2.0 ns) | 6.00 | 19.00 | **+1.781** |
| CRC-16 Bit-Serial LFSR Feedback (U18 74LVC574A -> U19 74LVC86A x2 -> U17 74LVC574A setup) | 12 MHz FS Bit Clock | 83.124 | 74LVC574A clk->Q (7.0 ns) + 2x 74LVC86A (9.2 ns) + 74LVC574A setup (2.0 ns) | 5.50 | 18.20 | **+64.924** |
| Bit-Stuffing 6-Ones Detector to SerDes Clock Inhibit (U11 74LVC161 -> U10 74LVC04A -> U12 74LVC08A x2 -> U20 74LVC165A setup) | 12 MHz FS Bit Clock | 83.124 | 74LVC161 CP->Q (6.0 ns) + 74LVC04A (3.7 ns) + 2x 74LVC08A (8.2 ns) + 74LVC165A setup (2.0 ns) | 6.50 | 19.90 | **+63.224** |
| NRZI Receive Decode -> Bit-Unstuff -> CRC-16 Setup (U08 74LVC74A -> U09 74LVC86A -> U10 74LVC04A -> U19 74LVC86A -> U17 74LVC574A) | 12 MHz FS Bit Clock | 83.124 | 74LVC74A (5.2 ns) + 74LVC86A (4.6 ns) + 74LVC04A (3.7 ns) + 74LVC86A (4.6 ns) + 74LVC574A setup (2.0 ns) | 6.50 | 20.10 | **+63.024** |
| Buffer SRAM Byte Read/Write & Address Step (U39 74LVC161 -> U41 IS61WV5128EDBLL -> U46 74LVC245A -> U20 74LVC165A load) | 12 MHz FS Byte Strobe (83.33 ns) | 83.124 | 74LVC161 (6.0 ns) + IS61WV5128EDBLL (10.0 ns) + 74LVC245A (6.3 ns) + 74LVC165A setup (2.0 ns) | 7.50 | 24.30 | **+58.824** |

## 5. Verification Suite Results (Tests 1–8)

| Test # | Test Name | Status | Key Measured Metric from `results.jsonl` |
| ---: | :--- | :--- | :--- |
| **1** | Differential (Gate-Level SIE vs Reference SIE) | **PASS** | FS Pkt SHA `3d05920d61cd…` & LS Pkt SHA `1104f4773b3e…` match Reference SIE |
| **2** | Corners (Min/Max Gate Delays & USB Spec Clock Tolerance Limits) | **PASS** | 5 delay/clock corners, 0 violations, min dynamic bit-clock setup slack +32.26 ns |
| **3** | Enumeration (FS Mass-Storage 64 KB File & LS HID Keyboard 100 Keystrokes) | **PASS** | FS 64 KB (65536 B) SHA `9329320ac869…` verified; LS HID 100/100 keys in order |
| **4** | Positive Controls That Must Fail (5 Netlist Mutants) | **PASS** | Killed 5/5 mutants; surviving mutants: 0 |
| **5** | Error Injection (Corrupted CRC16, Bit-Stuff Error, Dropped Handshake -> Retry & Recover) | **PASS** | Detected 1 CRC + 2 Stuff/Timeout errors, 3 retries, payload verified |
| **6** | CPU Budget (Register Accesses per Transfer & CPU Time per 1 ms Frame at 10 µs/access) | **PASS** | FS 64 KB: 35.31 accesses/xfer (875.66 µs/frame); LS HID: 7.85 accesses/xfer (354 µs/frame) |
| **7** | Static Scan (No Forbidden Parts & Simulator Module Isolation) | **PASS** | Scanned 48 chips (0 forbidden) & 3 core modules (0 forbidden imports) |
| **8** | Determinism (Fixed Seeds Produce Byte-Identical Wire & Register Traces) | **PASS** | Two runs (334348 B trace) identical: SHA-256 `f8d1694449087cf3…` |

### 5.1 Test 1 — Differential Verification Details
- **Measured:** Gate-Level SIE and Behavioral Reference SIE produced identical wire packet traces and identical 16-bit register read/write sequences across both Full-Speed Mass Storage (`255` packets, `2419` register operations) and Low-Speed HID Keyboard (`141` packets, `326` register operations).

| Workload | Packets | Register Ops | Gate-Level Packet SHA-256 | Reference Packet SHA-256 | Gate-Level Register SHA-256 | Reference Register SHA-256 |
| :--- | ---: | ---: | :--- | :--- | :--- | :--- |
| Full-Speed Mass Storage | 255 | 2419 | `3d05920d61cd27cb2b3215307dd3c55ff00b953f85bdf25eb553e71e44c47849` | `3d05920d61cd27cb2b3215307dd3c55ff00b953f85bdf25eb553e71e44c47849` | `d02747262e4e0cdbefec7811a59e74ef5af03bec8b4d6b0cda5513a411338693` | `d02747262e4e0cdbefec7811a59e74ef5af03bec8b4d6b0cda5513a411338693` |
| Low-Speed HID Keyboard | 141 | 326 | `1104f4773b3e1a3bc515e27fef5a847a387e5cabdf223e2ba070a65801db0fad` | `1104f4773b3e1a3bc515e27fef5a847a387e5cabdf223e2ba070a65801db0fad` | `d7c441274e6006167374a71dbe66fb9df1e71912c1698247c72b2828ca667d0b` | `d7c441274e6006167374a71dbe66fb9df1e71912c1698247c72b2828ca667d0b` |

### 5.2 Test 2 — Timing & Clock Tolerance Corners
- **Measured:** Every corner executed with **0** setup or hold violations across [USB 2.0 Specification](https://www.usb.org/document-library/usb-20-specification) §7.1.11 clock tolerance limits (±0.25% Full-Speed, ±1.50% Low-Speed).

| Corner Label | Gate Delay Corner | Host Clock Skew (%) | Device Clock Skew (%) | Gate Evaluations | Pin Events | Violations | Min Dynamic Bit-Clock Setup Slack (ns) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `FS_MIN_DELAY_FAST_CLK` | `min` | +0.25% | -0.25% | 2,299,664 | 1,123,706 | 0 | +46.56 |
| `FS_MAX_DELAY_SLOW_CLK` | `max` | -0.25% | +0.25% | 2,299,664 | 1,123,706 | 0 | +32.47 |
| `FS_MAX_DELAY_FAST_CLK` | `max` | +0.25% | -0.25% | 2,299,664 | 1,123,706 | 0 | +32.26 |
| `LS_MIN_DELAY_FAST_CLK` | `min` | +0.25% | -1.50% | 436,221 | 218,532 | 0 | +337.50 |
| `LS_MAX_DELAY_SLOW_CLK` | `max` | -0.25% | +1.50% | 436,221 | 218,532 | 0 | +324.87 |

### 5.3 Test 3 — Device Enumeration, 64 KB FAT16 File Read & 100 Scripted Keystrokes
- **Measured (Full-Speed Mass Storage Bulk-Only Device, [USB MSC BOT 1.0](https://www.usb.org/sites/default/files/usbmassbulk_10.pdf)):** Enumerated at address 1 (`VID=0x435A, PID=0x0002`), parsed FAT16 Boot Sector (LBA 0) and Root Directory (LBA 16), read `TEST64K.BIN` (**65,536 bytes** across 128 sectors, LBA 32..159) over **3,651** USB packets (**69,461,858** gate evaluations, **33,884,376** pin transitions), and verified SHA-256 `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29` === `9329320ac86986882d4b1d39dd6ae88c1375a178637ff1773567089782c74e29`.
- **Measured (Low-Speed HID Boot Keyboard, [USB HID 1.11](https://www.usb.org/sites/default/files/hid1_11.pdf)):** Enumerated at address 1 (`VID=0x435A, PID=0x0001`), configured Boot Protocol, and received **100/100** 8-byte boot keyboard reports in exact order over **380** packets (**1,464,506** gate evaluations, **740,879** pin transitions).

### 5.4 Test 4 — Positive Controls That Must Fail (Netlist Mutants)
- **Measured:** All **5/5** netlist mutants caused the gate-level hardware simulation to fail. Surviving mutants: **None (0)**.

| Mutant ID | Gate-Level Netlist Mutation | Workload Succeeded? | Mutant Killed? | Failure Stage | Failure Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `crc16_tap_moved` | U19_CRC16_XOR pin 2A rewired from CRC16_Q1 (x^2 tap) to CRC16_Q3 (x^4 tap) | false | **YES (Killed)** | `ENUMERATION` | `RETRIES_EXHAUSTED` |
| `bit_stuff_off_by_one` | U12_STUFF_AND comparator rewired to trigger after 5 consecutive ones (0101) instead of 6 (0110) | false | **YES (Killed)** | `SCSI_READ_SHORT` | `RETRIES_EXHAUSTED` |
| `nrzi_rx_inverted` | U10_NRZI_INV receive inverter output bypassed/inverted so decoded NRZI bits are inverted | false | **YES (Killed)** | `ENUMERATION` | `RETRIES_EXHAUSTED` |
| `turnaround_short` | U25_TURN_EOP_AND timeout comparator wired to TURN_Q1 (2 bit times) instead of 18 bit times | false | **YES (Killed)** | `ENUMERATION` | `RETRIES_EXHAUSTED` |
| `sof_missing` | U30_SOF_GATE pin 1B tied to GND so 1 ms SOF / keep-alive frames are never transmitted | false | **YES (Killed)** | `HID_KEYSTROKES` | `RETRIES_EXHAUSTED` |

### 5.5 Test 5 — Error Injection & Spec Retry Recovery
- **Measured:** Injected `corrupt_crc (DATA1)`, `stuff_error (DATA0)`, `drop_handshake (ACK)` on the D+/D− bus. The gate-level SIE hardware flagged **1** CRC16 error and **2** bit-stuffing / turnaround-timeout errors in `SIE_DIAG`/`SIE_CSR`; the host driver executed **3** USB 2.0 spec retries and recovered the payload with verified SHA-256 `12dfc94c22fbc186e37ff533112edeaa076f8b5f73b3ceb556e032605c173a8c`.

### 5.6 Test 6 — Measured CPU Budget (at 10 µs per 16-Bit Port Access)
- **Measured:** Because `SIE_DATA16` (`PORT 0x03`) transfers 16 bits (2 bytes) per `IN`/`OUT` instruction and the SIE handles 1 ms SOFs, CRC5/CRC16, NRZI, bit-stuffing, and `AUTO_ACK` in discrete hardware, a 64-byte Bulk-IN packet requires **36 register accesses (360 µs CPU time)** and an 8-byte Low-Speed HID report requires **8 register accesses (80 µs CPU time)**:

| Workload / Operation | Total Transfers | Total Reg Reads | Total Reg Writes | Total Reg Accesses | Reg Accesses / Transfer | Total CPU Time (µs) | Total Sim Time (ms) | CPU Time per 1 ms Frame (µs/ms) | CPU Frame Utilization |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FS Mass-Storage Enumeration + 64 KB FAT16 Read | 1,073 | 35,531 | 2,356 | 37,887 | **35.31** | 378,870 µs | 432.667 ms | **875.66 µs/ms** | 87.57% |
| LS HID Keyboard Enumeration + 100 Keystrokes | 118 | 662 | 264 | 926 | **7.85** | 9,260 µs | 26.158 ms | **354.00 µs/ms** | 35.40% |

### 5.7 Test 7 & Test 8 — Static Scan & Determinism
- **Measured (Test 7 Static Scan):** Scanned **48** netlist chip instances (`forbiddenPartsFound = []`) and core simulator modules `src/parts-library.js`, `src/simulator.js`, `src/netlist.js` (`forbiddenImportsFound = []`).
- **Measured (Test 8 Determinism):** Two independent runs with fixed seeds (`seedMsc = 20261118`, `seedHid = 42`) produced byte-identical `334,348`-byte traces (`run1Sha256 = f8d1694449087cf393f3528805a3d363c39bc4bd9187f925d8f5cc19c845c583`, `run2Sha256 = f8d1694449087cf393f3528805a3d363c39bc4bd9187f925d8f5cc19c845c583`).

## 6. Code & Lookup Table Provenance Hashes (from `results.jsonl`)

| File / Artifact | SHA-256 Digest |
| :--- | :--- |
| `src/parts-library.js` | `1cadb7116e98f4a687b79b7c7aa07b58d48eea4a5cd5dfbf199d27d546adb011` |
| `src/simulator.js` | `9839ba132d67b7a8f0167ebe3d7f81744acd6e058bffb289888ec45ca7f5de8e` |
| `src/netlist.js` | `0dcb34be46514dcf73333c8e701350af8751c314e42e949ae2aba473c78dc7e0` |
| `src/line-model.js` | `43a2b2627da4cd9e357174bada7f4ddf0af8a9459fe8d72b86070cf4aa6172ab` |
| `src/ref-sie.js` | `70fb68c4a0b3f0d87765e33a4c3ebdc3b2d1fb31a2e8ccf3d2487b0f0608fdb7` |
| `src/devices.js` | `0e76a28790c0d47f66835c905988f7ad650e3d3aed03dcac897c3b7ae0c4b78b` |
| `src/driver.js` | `1775bdc5a1cb0921c94680eca45389f4419a2e5f4bef2ad54f361e873ef99de5` |
| `scripts/generate-tables.js` | `ec73174cfc45cdaba70631be95125c03bbccb70161172f4bf88827a2d2251e89` |
| `scripts/run-tests.js` | `e9d356873f182ca186ddd4b6b8b02b3db52361f694adacb214cc0d48be4b4378` |
| **Shadowed SRAM Lookup Tables (`fsmLut` + `pidCheckLut`, 8448 B)** | `e5585c597eacd3efa26b990ca831d3533c1db90a18fa3ed45e90dabbea31e86e` |
| **Combined Source Bundle Digest** | `6c47152ce71ece8496e6d25ac87567175597229558914a269fa3cc960dd78653` |
