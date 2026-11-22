/**
 * Bare USB — Discrete 74LVC / Fast SRAM / Parallel Flash / USB Transceiver Parts Library
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Provenance:
 * - Logic family & baseline delays copied/derived from attached `PARTS.md` and `TIMING-BUDGET.md`
 *   (Kehai Interim, 2026-11-18):
 *   - 74LVC245A transceiver: 6.3 ns max propagation delay at 3.3 V ± 0.3 V (-40..+85 °C)
 *   - 74LVC574A octal D flip-flop: 7.0 ns max clock-to-Q, 2.0 ns min setup
 *   - 74LVC157A quad 2:1 mux: 5.2 ns max at 3.3 V
 *   - IS61WV5128EDBLL-10TLI / IS61WV1288EEBLL-10TLI: 10.0 ns max access time
 *   - SST39SF040-55-4I-NHE parallel flash: 55.0 ns max access time (power-up shadow image)
 * - I/O port width and timing model copied from attached `IO-NOTES.md`:
 *   - 16-bit binary-encoded port bus, 1 level-triggered IRQ line, 3.3 V logic (5 V on backplane),
 *     10 µs per port access (~1.1M instructions/s).
 */

'use strict';

const FORBIDDEN_PART_PATTERNS = [
  /mcu/i, /cpu/i, /pic1/i, /avr/i, /atmega/i, /attiny/i, /stm32/i, /rp2040/i, /rp2350/i,
  /esp32/i, /8051/i, /z80/i, /6502/i, /68000/i, /arm/i, /riscv/i, /nios/i, /microblaze/i,
  /cpld/i, /fpga/i, /gal16/i, /gal22/i, /pal16/i, /ice40/i, /ecp5/i, /xc95/i, /max7000/i, /epm/i,
  /ft232/i, /ch375/i, /ch376/i, /max3421/i, /sl811/i, /isp116/i, /isp1362/i, /uhci/i, /ohci/i, /ehci/i
];

const PARTS_CATALOG = {
  '74LVC04A': {
    partNumber: 'SN74LVC04A',
    category: 'logic_gate',
    description: 'Hex Inverter (6x NOT gates)',
    manufacturer: 'Texas Instruments / Nexperia',
    package: 'SOIC-14 / TSSOP-14',
    unitPriceUsd: 0.32,
    tpdMinNs: 1.0,
    tpdMaxNs: 3.7,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC04A',
    datasheetCite: 'TI SN74LVC04A (SCAS281), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..3.7 ns',
    pins: ['1A','1Y','2A','2Y','3A','3Y','GND','4Y','4A','5Y','5A','6Y','6A','VCC']
  },
  '74LVC08A': {
    partNumber: 'SN74LVC08A',
    category: 'logic_gate',
    description: 'Quadruple 2-Input Positive-AND Gate',
    manufacturer: 'Texas Instruments / Nexperia',
    package: 'SOIC-14 / TSSOP-14',
    unitPriceUsd: 0.34,
    tpdMinNs: 1.0,
    tpdMaxNs: 4.1,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC08A',
    datasheetCite: 'TI SN74LVC08A (SCAS283), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..4.1 ns',
    pins: ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC']
  },
  '74LVC32A': {
    partNumber: 'SN74LVC32A',
    category: 'logic_gate',
    description: 'Quadruple 2-Input Positive-OR Gate',
    manufacturer: 'Texas Instruments / Nexperia',
    package: 'SOIC-14 / TSSOP-14',
    unitPriceUsd: 0.34,
    tpdMinNs: 1.0,
    tpdMaxNs: 3.8,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC32A',
    datasheetCite: 'TI SN74LVC32A (SCAS286), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..3.8 ns',
    pins: ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC']
  },
  '74LVC86A': {
    partNumber: 'SN74LVC86A',
    category: 'logic_gate',
    description: 'Quadruple 2-Input Exclusive-OR (XOR) Gate',
    manufacturer: 'Texas Instruments / Nexperia',
    package: 'SOIC-14 / TSSOP-14',
    unitPriceUsd: 0.36,
    tpdMinNs: 1.0,
    tpdMaxNs: 4.6,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC86A',
    datasheetCite: 'TI SN74LVC86A (SCAS288), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..4.6 ns',
    pins: ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC']
  },
  '74LVC157A': {
    // Provenance: PARTS.md & TIMING-BUDGET.md — 74LVC157A 2:1 mux: 5.2 ns max at 3.3 V (TI)
    partNumber: 'SN74LVC157A',
    category: 'multiplexer',
    description: 'Quadruple 2-Line to 1-Line Data Selector / Multiplexer',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-16 / TSSOP-16',
    unitPriceUsd: 0.42,
    tpdMinNs: 1.0,
    tpdMaxNs: 5.2,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC157A',
    datasheetCite: 'TI SN74LVC157A (SCAS292) & TIMING-BUDGET.md: tpd 1.0..5.2 ns at 3.3V',
    pins: ['S','1I0','1I1','1Y','2I0','2I1','2Y','GND','3Y','3I1','3I0','4Y','4I1','4I0','G_N','VCC']
  },
  '74LVC257A': {
    partNumber: 'SN74LVC257A',
    category: 'multiplexer',
    description: 'Quadruple 2-Line to 1-Line Data Selector / Multiplexer With 3-State Outputs',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-16 / TSSOP-16',
    unitPriceUsd: 0.44,
    tpdMinNs: 1.0,
    tpdMaxNs: 4.6,
    tpdSelMinNs: 1.0,
    tpdSelMaxNs: 6.4,
    tEnMinNs: 1.0,
    tEnMaxNs: 5.6,
    tDisMinNs: 1.0,
    tDisMaxNs: 4.3,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/lit/ds/scas294o/scas294o.pdf',
    datasheetCite: 'TI SN74LVC257A (SCAS294Q, Dec 2024, §5.7), VCC=3.3V±0.3V, -40..85°C: tpd(A/B->Y) 1.0..4.6 ns, tpd(S->Y) 1.0..6.4 ns, ten 1.0..5.6 ns, tdis 1.0..4.3 ns',
    pins: ['S','1I0','1I1','1Y','2I0','2I1','2Y','GND','3Y','3I1','3I0','4Y','4I1','4I0','OE_N','VCC']
  },
  '74LVC138A': {
    // Provenance: PARTS.md — 74LVC138 picks destination table / decodes address lines
    partNumber: 'SN74LVC138A',
    category: 'decoder',
    description: '3-Line to 8-Line Decoder / Demultiplexer',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-16 / TSSOP-16',
    unitPriceUsd: 0.40,
    tpdMinNs: 1.0,
    tpdMaxNs: 5.8,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC138A',
    datasheetCite: 'TI SN74LVC138A (SCAS291), VCC=3.3V±0.3V, -40..85°C: tpd 1.0..5.8 ns',
    pins: ['A','B','C','G2A_N','G2B_N','G1','Y7_N','GND','Y6_N','Y5_N','Y4_N','Y3_N','Y2_N','Y1_N','Y0_N','VCC']
  },
  '74LVC245A': {
    // Provenance: TIMING-BUDGET.md — 74LVC245A bus transceiver: 6.3 ns max propagation at 3.3 V
    partNumber: 'SN74LVC245A',
    category: 'transceiver',
    description: 'Octal Bus Transceiver With 3-State Outputs',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-20 / TSSOP-20',
    unitPriceUsd: 0.48,
    tpdMinNs: 1.5,
    tpdMaxNs: 6.3,
    tEnMinNs: 1.5,
    tEnMaxNs: 8.5,
    tDisMinNs: 1.5,
    tDisMaxNs: 7.5,
    hasBusHold: false,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC245A',
    datasheetCite: 'TI SN74LVC245A (SCAS218) & TIMING-BUDGET.md: tpd 1.5..6.3 ns, ten 1.5..8.5 ns, tdis 1.5..7.5 ns at 3.3V (no bus-hold)',
    pins: ['DIR','A1','A2','A3','A4','A5','A6','A7','A8','GND','B8','B7','B6','B5','B4','B3','B2','B1','OE_N','VCC']
  },
  '74LVCH245A': {
    partNumber: 'SN74LVCH245A',
    category: 'transceiver',
    description: 'Octal Bus Transceiver With 3-State Outputs and Bus-Hold Data Inputs',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-20 / TSSOP-20',
    unitPriceUsd: 0.54,
    tpdMinNs: 1.5,
    tpdMaxNs: 6.3,
    tEnMinNs: 1.5,
    tEnMaxNs: 8.5,
    tDisMinNs: 1.5,
    tDisMaxNs: 7.5,
    hasBusHold: true,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.ti.com/lit/ds/symlink/sn54lvch245a-sp.pdf',
    datasheetCite: 'TI SN74LVCH245A (SCES008Q, Sep 2018, §6.6 & §6.8), VCC=3.3V±0.3V, -40..85°C: tpd 1.5..6.3 ns, ten 1.5..8.5 ns, tdis 1.5..7.5 ns, bus-hold II(hold)=±75 µA @ 3V on A/B data pins',
    pins: ['DIR','A1','A2','A3','A4','A5','A6','A7','A8','GND','B8','B7','B6','B5','B4','B3','B2','B1','OE_N','VCC']
  },
  '74LVC574A': {
    // Provenance: TIMING-BUDGET.md — 74LVC574A D flip-flop: 7.0 ns max clock-to-Q; 2.0 ns setup
    partNumber: 'SN74LVC574A',
    category: 'flip_flop',
    description: 'Octal Edge-Triggered D-Type Flip-Flop With 3-State Outputs',
    manufacturer: 'Texas Instruments / Nexperia',
    package: 'SOIC-20 / TSSOP-20',
    unitPriceUsd: 0.50,
    tpdMinNs: 1.5,
    tpdMaxNs: 7.0,
    tEnMinNs: 1.5,
    tEnMaxNs: 8.0,
    tDisMinNs: 1.5,
    tDisMaxNs: 7.0,
    tSetupNs: 2.0,
    tHoldNs: 1.5,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC574A',
    datasheetCite: 'TI SN74LVC574A / Nexperia 74LVC574A & TIMING-BUDGET.md: clk->Q 1.5..7.0 ns, tsu 2.0 ns, th 1.5 ns',
    pins: ['OE_N','D0','D1','D2','D3','D4','D5','D6','D7','GND','CLK','Q7','Q6','Q5','Q4','Q3','Q2','Q1','Q0','VCC']
  },
  '74LVC74A': {
    partNumber: 'SN74LVC74A',
    category: 'flip_flop',
    description: 'Dual Positive-Edge-Triggered D-Type Flip-Flop With Clear and Preset',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-14 / TSSOP-14',
    unitPriceUsd: 0.35,
    tpdMinNs: 1.5,
    tpdMaxNs: 5.2,
    tSetupNs: 2.0,
    tHoldNs: 1.2,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC74A',
    datasheetCite: 'TI SN74LVC74A (SCAS287), VCC=3.3V±0.3V, -40..85°C: clk->Q 1.5..5.2 ns, tsu 2.0 ns, th 1.2 ns',
    pins: ['1CLR_N','1D','1CLK','1PRE_N','1Q','1Q_N','GND','2Q_N','2Q','2PRE_N','2CLK','2D','2CLR_N','VCC']
  },
  '74LVC161': {
    // Provenance: PARTS.md — Counter chips (74LVC161) step addresses and timers
    partNumber: '74LVC161PW',
    category: 'counter',
    description: 'Presettable Synchronous 4-Bit Binary Counter; Asynchronous Reset',
    manufacturer: 'Nexperia',
    package: 'TSSOP-16 / SOIC-16',
    unitPriceUsd: 0.46,
    tpdMinNs: 1.5,
    tpdMaxNs: 6.0,
    tpdTcMaxNs: 6.9,
    tSetupNs: 2.5,
    tHoldNs: 1.5,
    datasheetUrl: 'https://assets.nexperia.com/documents/data-sheet/74LVC161.pdf',
    datasheetCite: 'Nexperia 74LVC161 Rev.6, VCC=3.3V±0.3V, -40..85°C: CP->Q 1.5..6.0 ns, CP->TC 1.5..6.9 ns, tsu 2.5 ns, th 1.5 ns',
    pins: ['MR_N','CP','D0','D1','D2','D3','CEP','GND','PE_N','CET','Q3','Q2','Q1','Q0','TC','VCC']
  },
  '74LVC595A': {
    // Provenance: PARTS.md — 74LVC595/165 shift registers in I/O section
    partNumber: 'SN74LVC595A',
    category: 'shift_register',
    description: '8-Bit Serial-In, Parallel-Out Shift Register With 3-State Output Registers',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-16 / TSSOP-16',
    unitPriceUsd: 0.48,
    tpdMinNs: 1.5,
    tpdMaxNs: 6.8,
    tSetupNs: 2.0,
    tHoldNs: 1.5,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC595A',
    datasheetCite: 'TI SN74LVC595A (SCASE93), VCC=3.3V±0.3V, -40..85°C: CP->Q 1.5..6.8 ns, tsu 2.0 ns, th 1.5 ns',
    pins: ['QB','QC','QD','QE','QF','QG','QH','GND','QH_S','SRCLR_N','SRCLK','RCLK','OE_N','SER','QA','VCC']
  },
  '74LVC165A': {
    // Provenance: PARTS.md — 74LVC595/165 shift registers in I/O section
    partNumber: 'SN74LVC165A',
    category: 'shift_register',
    description: '8-Bit Parallel-Load Shift Register (Parallel-In, Serial-Out)',
    manufacturer: 'Texas Instruments',
    package: 'SOIC-16 / TSSOP-16',
    unitPriceUsd: 0.48,
    tpdMinNs: 1.5,
    tpdMaxNs: 6.4,
    tSetupNs: 2.0,
    tHoldNs: 1.5,
    datasheetUrl: 'https://www.ti.com/product/SN74LVC165A',
    datasheetCite: 'TI SN74LVC165A (SCAS295), VCC=3.3V±0.3V, -40..85°C: CLK->QH 1.5..6.4 ns, tsu 2.0 ns, th 1.5 ns',
    pins: ['SH_LD_N','CLK','E','F','G','H','QH_N','GND','QH','SER','A','B','C','D','CLK_INH','VCC']
  },
  'IS61WV5128EDBLL': {
    // Provenance: PARTS.md & TIMING-BUDGET.md — ISSI IS61WV5128EDBLL-10TLI (512Kx8, 10 ns) ~$3-6
    partNumber: 'IS61WV5128EDBLL-10TLI',
    category: 'sram',
    description: '512K x 8 High-Speed Asynchronous CMOS Static RAM (10 ns)',
    manufacturer: 'ISSI (Integrated Silicon Solution Inc.)',
    package: 'TSOP-II 44',
    unitPriceUsd: 4.50,
    tpdMinNs: 2.5,
    tpdMaxNs: 10.0,
    tDoeMinNs: 1.0,
    tDoeMaxNs: 4.5,
    tLzoeMinNs: 0.0,
    tHzoeMinNs: 0.0,
    tHzoeMaxNs: 4.0,
    tHzweMinNs: 0.0,
    tHzweMaxNs: 5.0,
    tLzweMinNs: 2.0,
    tSaMinNs: 0.0,
    tPweMinNs: 8.0,
    tSdMinNs: 6.0,
    tHdMinNs: 0.0,
    tSetupNs: 6.0,
    tHoldNs: 0.0,
    datasheetUrl: 'https://www.issi.com/WW/pdf/61-64WV5128EDBLL.pdf',
    datasheetCite: 'ISSI IS61WV5128EDBLL-10TLI (Rev. B, Nov 2011, pp. 5,7): common IO0..IO7, tAA=10.0 ns max, tDOE=4.5 ns max, tLZOE=0 ns min, tHZOE=4.0 ns max, tSA=0 ns, tPWE1=8.0 ns min, tSD=6.0 ns min, tHD=0 ns min',
    pins: ['A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15','A16','A17','A18','CE_N','OE_N','WE_N','IO0','IO1','IO2','IO3','IO4','IO5','IO6','IO7','VCC','GND']
  },
  'SST39SF040': {
    // Provenance: PARTS.md — SST39SF040 5V parallel flash (512Kx8, 55/70 ns, PLCC-32) for power-up table loader
    partNumber: 'SST39SF040-55-4I-NHE',
    category: 'flash_rom',
    description: '512K x 8 Multi-Purpose Parallel Flash (Power-Up Shadow Image Source)',
    manufacturer: 'Microchip Technology',
    package: 'PLCC-32 (Socketed)',
    unitPriceUsd: 2.85,
    tpdMinNs: 15.0,
    tpdMaxNs: 55.0,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.microchip.com/en-us/product/sst39sf040',
    datasheetCite: 'Microchip SST39SF040-55-4I-NHE & PARTS.md: tAA=55.0 ns max, shadowed into 10 ns SRAM at reset',
    pins: ['A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15','A16','A17','A18','CE_N','OE_N','WE_N','DQ0','DQ1','DQ2','DQ3','DQ4','DQ5','DQ6','DQ7','VDD','VSS']
  },
  'USB1T11A': {
    partNumber: 'USB1T11ABQX',
    category: 'analog_transceiver',
    description: 'Universal Serial Bus 1.1 Differential Line Transceiver (FS 12 Mb/s & LS 1.5 Mb/s, pure analog PHY, no logic/state)',
    manufacturer: 'onsemi / Fairchild',
    package: 'TSSOP-14 / MLP-16',
    unitPriceUsd: 0.78,
    tpdMinNs: 2.0,
    tpdMaxNs: 16.0,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.onsemi.com/pdf/datasheet/usb1t11a-d.pdf',
    datasheetCite: 'onsemi USB1T11A Rev.4: tpd(D+/D- to RCV)=16 ns max, tpd(VPO/VMO to D+/D-)=14 ns max at 3.3V',
    pins: ['VPO','VMO','RCV','VP','VM','OE_N','SPEED','SUSPND','DPLUS','DMINUS','VCC','GND']
  },
  'ECS-3953M-480': {
    partNumber: 'ECS-3953M-480-BN',
    category: 'oscillator',
    description: '48.000 MHz 3.3V HCMOS Crystal Clock Oscillator (±50 ppm / ±0.25% USB FS corner testable)',
    manufacturer: 'ECS Inc.',
    package: 'SMD 5x7mm 4-Pad',
    unitPriceUsd: 1.45,
    tpdMinNs: 0.5,
    tpdMaxNs: 2.0,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.mouser.com/datasheet/2/122/ecs_3951m_3953m-336860.pdf',
    datasheetCite: 'Standard 48.000 MHz 3.3V CMOS XO (4x oversampling of 12 Mb/s Full-Speed USB)',
    pins: ['EN','GND','CLK_OUT','VCC']
  },
  'RES-NET-USB': {
    partNumber: 'USB-TERM-PASSIVES',
    category: 'passive',
    description: '2x 27 Ω ±1% series termination resistors (D+/D-) + 2x 15 kΩ ±5% host downstream pull-down resistors (USB 2.0 §7.1.1)',
    manufacturer: 'Yageo / Vishay',
    package: '0603 SMD (x4)',
    unitPriceUsd: 0.08,
    tpdMinNs: 0.1,
    tpdMaxNs: 0.4,
    tSetupNs: 0,
    tHoldNs: 0,
    datasheetUrl: 'https://www.usb.org/document-library/usb-20-specification',
    datasheetCite: 'USB 2.0 Specification §7.1.1 & Table 7-7: Rpd = 15 kΩ ±5% on host D+/D-, Rs = 27 Ω series termination',
    pins: ['DP_XCVR','DM_XCVR','DP_BUS','DM_BUS','GND']
  }
};

module.exports = {
  PARTS_CATALOG,
  FORBIDDEN_PART_PATTERNS
};
