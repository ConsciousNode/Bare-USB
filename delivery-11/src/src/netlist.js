/**
 * Bare USB — Closed-Box Discrete-Logic USB 1.1 Host SIE Netlist (`src/netlist.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Single Clock Domain Architecture (`CLK_48M`, 48.000 MHz):
 * - Every flip-flop, shift register, and counter in the SIE is clocked from `CLK_48M`.
 * - 1-cycle-wide synchronous clock-enable strobes (`TX_BIT_EN`, `RX_SAMPLE_EN`, `ACTIVE_EN`)
 *   gate state updates via `74LVC157A` hold muxes and `74LVC161` `CEP`/`CET` pins.
 * - Eliminates clock-muxing glitches and `BIT_CLK` <-> `RX_SAMPLE_CLK` switchover hazards.
 *
 * Exports ONLY `{ buildSieNetlist, SIE_PINS }` per Round 2 Rule 1 & Test 1.
 *
 * Provenance:
 * - Parts & delays from `PARTS.md` and `TIMING-BUDGET.md` (Kehai Interim, 2026-11-18).
 * - Port bus & IRQ model from `IO-NOTES.md`.
 */

'use strict';

const {
  generateFsmLut,
  generatePidCheckLut,
  generateTxHeaderLut,
  generateSerializerAndCrcCheckLut
} = require('../scripts/generate-tables');

const SIE_PINS = {
  inputs: [
    'CLK_48M', 'RST_N',
    'IO_CS_N', 'IO_RD_N', 'IO_WR_N',
    'PORT_A0', 'PORT_A1', 'PORT_A2'
  ],
  bidir: [
    'PORT_D0', 'PORT_D1', 'PORT_D2', 'PORT_D3',
    'PORT_D4', 'PORT_D5', 'PORT_D6', 'PORT_D7',
    'PORT_D8', 'PORT_D9', 'PORT_D10', 'PORT_D11',
    'PORT_D12', 'PORT_D13', 'PORT_D14', 'PORT_D15'
  ],
  outputs: ['IRQ'],
  bus: ['DP_PIN', 'DM_PIN']
};

function buildSieNetlist(sim, options = {}) {
  const mutant = options.mutant || null;
  const fsmMutantAddr = (mutant === 'fsm_bad_next_state' && options.fsmMutantAddr !== undefined)
    ? options.fsmMutantAddr
    : null;

  const fsmLut = generateFsmLut(fsmMutantAddr);
  const pidLut = generatePidCheckLut();
  const hdrLut = generateTxHeaderLut();
  const serLut = generateSerializerAndCrcCheckLut();

  const fsmLoInit = new Uint8Array(4096);
  const fsmHiInit = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    fsmLoInit[i] = fsmLut[i] & 0xFF;
    fsmHiInit[i] = (fsmLut[i] >> 8) & 0xFF;
  }

  // =========================================================================
  // 1. 48 MHz Single-Clock Prescaler, 4x Oversampling DPLL & Enable Strobes
  // =========================================================================
  sim.addChip('U01_XO48M', 'ECS-3953M-480', '48.000 MHz 3.3V Crystal Oscillator Reference', {
    EN: 'VCC', GND: 'GND', CLK_OUT: 'CLK_48M_REF', VCC: 'VCC'
  });
  sim.addChip('U02_CLK_DIV_FS_LS', '74LVC161', 'FS (÷4) / LS Prescaler Counter on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'VCC', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'DIV_Q0', Q1: 'DIV_Q1', Q2: 'DIV_Q2', Q3: 'DIV_Q3', TC: 'DIV_TC'
  });
  sim.addChip('U56_LS_DIV', '74LVC161', 'LS (÷32) Bit Clock Counter Stage on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'DIV_TC', CET: 'DIV_TC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'LS_DIV_Q0', Q1: 'LS_DIV_Q1', Q2: 'LS_DIV_Q2', Q3: 'LS_DIV_Q3', TC: 'LS_DIV_TC'
  });
  sim.addChip('U04_DPLL_EDGE_FF', '74LVC74A', '4x Oversampling Receive DPLL Edge Detector Flip-Flops', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'RCV_IN', '1Q': 'RCV_D1', '1Q_N': 'RCV_D1_N',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'RCV_D1', '2Q': 'RCV_D2', '2Q_N': 'RCV_D2_N'
  });
  const dpllGatePin = (mutant === 'dpll_resync_disabled') ? 'GND' : 'VCC';
  sim.addChip('U05_DPLL_PHASE_CNT', '74LVC161', '4x Oversampling DPLL Phase Counter (presets to 1 on NRZI edge)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'DPLL_SYNC_N', CEP: 'VCC', CET: 'VCC',
    D0: 'GND', D1: 'VCC', D2: 'GND', D3: 'GND',
    Q0: 'DPLL_Q0', Q1: 'DPLL_Q1', Q2: 'DPLL_Q2', Q3: 'DPLL_Q3', TC: 'DPLL_TC'
  });
  sim.addChip('U57_LS_DPLL_CNT', '74LVC161', 'Low-Speed DPLL Phase Counter (presets to 12 on edge, reloads 8 on TC)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'LS_DPLL_PE_N', CEP: 'DPLL_DIV4_TICK', CET: 'VCC',
    D0: 'VCC', D1: 'VCC', D2: 'DPLL_EDGE_REG_N', D3: 'DPLL_EDGE_REG',
    Q0: 'DPLL_LS_Q0', Q1: 'DPLL_LS_Q1', Q2: 'DPLL_LS_Q2', Q3: 'DPLL_LS_Q3', TC: 'DPLL_LS_TC'
  });

  // Registered 1-cycle-wide Clock-Enable Strobes (TX_BIT_EN & RX_SAMPLE_EN)
  sim.addChip('U160_EN_INV', '74LVC04A', 'DPLL & LS Enable Strobe Inverters', {
    '1A': 'DIV_Q1', '1Y': 'DIV_Q1_N',
    '2A': 'DPLL_Q1', '2Y': 'DPLL_Q1_N',
    '3A': 'DPLL_LS_TC', '3Y': 'DPLL_LS_TC_N',
    '4A': 'DPLL_SYNC_N', '4Y': 'DPLL_SYNC',
    '5A': 'GND', '5Y': 'UNUSED_CRC16_INV',
    '6A': 'DPLL_Q0', '6Y': 'DPLL_Q0_N'
  });
  sim.addChip('U161_EN_AND', '74LVC08A', 'Pre-Register 1-Cycle Bit/Sample Enable Decoders', {
    '1A': 'DIV_Q0', '1B': 'DIV_Q1', '1Y': 'TX_FS_EN_NXT',
    '2A': 'DIV_TC', '2B': 'LS_DIV_Q0', '2Y': 'TX_LS_EN_NXT',
    '3A': 'DPLL_Q0', '3B': 'DPLL_Q1', '3Y': 'RX_FS_EN_NXT',
    '4A': 'DPLL_Q0', '4B': 'DPLL_Q1', '4Y': 'DPLL_DIV4_TICK'
  });
  sim.addChip('U162_LS_EN_AND', '74LVC08A', 'LS DPLL Sample Enable Decoder', {
    '1A': 'DPLL_LS_TC', '1B': 'VCC', '1Y': 'RX_LS_EN_NXT_UNUSED',
    '2A': 'DPLL_EDGE_REG_N', '2B': 'DPLL_LS_TC_N', '2Y': 'LS_DPLL_PE_N',
    '3A': 'CRC_EN', '3B': 'CRC16_INIT_N', '3Y': 'CRC16_EN_GATED',
    '4A': 'CRC_EN', '4B': 'CRC5_INIT_RAW_N', '4Y': 'CRC5_EN_GATED'
  });
  sim.addChip('U163_EN_MUX', '74LVC157A', 'FS/LS Enable Strobe Selector', {
    S: 'SPEED_LS', G_N: 'GND',
    '1I0': 'TX_FS_EN_NXT', '1I1': 'TX_LS_EN_NXT', '1Y': 'TX_EN_NXT',
    '2I0': 'RX_FS_EN_NXT', '2I1': 'DPLL_LS_TC', '2Y': 'RX_EN_NXT',
    '3I0': 'RX_EN_NXT', '3I1': 'TX_EN_NXT', '3Y': 'ACTIVE_EN_NXT_RAW',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_EM4'
  });
  sim.addChip('U164_EN_REG', '74LVC74A', 'Stage-1 Registered TX_BIT_EN_PRE & RX_SAMPLE_EN_PRE Strobes', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'TX_EN_NXT', '1Q': 'TX_BIT_EN_PRE',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'RX_EN_NXT', '2Q': 'RX_SAMPLE_EN_PRE'
  });
  sim.addChip('U223_EN_D1_FF', '74LVC74A', 'Stage-2 Aligned Registered TX_BIT_EN & RX_SAMPLE_EN Strobes', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'TX_BIT_EN_PRE', '1Q': 'TX_BIT_EN',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'RX_SAMPLE_EN_PRE_G', '2Q': 'RX_SAMPLE_EN'
  });

  sim.addChip('U03_SPEED_MUX', '74LVC157A', 'FS/LS Polarity & Active Clock-Enable Selector Mux', {
    S: 'SPEED_LS', G_N: 'GND',
    '1I0': 'VCC', '1I1': 'VCC', '1Y': 'UNUSED_SM1',
    '2I0': 'VCC', '2I1': 'GND', '2Y': 'XCVR_SPEED_PIN',
    '3I0': 'DP_SYNC', '3I1': 'DM_SYNC', '3Y': 'BUS_J_SENSE',
    '4I0': 'DM_SYNC', '4I1': 'DP_SYNC', '4Y': 'BUS_K_SENSE'
  });
  sim.addChip('U61_CLK_MUX', '74LVC157A', 'NRZI Differential Polarity & EOP-J Mux', {
    S: 'SPEED_LS', G_N: 'GND',
    '1I0': 'VCC', '1I1': 'VCC', '1Y': 'UNUSED_CM1',
    '2I0': 'VCC', '2I1': 'GND', '2Y': 'EOP_J_VPO',
    '3I0': 'NRZI_TX_Q', '3I1': 'NRZI_TX_Q_N', '3Y': 'TX_VPO_DATA',
    '4I0': 'NRZI_TX_Q_N', '4I1': 'NRZI_TX_Q', '4Y': 'TX_VMO_DATA'
  });
  sim.addChip('U222_ACT_EN_FF', '74LVC74A', 'Registered 1-Cycle ACTIVE_EN Strobe (breaks U215/U164 -> U62 -> endpoints)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'ACTIVE_EN_NXT', '1Q': 'ACTIVE_EN',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'NRZI_RX_BIT_RAW', '2Q': 'NRZI_RX_BIT'
  });
  sim.addChip('U62_TX_RX_EN_MUX', '74LVC157A', 'Active Clock-Enable & CRC/Stuff Input Mux', {
    S: 'ACTIVE_CLK_SEL', G_N: 'GND',
    '1I0': 'RX_SAMPLE_EN_PRE_G', '1I1': 'TX_BIT_EN_PRE', '1Y': 'ACTIVE_EN_NXT',
    '2I0': 'NRZI_RX_BIT', '2I1': 'TX_BIT_OUT_RAW', '2Y': 'CRC_BIT_IN',
    '3I0': 'NRZI_RX_BIT', '3I1': 'TX_BIT_GATED', '3Y': 'STUFF_BIT_IN',
    '4I0': 'SER_BIT_OUT', '4I1': 'TX_HDR_BIT', '4Y': 'TX_BIT_HDR_OR_SER'
  });
  sim.addChip('U71_EOP_MUX', '74LVC157A', 'EOP / Bus-Reset Differential Drive Selector', {
    S: 'EOP_OR_RESET', G_N: 'GND',
    '1I0': 'TX_VPO_DATA', '1I1': 'EOP_VPO_GATED', '1Y': 'TX_VPO',
    '2I0': 'TX_VMO_DATA', '2I1': 'EOP_VMO_GATED', '2Y': 'TX_VMO',
    '3I0': 'TX_BIT_OUT_RAW', '3I1': 'VCC', '3Y': 'TX_BIT_STEP1',
    '4I0': 'TX_BIT_OUT_RAW', '4I1': 'VCC', '4Y': 'TX_BIT_EOP_GATED'
  });

  // =========================================================================
  // 2. USB Differential Analog Transceiver & Termination Network (U06..U07)
  // =========================================================================
  sim.addChip('U06_USB_XCVR', 'USB1T11A', 'USB 1.1 Differential Line Transceiver (FS/LS)', {
    VPO: 'TX_VPO', VMO: 'TX_VMO', RCV: 'RCV_IN', VP: 'DP_IN', VM: 'DM_IN',
    OE_N: 'TX_OE_PIN_N', SPEED: 'XCVR_SPEED_PIN', SUSPND: 'GND',
    DPLUS: 'DP_XCVR', DMINUS: 'DM_XCVR', VCC: 'VCC', GND: 'GND'
  });
  sim.addChip('U07_USB_TERM', 'RES-NET-USB', '27 Ω Series Terminations & 15 kΩ Host Pull-Downs', {
    DP_XCVR: 'DP_XCVR', DM_XCVR: 'DM_XCVR', DP_BUS: 'DP_PIN', DM_BUS: 'DM_PIN', GND: 'GND'
  });

  // =========================================================================
  // 3. NRZI Encoder/Decoder & Bit-Stuffing/Unstuffing (U08..U12, U148, U165)
  // =========================================================================
  sim.addChip('U165_NRZI_HOLD_MUX', '74LVC157A', 'NRZI TX/RX Clock-Enable Hold Muxes on CLK_48M', {
    S: 'TX_BIT_EN', G_N: 'GND',
    '1I0': 'NRZI_TX_Q', '1I1': 'NRZI_TX_NEXT', '1Y': 'NRZI_TX_D_EN',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_NH2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_NH3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_NH4'
  });
  sim.addChip('U166_NRZI_RX_EN_MUX', '74LVC157A', 'NRZI RX Hold Mux (RX_SAMPLE_EN) & EOP-Pipe Hold Mux', {
    S: 'RX_SAMPLE_EN', G_N: 'GND',
    '1I0': 'GND', '1I1': 'GND', '1Y': 'UNUSED_NRM1',
    '2I0': 'SE0_PREV', '2I1': 'SE0_NOW', '2Y': 'SE0_PREV_D_EN',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_NRM3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_NRM4'
  });
  sim.addChip('U276_NRZI_RX_PRE_MUX', '74LVC157A', 'NRZI RX Previous-Bit Hold Mux on RX_SAMPLE_EN_PRE (aligned with U222.2)', {
    S: 'RX_SAMPLE_EN_PRE', G_N: 'GND',
    '1I0': 'NRZI_RX_PREV', '1I1': 'RCV_D2', '1Y': 'NRZI_RX_D_EN',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_NRP2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_NRP3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_NRP4'
  });
  sim.addChip('U08_NRZI_FF', '74LVC74A', 'TX & RX NRZI Previous-Level State Flip-Flops on CLK_48M', {
    '1CLR_N': 'VCC', '1PRE_N': 'NRZI_TX_RUN_REG', '1CLK': 'CLK_48M', '1D': 'NRZI_TX_D_EN', '1Q': 'NRZI_TX_Q', '1Q_N': 'NRZI_TX_Q_N',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'NRZI_RX_D_EN', '2Q': 'NRZI_RX_PREV', '2Q_N': 'NRZI_RX_PREV_N'
  });
  const nrziRxXorRef = (mutant === 'nrzi_rx_inverted') ? 'NRZI_RX_PREV' : 'NRZI_RX_PREV_N';
  sim.addChip('U09_NRZI_XOR', '74LVC86A', 'NRZI TX Toggle & RX Transition Detector XOR Gates', {
    '1A': 'NRZI_TX_Q_N', '1B': 'TX_BIT_GATED', '1Y': 'NRZI_TX_NEXT',
    '2A': 'RCV_D2', '2B': nrziRxXorRef, '2Y': 'NRZI_RX_BIT_RAW',
    '3A': 'RCV_D1', '3B': 'RCV_D2', '3Y': 'DPLL_EDGE_RAW',
    '4A': 'DP_IN', '4B': 'DM_IN', '4Y': 'ATTACHED_SENSE'
  });
  sim.addChip('U10_NRZI_INV', '74LVC04A', 'NRZI Bit Inverters & Control Inverters', {
    '1A': 'TX_BIT_GATED', '1Y': 'TX_BIT_INV',
    '2A': 'GND', '2Y': 'UNUSED_NRZI_INV2',
    '3A': 'GND', '3Y': 'UNUSED_INV3',
    '4A': 'DPLL_EDGE_RAW', '4Y': 'DPLL_SYNC_N_RAW',
    '5A': 'STUFF_Q0', '5Y': 'STUFF_Q0_N',
    '6A': 'TX_OE_PIN', '6Y': 'TX_OE_PIN_N'
  });

  sim.addChip('U239_STUFF_TRIG_FF', '74LVC74A', 'Registered Cycle-1 STUFF_TRIG (14.2 ns from U11, updates on ACTIVE_EN_D1) & ACTIVE_EN_D1', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'STUFF_TRIG_RAW', '1Q': 'STUFF_TRIG', '1Q_N': 'STUFF_NOT_TRIG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'ACTIVE_EN', '2Q': 'ACTIVE_EN_D1'
  });
  sim.addChip('U11_STUFF_CNT', '74LVC161', 'Consecutive-Ones Bit-Stuffing / Unstuffing Counter on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'STUFF_LOAD_N', CEP: 'STUFF_CNT_EN', CET: 'STUFF_CNT_EN',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'STUFF_Q0', Q1: 'STUFF_Q1', Q2: 'STUFF_Q2', Q3: 'STUFF_Q3', TC: 'STUFF_TC'
  });
  const stuffPin1B = (mutant === 'bit_stuff_off_by_one') ? 'STUFF_Q0' : 'STUFF_Q1';
  const stuffPin2B = (mutant === 'bit_stuff_off_by_one') ? 'STUFF_Q1_N_MUT' : 'STUFF_Q0_N';
  const dpllBoundPin = (mutant === 'dpll_resync_disabled') ? 'VCC' : 'GND';
  sim.addChip('U277_DPLL_BOUND_OR', '74LVC32A', 'Mask DPLL Preset on Q==3 (guarantees RX_SAMPLE_EN spacing >= 3 clocks)', {
    '1A': 'DPLL_SYNC_N_RAW', '1B': dpllBoundPin, '1Y': 'DPLL_SYNC_N',
    '2A': 'RX_WE_PULSE_RAW', '2B': (mutant === 'false_path_violated') ? 'S_TX_DATA' : 'GND', '2Y': 'RX_WE_PULSE',
    '3A': 'GND', '3B': 'GND', '3Y': 'UNUSED_DBO3',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_DBO4'
  });
  sim.addChip('U12_STUFF_AND', '74LVC08A', 'Bit-Stuff Terminal Count (6 Consecutive Ones) & DPLL Resync Gate', {
    '1A': 'STUFF_Q2', '1B': stuffPin1B, '1Y': 'STUFF_HI_MATCH',
    '2A': 'STUFF_HI_MATCH', '2B': stuffPin2B, '2Y': 'STUFF_TRIG_RAW',
    '3A': 'STUFF_TRIG', '3B': 'CTRL_RX_EN', '3Y': 'RX_STUFF_ARM',
    '4A': 'DPLL_EDGE_RAW', '4B': dpllGatePin, '4Y': 'DPLL_EDGE_GATED'
  });

  // =========================================================================
  // 4. Token CRC-5 & Data CRC-16 LFSR Subcircuits on CLK_48M (U13..U19, U100..U103, U167..U172)
  // =========================================================================
  sim.addChip('U168_CRC5_EN_MUX1', '74LVC157A', 'CRC-5 Synchronous Init-to-1 Mux (Out of Feedback Loop)', {
    S: 'CRC5_INIT', G_N: 'GND',
    '1I0': 'CRC5_Q0', '1I1': 'VCC', '1Y': 'CRC5_H0',
    '2I0': 'CRC5_Q1', '2I1': 'VCC', '2Y': 'CRC5_H1',
    '3I0': 'CRC5_Q2', '3I1': 'VCC', '3Y': 'CRC5_H2',
    '4I0': 'CRC5_Q3', '4I1': 'VCC', '4Y': 'CRC5_H3'
  });
  sim.addChip('U167_CRC5_EN_MUX0', '74LVC157A', 'CRC-5 Registered-Enable Mux Bits 3:0', {
    S: 'CRC5_EN_D1', G_N: 'GND',
    '1I0': 'CRC5_H0', '1I1': 'CRC5_FB_REG', '1Y': 'CRC5_D0_IN',
    '2I0': 'CRC5_H1', '2I1': 'CRC5_Q0',     '2Y': 'CRC5_D1_IN',
    '3I0': 'CRC5_H2', '3I1': 'CRC5_D2',     '3Y': 'CRC5_D2_IN',
    '4I0': 'CRC5_H3', '4I1': 'CRC5_Q2',     '4Y': 'CRC5_D3_IN'
  });
  sim.addChip('U169_CRC5_EN_MUX2', '74LVC157A', 'CRC-5 Bit 4 Init & Registered-Enable Mux', {
    S: 'CRC5_EN_D1', G_N: 'GND',
    '1I0': 'CRC5_H4', '1I1': 'CRC5_Q3', '1Y': 'CRC5_D4_IN',
    '2I0': 'GND',     '2I1': 'GND',     '2Y': 'UNUSED_C5M2',
    '3I0': 'GND',     '3I1': 'GND',     '3Y': 'UNUSED_C5M3',
    '4I0': 'GND',     '4I1': 'GND',     '4Y': 'UNUSED_C5M4'
  });
  sim.addChip('U170_CRC5_INIT4', '74LVC32A', 'CRC-5 Bit 4 Synchronous Preset & Enables', {
    '1A': 'CRC5_Q4', '1B': 'CRC5_INIT', '1Y': 'CRC5_H4',
    '2A': 'ACTIVE_EN', '2B': 'GND', '2Y': 'ACTIVE_EN_BUF_UNUSED',
    '3A': 'TX_BCNT_ADV_EN', '3B': 'RX_BYTE_ADV_EN', '3Y': 'BCNT_ADV_EN',
    '4A': 'DONE_LATCHED', '4B': 'DONE_SET_GATED', '4Y': 'DONE_NXT'
  });

  sim.addChip('U13_CRC5_FF0', '74LVC74A', 'CRC-5 Shift Register Bits 0..1 on CLK_48M', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'CRC5_D0_IN', '1Q': 'CRC5_Q0',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'CRC5_D1_IN', '2Q': 'CRC5_Q1'
  });
  sim.addChip('U14_CRC5_FF1', '74LVC74A', 'CRC-5 Shift Register Bits 2..3 on CLK_48M', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'CRC5_D2_IN', '1Q': 'CRC5_Q2',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'CRC5_D3_IN', '2Q': 'CRC5_Q3'
  });
  sim.addChip('U15_CRC5_FF2', '74LVC74A', 'CRC-5 Shift Register Bit 4 & EOP SE0 Width Flip-Flop on CLK_48M', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'CRC5_D4_IN', '1Q': 'CRC5_Q4', '1Q_N': 'CRC5_Q4_N',
      '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'SE0_PREV_D_EN', '2Q': 'SE0_PREV', ...(mutant === 'undriven_net_mutant' ? {} : { '2Q_N': 'SE0_PREV_N' })
  });
  sim.addChip('U16_CRC5_XOR', '74LVC86A', 'CRC-5 Polynomial Tap XOR Gates (x^5 + x^2 + 1)', {
    '1A': 'CRC_BIT_IN', '1B': 'CRC5_Q4', '1Y': 'CRC5_FB',
    '2A': 'CRC5_Q1', '2B': 'CRC5_FB_REG', '2Y': 'CRC5_D2',
    '3A': 'STUFF_Q1', '3B': 'VCC', '3Y': 'STUFF_Q1_N_MUT',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_U16_4Y'
  });

  // CRC-16 3-Cycle Pipelined Feedback & Init-Out-Of-Loop Muxes
  sim.addChip('U207_CRC_EN_PIPE_FF', '74LVC74A', 'Cycle-0/1 CRC_EN & CRC_CHK Pipeline', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'CRC16_EN_GATED', '1Q': 'CRC16_EN_D1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'CRC16_EN_D1',    '2Q': 'CRC16_EN_D2'
  });
  sim.addChip('U210_CRC5_EN_PIPE_FF', '74LVC74A', 'Cycle-0/1 CRC5_EN Pipeline', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'CRC5_EN_GATED', '1Q': 'CRC5_EN_D1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'CRC5_EN_D1',    '2Q': 'CRC5_EN_D2'
  });
  sim.addChip('U211_NOT_CRC_OUT_D1', '74LVC74A', 'Cycle-1 Delay for NOT_CRC16_OUT & NOT_CRC5_OUT', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'NOT_CRC16_OUT', '1Q': 'NOT_CRC16_OUT_D1',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'IN_CRC5_OUT',   '2Q': 'IN_CRC5_OUT_D1_UNUSED', '2Q_N': 'NOT_CRC5_OUT_D1'
  });
  sim.addChip('U208_CRC_FB_FF', '74LVC74A', 'Cycle-1 Registered CRC-16 & CRC-5 Feedback', {
    '1CLR_N': 'NOT_CRC16_OUT_D1', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'CRC16_FB', '1Q': 'CRC16_FB_REG',
    '2CLR_N': 'NOT_CRC5_OUT_D1',  '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'CRC5_FB',  '2Q': 'CRC5_FB_REG'
  });
  sim.addChip('U209_CRC_CHK_PIPE_FF', '74LVC74A', 'Cycle-1/2 CRC_CHK_EN Delay to Match CRC-16', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'CRC_CHK_EN', '1Q': 'CRC_CHK_D1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'CRC_CHK_D1', '2Q': 'CRC_CHK_D2'
  });
  sim.addChip('U100_CRC16_INIT_M0', '74LVC157A', 'CRC-16 Init-to-1 Hold Mux Bits 3:0 (Out of Loop)', {
    S: 'CRC16_INIT', G_N: 'GND',
    '1I0': 'CRC16_Q0', '1I1': 'VCC', '1Y': 'CRC16_H0',
    '2I0': 'CRC16_Q1', '2I1': 'VCC', '2Y': 'CRC16_H1',
    '3I0': 'CRC16_Q2', '3I1': 'VCC', '3Y': 'CRC16_H2',
    '4I0': 'CRC16_Q3', '4I1': 'VCC', '4Y': 'CRC16_H3'
  });
  sim.addChip('U101_CRC16_INIT_M1', '74LVC157A', 'CRC-16 Init-to-1 Hold Mux Bits 7:4 (Out of Loop)', {
    S: 'CRC16_INIT', G_N: 'GND',
    '1I0': 'CRC16_Q4', '1I1': 'VCC', '1Y': 'CRC16_H4',
    '2I0': 'CRC16_Q5', '2I1': 'VCC', '2Y': 'CRC16_H5',
    '3I0': 'CRC16_Q6', '3I1': 'VCC', '3Y': 'CRC16_H6',
    '4I0': 'CRC16_Q7', '4I1': 'VCC', '4Y': 'CRC16_H7'
  });
  sim.addChip('U102_CRC16_INIT_M2', '74LVC157A', 'CRC-16 Init-to-1 Hold Mux Bits 11:8 (Out of Loop)', {
    S: 'CRC16_INIT', G_N: 'GND',
    '1I0': 'CRC16_Q8',  '1I1': 'VCC', '1Y': 'CRC16_H8',
    '2I0': 'CRC16_Q9',  '2I1': 'VCC', '2Y': 'CRC16_H9',
    '3I0': 'CRC16_Q10', '3I1': 'VCC', '3Y': 'CRC16_H10',
    '4I0': 'CRC16_Q11', '4I1': 'VCC', '4Y': 'CRC16_H11'
  });
  sim.addChip('U103_CRC16_INIT_M3', '74LVC157A', 'CRC-16 Init-to-1 Hold Mux Bits 15:12 (Out of Loop)', {
    S: 'CRC16_INIT', G_N: 'GND',
    '1I0': 'CRC16_Q12', '1I1': 'VCC', '1Y': 'CRC16_H12',
    '2I0': 'CRC16_Q13', '2I1': 'VCC', '2Y': 'CRC16_H13',
    '3I0': 'CRC16_Q14', '3I1': 'VCC', '3Y': 'CRC16_H14',
    '4I0': 'CRC16_Q15', '4I1': 'VCC', '4Y': 'CRC16_H15'
  });
  sim.addChip('U171_CRC16_EN_M0', '74LVC157A', 'CRC-16 Registered-Enable Mux Bits 3:0', {
    S: 'CRC16_EN_D1', G_N: 'GND',
    '1I0': 'CRC16_H0', '1I1': 'CRC16_FB_REG', '1Y': 'CRC16_DIN0',
    '2I0': 'CRC16_H1', '2I1': 'CRC16_Q0',     '2Y': 'CRC16_DIN1',
    '3I0': 'CRC16_H2', '3I1': 'CRC16_D2',     '3Y': 'CRC16_DIN2',
    '4I0': 'CRC16_H3', '4I1': 'CRC16_Q2',     '4Y': 'CRC16_DIN3'
  });
  sim.addChip('U172_CRC16_EN_M1', '74LVC157A', 'CRC-16 Registered-Enable Mux Bits 7:4', {
    S: 'CRC16_EN_D1', G_N: 'GND',
    '1I0': 'CRC16_H4', '1I1': 'CRC16_Q3', '1Y': 'CRC16_DIN4',
    '2I0': 'CRC16_H5', '2I1': 'CRC16_Q4', '2Y': 'CRC16_DIN5',
    '3I0': 'CRC16_H6', '3I1': 'CRC16_Q5', '3Y': 'CRC16_DIN6',
    '4I0': 'CRC16_H7', '4I1': 'CRC16_Q6', '4Y': 'CRC16_DIN7'
  });
  sim.addChip('U173_CRC16_EN_M2', '74LVC157A', 'CRC-16 Registered-Enable Mux Bits 11:8', {
    S: 'CRC16_EN_D1', G_N: 'GND',
    '1I0': 'CRC16_H8',  '1I1': 'CRC16_Q7',  '1Y': 'CRC16_DIN8',
    '2I0': 'CRC16_H9',  '2I1': 'CRC16_Q8',  '2Y': 'CRC16_DIN9',
    '3I0': 'CRC16_H10', '3I1': 'CRC16_Q9',  '3Y': 'CRC16_DIN10',
    '4I0': 'CRC16_H11', '4I1': 'CRC16_Q10', '4Y': 'CRC16_DIN11'
  });
  sim.addChip('U174_CRC16_EN_M3', '74LVC157A', 'CRC-16 Registered-Enable Mux Bits 15:12', {
    S: 'CRC16_EN_D1', G_N: 'GND',
    '1I0': 'CRC16_H12', '1I1': 'CRC16_Q11', '1Y': 'CRC16_DIN12',
    '2I0': 'CRC16_H13', '2I1': 'CRC16_Q12', '2Y': 'CRC16_DIN13',
    '3I0': 'CRC16_H14', '3I1': 'CRC16_Q13', '3Y': 'CRC16_DIN14',
    '4I0': 'CRC16_H15', '4I1': 'CRC16_D15', '4Y': 'CRC16_DIN15'
  });

  sim.addChip('U17_CRC16_LO', '74LVC574A', 'CRC-16 Shift Register Low Byte Q[7:0] on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'CRC16_DIN0', D1: 'CRC16_DIN1', D2: 'CRC16_DIN2', D3: 'CRC16_DIN3',
    D4: 'CRC16_DIN4', D5: 'CRC16_DIN5', D6: 'CRC16_DIN6', D7: 'CRC16_DIN7',
    Q0: 'CRC16_Q0', Q1: 'CRC16_Q1', Q2: 'CRC16_Q2', Q3: 'CRC16_Q3',
    Q4: 'CRC16_Q4', Q5: 'CRC16_Q5', Q6: 'CRC16_Q6', Q7: 'CRC16_Q7'
  });
  sim.addChip('U18_CRC16_HI', '74LVC574A', 'CRC-16 Shift Register High Byte Q[15:8] on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'CRC16_DIN8', D1: 'CRC16_DIN9', D2: 'CRC16_DIN10', D3: 'CRC16_DIN11',
    D4: 'CRC16_DIN12', D5: 'CRC16_DIN13', D6: 'CRC16_DIN14', D7: 'CRC16_DIN15',
    Q0: 'CRC16_Q8', Q1: 'CRC16_Q9', Q2: 'CRC16_Q10', Q3: 'CRC16_Q11',
    Q4: 'CRC16_Q12', Q5: 'CRC16_Q13', Q6: 'CRC16_Q14', Q7: 'CRC16_Q15'
  });
  const crc16TapPin2A = (mutant === 'crc16_tap_moved') ? 'CRC16_Q3' : 'CRC16_Q1';
  sim.addChip('U19_CRC16_XOR', '74LVC86A', 'CRC-16 Polynomial Tap XOR Gates (x^16 + x^15 + x^2 + 1)', {
    '1A': 'CRC_BIT_IN', '1B': 'CRC16_Q15', '1Y': 'CRC16_FB',
    '2A': crc16TapPin2A, '2B': 'CRC16_FB_REG', '2Y': 'CRC16_D2',
    '3A': 'CRC16_Q14', '3B': 'CRC16_FB_REG', '3Y': 'CRC16_D15',
    '4A': 'CRC16_Q15', '4B': 'VCC', '4Y': 'CRC16_Q15_N'
  });

  // =========================================================================
  // 5. SerDes Shift Registers, Bit Counter, EOP Counter, Byte Length & Turnaround
  // =========================================================================
  sim.addChip('U175_RX_SR_M0', '74LVC157A', 'RX Shift-with-Enable Mux Bits 3:0 (LSB-first)', {
    S: 'RX_SR_EN', G_N: 'GND',
    '1I0': 'RX_D0', '1I1': 'RX_D1', '1Y': 'RX_SR_D0',
    '2I0': 'RX_D1', '2I1': 'RX_D2', '2Y': 'RX_SR_D1',
    '3I0': 'RX_D2', '3I1': 'RX_D3', '3Y': 'RX_SR_D2',
    '4I0': 'RX_D3', '4I1': 'RX_D4', '4Y': 'RX_SR_D3'
  });
  const rxSrEpEnSel = (mutant === 'mcp_endpoint_captures_off_enable') ? 'VCC' : 'RX_SR_EN';
  sim.addChip('U176_RX_SR_M1', '74LVC157A', 'RX Shift-with-Enable Mux Bits 7:4 (LSB-first)', {
    S: rxSrEpEnSel, G_N: 'GND',
    '1I0': 'RX_D4', '1I1': 'RX_D5',       '1Y': 'RX_SR_D4',
    '2I0': 'RX_D5', '2I1': 'RX_D6',       '2Y': 'RX_SR_D5',
    '3I0': 'RX_D6', '3I1': 'RX_D7',       '3Y': 'RX_SR_D6',
    '4I0': 'RX_D7', '4I1': 'NRZI_RX_BIT', '4Y': 'RX_SR_D7'
  });
  sim.addChip('U21_RX_SR', '74LVC574A', '8-Bit Synchronous Receive Shift Register on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'RX_SR_D0', D1: 'RX_SR_D1', D2: 'RX_SR_D2', D3: 'RX_SR_D3',
    D4: 'RX_SR_D4', D5: 'RX_SR_D5', D6: 'RX_SR_D6', D7: 'RX_SR_D7',
    Q0: 'RX_D0', Q1: 'RX_D1', Q2: 'RX_D2', Q3: 'RX_D3',
    Q4: 'RX_D4', Q5: 'RX_D5', Q6: 'RX_D6', Q7: 'RX_D7'
  });
  sim.addChip('U22_BIT_CNT', '74LVC161', 'Byte Framing Bit Counter (8..15) on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'BIT_CNT_LOAD_N', CEP: 'BIT_CNT_EN', CET: 'BIT_CNT_EN',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'VCC',
    Q0: 'BIT_Q0', Q1: 'BIT_Q1', Q2: 'BIT_Q2', Q3: 'BIT_Q3_UNUSED', TC: 'BIT_TC'
  });
  sim.addChip('U72_BIT_DONE_AND', '74LVC08A', 'Byte Framing Terminal Count & EOP Gates', {
    '1A': 'BIT_Q0', '1B': 'BIT_Q1', '1Y': 'BIT_01',
    '2A': 'BIT_01', '2B': 'BIT_Q2', '2Y': 'BIT_7',
    '3A': 'BIT_7', '3B': 'STUFF_NOT_TRIG', '3Y': 'BYTE_DONE',
    '4A': 'IS_EOP_ACTIVE', '4B': 'EOP_Q1', '4Y': 'TX_EOP_DONE'
  });
  sim.addChip('U73_EOP_CNT', '74LVC161', 'Transmit EOP SE0/J Bit-Time Counter on CLK_48M', {
    MR_N: 'IS_EOP_ACTIVE', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'EOP_CNT_EN', CET: 'EOP_CNT_EN',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'EOP_Q0', Q1: 'EOP_Q1', Q2: 'EOP_Q2', Q3: 'EOP_Q3', TC: 'EOP_TC'
  });
  sim.addChip('U74_EOP_DRV_AND', '74LVC08A', 'EOP SE0/J Differential Drive & Busy/Clear Gates', {
    '1A': 'EOP_Q1', '1B': 'EOP_J_VPO', '1Y': 'EOP_VPO',
    '2A': 'EOP_Q1', '2B': 'SPEED_LS',  '2Y': 'EOP_VMO',
    '3A': 'TX_EOP_DONE', '3B': 'VCC',  '3Y': 'TX_EOP_DONE_BUF',
    '4A': 'SIE_BUSY_N',  '4B': 'VCC',  '4Y': 'START_CLR_N'
  });

  // State Decoders (0x0..0x7 and 0x8..0xF)
  // Pre-decode NXT_S[3:0] (from U216) and register active-low/active-high state flags in parallel with U34 on ACTIVE_EN
  sim.addChip('U95_LO_STATE_DEC', '74LVC138A', 'Pre-Decode Next Low States (0x0..0x7 from NXT_S)', {
    A: 'NXT_S0', B: 'NXT_S1', C: 'NXT_S2', G2A_N: 'NXT_S3', G2B_N: 'GND', G1: 'VCC',
    Y0_N: 'NS_IDLE_N', Y1_N: 'NS_TX_SYNC_N', Y2_N: 'NS_TX_PID_N', Y3_N: 'NS_TX_TOK_B0_N',
    Y4_N: 'NS_TX_TOK_B1_N', Y5_N: 'NS_TX_EOP_N', Y6_N: 'NS_TX_DSYNC_N', Y7_N: 'NS_TX_DPID_N'
  });
  sim.addChip('U81_DATA_STATE_DEC', '74LVC138A', 'Pre-Decode Next High States (0x8..0xF from NXT_S)', {
    A: 'NXT_S0', B: 'NXT_S1', C: 'NXT_S2', G2A_N: 'GND', G2B_N: 'GND', G1: 'NXT_S3',
    Y0_N: 'NS_TX_DATA_N', Y1_N: 'NS_TX_CRC0_N', Y2_N: 'NS_TX_CRC1_N', Y3_N: 'NS_TX_DEOP_N',
    Y4_N: 'NS_WAIT_RX_N', Y5_N: 'NS_RX_PID_N', Y6_N: 'NS_RX_DATA_N', Y7_N: 'NS_AUTO_ACK_N'
  });
  sim.addChip('U235_ST_HOLD0', '74LVC157A', 'Registered State Flag Hold Mux 0 (ACTIVE_EN)', {
    S: 'ACTIVE_EN', G_N: 'GND',
    '1I0': 'S_IDLE_N',      '1I1': 'NS_IDLE_N',      '1Y': 'DS_IDLE_N',
    '2I0': 'S_TX_SYNC_N',   '2I1': 'NS_TX_SYNC_N',   '2Y': 'DS_TX_SYNC_N',
    '3I0': 'S_TX_PID_N',    '3I1': 'NS_TX_PID_N',    '3Y': 'DS_TX_PID_N',
    '4I0': 'S_TX_TOK_B1_N', '4I1': 'NS_TX_TOK_B1_N', '4Y': 'DS_TX_TOK_B1_N'
  });
  sim.addChip('U236_ST_HOLD1', '74LVC157A', 'Registered State Flag Hold Mux 1 (ACTIVE_EN)', {
    S: 'ACTIVE_EN', G_N: 'GND',
    '1I0': 'S_TX_EOP_N',  '1I1': 'NS_TX_EOP_N',  '1Y': 'DS_TX_EOP_N',
    '2I0': 'S_TX_DPID_N', '2I1': 'NS_TX_DPID_N', '2Y': 'DS_TX_DPID_N',
    '3I0': 'S_TX_DATA_N', '3I1': 'NS_TX_DATA_N', '3Y': 'DS_TX_DATA_N',
    '4I0': 'S_TX_CRC0_N', '4I1': 'NS_TX_CRC0_N', '4Y': 'DS_TX_CRC0_N'
  });
  sim.addChip('U237_ST_HOLD2', '74LVC157A', 'Registered State Flag Hold Mux 2 (ACTIVE_EN)', {
    S: 'ACTIVE_EN', G_N: 'GND',
    '1I0': 'S_TX_CRC1_N', '1I1': 'NS_TX_CRC1_N', '1Y': 'DS_TX_CRC1_N',
    '2I0': 'S_TX_DEOP_N', '2I1': 'NS_TX_DEOP_N', '2Y': 'DS_TX_DEOP_N',
    '3I0': 'S_WAIT_RX_N', '3I1': 'NS_WAIT_RX_N', '3Y': 'DS_WAIT_RX_N',
    '4I0': 'S_RX_PID_N',  '4I1': 'NS_RX_PID_N',  '4Y': 'DS_RX_PID_N'
  });
  sim.addChip('U238_ST_HOLD3', '74LVC157A', 'Registered State Flag Hold Mux 3 (ACTIVE_EN)', {
    S: 'ACTIVE_EN', G_N: 'GND',
    '1I0': 'S_RX_DATA_N',  '1I1': 'NS_RX_DATA_N',  '1Y': 'DS_RX_DATA_N',
    '2I0': 'S_AUTO_ACK_N', '2I1': 'NS_AUTO_ACK_N', '2Y': 'DS_AUTO_ACK_N',
    '3I0': 'GND',          '3I1': 'GND',           '3Y': 'UNUSED_SH3_3',
    '4I0': 'GND',          '4I1': 'GND',           '4Y': 'UNUSED_SH3_4'
  });
  sim.addChip('U228_ST_FF0', '74LVC74A', 'Registered State Flags S_IDLE & S_TX_SYNC (6.9 ns dual-polarity)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC',   '1CLK': 'CLK_48M', '1D': 'DS_IDLE_N',    '1Q': 'S_IDLE_N',    '1Q_N': 'S_IDLE',
    '2CLR_N': 'VCC',   '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_TX_SYNC_N', '2Q': 'S_TX_SYNC_N', '2Q_N': 'S_TX_SYNC'
  });
  sim.addChip('U229_ST_FF1', '74LVC74A', 'Registered State Flags S_TX_PID & S_TX_TOK_B1', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_TX_PID_N',    '1Q': 'S_TX_PID_N',    '1Q_N': 'S_TX_PID',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_TX_TOK_B1_N', '2Q': 'S_TX_TOK_B1_N', '2Q_N': 'S_TX_TOK_B1'
  });
  sim.addChip('U230_ST_FF2', '74LVC74A', 'Registered State Flags S_TX_EOP & S_TX_DPID', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_TX_EOP_N',  '1Q': 'S_TX_EOP_N',  '1Q_N': 'S_TX_EOP',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_TX_DPID_N', '2Q': 'S_TX_DPID_N', '2Q_N': 'S_TX_DPID'
  });
  sim.addChip('U231_ST_FF3', '74LVC74A', 'Registered State Flags S_TX_DATA & S_TX_CRC0', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_TX_DATA_N', '1Q': 'S_TX_DATA_N', '1Q_N': 'S_TX_DATA',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_TX_CRC0_N', '2Q': 'S_TX_CRC0_N', '2Q_N': 'S_TX_CRC0'
  });
  sim.addChip('U232_ST_FF4', '74LVC74A', 'Registered State Flags S_TX_CRC1 & S_TX_DEOP', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_TX_CRC1_N', '1Q': 'S_TX_CRC1_N', '1Q_N': 'S_TX_CRC1',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_TX_DEOP_N', '2Q': 'S_TX_DEOP_N', '2Q_N': 'S_TX_DEOP'
  });
  sim.addChip('U233_ST_FF5', '74LVC74A', 'Registered State Flags S_WAIT_RX & S_RX_PID', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_WAIT_RX_N', '1Q': 'S_WAIT_RX_N', '1Q_N': 'S_WAIT_RX',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_RX_PID_N',  '2Q': 'S_RX_PID_N',  '2Q_N': 'S_RX_PID'
  });
  sim.addChip('U234_ST_FF6', '74LVC74A', 'Registered State Flags S_RX_DATA & S_AUTO_ACK', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'DS_RX_DATA_N',  '1Q': 'S_RX_DATA_N',  '1Q_N': 'S_RX_DATA',
    '2CLR_N': 'VCC', '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'DS_AUTO_ACK_N', '2Q': 'S_AUTO_ACK_N', '2Q_N': 'S_AUTO_ACK'
  });
  sim.addChip('U83_DATA_STATE_OR', '74LVC32A', 'Combine TX/RX Data State for Byte Counter', {
    '1A': 'S_TX_DATA', '1B': 'S_RX_DATA', '1Y': 'IN_DATA_STATE',
    '2A': 'S_TX_CRC0', '2B': 'S_TX_CRC1', '2Y': 'IN_CRC16_OUT',
    '3A': 'S_RX_PID',  '3B': 'S_RX_DATA', '3Y': 'IN_RX_PKT',
    '4A': 'ERR_CRC_LAT', '4B': 'ERR_TIMEOUT_LAT', '4Y': 'FSM_ERR_OR_TO_0'
  });
  sim.addChip('U75_STATE_OR', '74LVC32A', 'SIE Busy & Combined EOP_VALID OR Gates', {
    '1A': 'CUR_S0', '1B': 'CUR_S1', '1Y': 'BUSY_01',
    '2A': 'CUR_S2', '2B': 'CUR_S3', '2Y': 'BUSY_23',
    '3A': 'BUSY_01', '3B': 'BUSY_23', '3Y': 'SIE_BUSY',
    '4A': 'TX_EOP_DONE', '4B': 'RX_EOP_VALID', '4Y': 'EOP_VALID'
  });

  // Payload Byte Counter (BCNT[7:0]) & 2-Stage RX Length Pipeline (RDLEN[7:0]) on CLK_48M
  sim.addChip('U76_LEN_CNT_LO', '74LVC161', 'Payload Byte Counter Low Nibble on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SIE_BUSY', CEP: 'BCNT_ADV_EN', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'BCNT0', Q1: 'BCNT1', Q2: 'BCNT2', Q3: 'BCNT3', TC: 'BCNT_TC0'
  });
  sim.addChip('U77_LEN_CNT_HI', '74LVC161', 'Payload Byte Counter High Nibble on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SIE_BUSY', CEP: 'BCNT_ADV_EN', CET: 'BCNT_TC0',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'BCNT4', Q1: 'BCNT5', Q2: 'BCNT6', Q3: 'BCNT7', TC: 'BCNT_TC1'
  });
  sim.addChip('U177_RDLEN_EN_M0', '74LVC157A', 'RDL1 Enable Hold Mux Bits 3:0', {
    S: 'RX_BYTE_ADV_EN', G_N: 'GND',
    '1I0': 'RDL1_0', '1I1': 'BCNT0', '1Y': 'RDL1_D0',
    '2I0': 'RDL1_1', '2I1': 'BCNT1', '2Y': 'RDL1_D1',
    '3I0': 'RDL1_2', '3I1': 'BCNT2', '3Y': 'RDL1_D2',
    '4I0': 'RDL1_3', '4I1': 'BCNT3', '4Y': 'RDL1_D3'
  });
  sim.addChip('U178_RDLEN_EN_M1', '74LVC157A', 'RDL1 Enable Hold Mux Bits 7:4', {
    S: 'RX_BYTE_ADV_EN', G_N: 'GND',
    '1I0': 'RDL1_4', '1I1': 'BCNT4', '1Y': 'RDL1_D4',
    '2I0': 'RDL1_5', '2I1': 'BCNT5', '2Y': 'RDL1_D5',
    '3I0': 'RDL1_6', '3I1': 'BCNT6', '3Y': 'RDL1_D6',
    '4I0': 'RDL1_7', '4I1': 'BCNT7', '4Y': 'RDL1_D7'
  });
  sim.addChip('U179_RDLEN2_EN_M0', '74LVC157A', 'RDL2 Enable Hold Mux Bits 3:0', {
    S: 'RX_BYTE_ADV_EN', G_N: 'GND',
    '1I0': 'RDLEN0', '1I1': 'RDL1_0', '1Y': 'RDL2_D0',
    '2I0': 'RDLEN1', '2I1': 'RDL1_1', '2Y': 'RDL2_D1',
    '3I0': 'RDLEN2', '3I1': 'RDL1_2', '3Y': 'RDL2_D2',
    '4I0': 'RDLEN3', '4I1': 'RDL1_3', '4Y': 'RDL2_D3'
  });
  sim.addChip('U180_RDLEN2_EN_M1', '74LVC157A', 'RDL2 Enable Hold Mux Bits 7:4', {
    S: 'RX_BYTE_ADV_EN', G_N: 'GND',
    '1I0': 'RDLEN4', '1I1': 'RDL1_4', '1Y': 'RDL2_D4',
    '2I0': 'RDLEN5', '2I1': 'RDL1_5', '2Y': 'RDL2_D5',
    '3I0': 'RDLEN6', '3I1': 'RDL1_6', '3Y': 'RDL2_D6',
    '4I0': 'RDLEN7', '4I1': 'RDL1_7', '4Y': 'RDL2_D7'
  });
  sim.addChip('U97_RDLEN_D1', '74LVC574A', 'RX Length Pipeline Stage 1 on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'RDL1_D0', D1: 'RDL1_D1', D2: 'RDL1_D2', D3: 'RDL1_D3',
    D4: 'RDL1_D4', D5: 'RDL1_D5', D6: 'RDL1_D6', D7: 'RDL1_D7',
    Q0: 'RDL1_0', Q1: 'RDL1_1', Q2: 'RDL1_2', Q3: 'RDL1_3',
    Q4: 'RDL1_4', Q5: 'RDL1_5', Q6: 'RDL1_6', Q7: 'RDL1_7'
  });
  sim.addChip('U98_RDLEN_D2', '74LVC574A', 'RX Length Pipeline Stage 2 on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'RDL2_D0', D1: 'RDL2_D1', D2: 'RDL2_D2', D3: 'RDL2_D3',
    D4: 'RDL2_D4', D5: 'RDL2_D5', D6: 'RDL2_D6', D7: 'RDL2_D7',
    Q0: 'RDLEN0', Q1: 'RDLEN1', Q2: 'RDLEN2', Q3: 'RDLEN3',
    Q4: 'RDLEN4', Q5: 'RDLEN5', Q6: 'RDLEN6', Q7: 'RDLEN7'
  });

  // Length Equality Comparator (8-bit: BCNT[7:0] == TXLEN[7:0])
  sim.addChip('U78_LEN_CMP_LO', '74LVC86A', 'Payload Length Equality Comparator Bits 3:0', {
    '1A': 'BCNT0', '1B': 'TXLEN0', '1Y': 'LCMP0',
    '2A': 'BCNT1', '2B': 'TXLEN1', '2Y': 'LCMP1',
    '3A': 'BCNT2', '3B': 'TXLEN2', '3Y': 'LCMP2',
    '4A': 'BCNT3', '4B': 'TXLEN3', '4Y': 'LCMP3'
  });
  sim.addChip('U79_LEN_CMP_HI', '74LVC86A', 'Payload Length Equality Comparator Bits 7:4', {
    '1A': 'BCNT4', '1B': 'TXLEN4', '1Y': 'LCMP4',
    '2A': 'BCNT5', '2B': 'TXLEN5', '2Y': 'LCMP5',
    '3A': 'BCNT6', '3B': 'TXLEN6', '3Y': 'LCMP6',
    '4A': 'BCNT7', '4B': 'TXLEN7', '4Y': 'LCMP7'
  });
  sim.addChip('U80_LEN_CMP_OR', '74LVC32A', 'Payload Length Mismatch OR Tree Low/Mid', {
    '1A': 'LCMP0', '1B': 'LCMP1', '1Y': 'LMIS01',
    '2A': 'LCMP2', '2B': 'LCMP3', '2Y': 'LMIS23',
    '3A': 'LCMP4', '3B': 'LCMP5', '3Y': 'LMIS45',
    '4A': 'LCMP6', '4B': 'LCMP7', '4Y': 'LMIS67'
  });
  sim.addChip('U99_LEN_CMP_OR2', '74LVC32A', 'Payload Length Mismatch OR Tree Top', {
    '1A': 'LMIS01', '1B': 'LMIS23', '1Y': 'LMIS_03',
    '2A': 'LMIS45', '2B': 'LMIS67', '2Y': 'LMIS_47',
    '3A': 'LMIS_03_REG', '3B': 'LMIS_47_REG', '3Y': 'TX_LEN_NOT_DONE',
    '4A': 'RX_Z03', '4B': 'RX_Z45', '4Y': 'RX_Z05'
  });

  // TX Payload Byte Latch (latches Buffer SRAM byte on TX_LAT_EN = TX_BIT_EN & BYTE_DONE)
  sim.addChip('U181_TX_LAT_M0', '74LVC157A', 'TX Payload Latch Enable Mux Bits 3:0', {
    S: 'TX_LAT_EN', G_N: 'GND',
    '1I0': 'TX_LAT_D0', '1I1': 'TX_PAY_D0', '1Y': 'TX_LAT_DIN0',
    '2I0': 'TX_LAT_D1', '2I1': 'TX_PAY_D1', '2Y': 'TX_LAT_DIN1',
    '3I0': 'TX_LAT_D2', '3I1': 'TX_PAY_D2', '3Y': 'TX_LAT_DIN2',
    '4I0': 'TX_LAT_D3', '4I1': 'TX_PAY_D3', '4Y': 'TX_LAT_DIN3'
  });
  sim.addChip('U182_TX_LAT_M1', '74LVC157A', 'TX Payload Latch Enable Mux Bits 7:4', {
    S: 'TX_LAT_EN', G_N: 'GND',
    '1I0': 'TX_LAT_D4', '1I1': 'TX_PAY_D4', '1Y': 'TX_LAT_DIN4',
    '2I0': 'TX_LAT_D5', '2I1': 'TX_PAY_D5', '2Y': 'TX_LAT_DIN5',
    '3I0': 'TX_LAT_D6', '3I1': 'TX_PAY_D6', '3Y': 'TX_LAT_DIN6',
    '4I0': 'TX_LAT_D7', '4I1': 'TX_PAY_D7', '4Y': 'TX_LAT_DIN7'
  });
  sim.addChip('U93_TX_BYTE_LAT', '74LVC574A', 'TX Payload Byte Hold Register on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'TX_LAT_DIN0', D1: 'TX_LAT_DIN1', D2: 'TX_LAT_DIN2', D3: 'TX_LAT_DIN3',
    D4: 'TX_LAT_DIN4', D5: 'TX_LAT_DIN5', D6: 'TX_LAT_DIN6', D7: 'TX_LAT_DIN7',
    Q0: 'TX_LAT_D0', Q1: 'TX_LAT_D1', Q2: 'TX_LAT_D2', Q3: 'TX_LAT_D3',
    Q4: 'TX_LAT_D4', Q5: 'TX_LAT_D5', Q6: 'TX_LAT_D6', Q7: 'TX_LAT_D7'
  });

  // TX Serializer Byte Muxes
  sim.addChip('U84_SER_MUX_LO', '74LVC157A', 'Serializer Byte Mux Bits 3:0 (Token B0 vs Payload)', {
    S: 'S_TX_DATA', G_N: 'GND',
    '1I0': 'TOK_B0_R0', '1I1': 'TX_LAT_D0', '1Y': 'SER_B0_LO',
    '2I0': 'TOK_B0_R1', '2I1': 'TX_LAT_D1', '2Y': 'SER_B1_LO',
    '3I0': 'TOK_B0_R2', '3I1': 'TX_LAT_D2', '3Y': 'SER_B2_LO',
    '4I0': 'TOK_B0_R3', '4I1': 'TX_LAT_D3', '4Y': 'SER_B3_LO'
  });
  sim.addChip('U85_SER_MUX_HI', '74LVC157A', 'Serializer Byte Mux Bits 7:4 (Token B0 vs Payload)', {
    S: 'S_TX_DATA', G_N: 'GND',
    '1I0': 'TOK_B0_R4', '1I1': 'TX_LAT_D4', '1Y': 'SER_B4_LO',
    '2I0': 'TOK_B0_R5', '2I1': 'TX_LAT_D5', '2Y': 'SER_B5_LO',
    '3I0': 'TOK_B0_R6', '3I1': 'TX_LAT_D6', '3Y': 'SER_B6_LO',
    '4I0': 'TOK_B0_R7', '4I1': 'TX_LAT_D7', '4Y': 'SER_B7_LO'
  });
  sim.addChip('U86_SER_CRC_MUX_LO', '74LVC157A', 'Serializer Mux Bits 3:0 (Token B0/Payload vs Token B1 ENDP[3:1])', {
    S: 'S_TX_TOK_B1', G_N: 'GND',
    '1I0': 'SER_B0_LO', '1I1': 'TOK_B1_0', '1Y': 'SER_BYTE0',
    '2I0': 'SER_B1_LO', '2I1': 'TOK_B1_1', '2Y': 'SER_BYTE1',
    '3I0': 'SER_B2_LO', '3I1': 'TOK_B1_2', '3Y': 'SER_BYTE2',
    '4I0': 'SER_B3_LO', '4I1': 'GND',      '4Y': 'SER_BYTE3'
  });
  sim.addChip('U87_SER_CRC_MUX_HI', '74LVC157A', 'Serializer Mux Bits 7:4 (Token B0/Payload vs Token B1)', {
    S: 'S_TX_TOK_B1', G_N: 'GND',
    '1I0': 'SER_B4_LO', '1I1': 'GND', '1Y': 'SER_BYTE4',
    '2I0': 'SER_B5_LO', '2I1': 'GND', '2Y': 'SER_BYTE5',
    '3I0': 'SER_B6_LO', '3I1': 'GND', '3Y': 'SER_BYTE6',
    '4I0': 'SER_B7_LO', '4I1': 'GND', '4Y': 'SER_BYTE7'
  });
  sim.addChip('U88_TX_PAY_BYTE_MUX_LO', '74LVC157A', 'Select Even/Odd Buffer SRAM Byte for TX Payload Bits 3:0', {
    S: 'BCNT0', G_N: 'GND',
    '1I0': 'BD0', '1I1': 'BD8',  '1Y': 'TX_PAY_D0',
    '2I0': 'BD1', '2I1': 'BD9',  '2Y': 'TX_PAY_D1',
    '3I0': 'BD2', '3I1': 'BD10', '3Y': 'TX_PAY_D2',
    '4I0': 'BD3', '4I1': 'BD11', '4Y': 'TX_PAY_D3'
  });
  sim.addChip('U89_TX_PAY_BYTE_MUX_HI', '74LVC157A', 'Select Even/Odd Buffer SRAM Byte for TX Payload Bits 7:4', {
    S: 'BCNT0', G_N: 'GND',
    '1I0': 'BD4', '1I1': 'BD12', '1Y': 'TX_PAY_D4',
    '2I0': 'BD5', '2I1': 'BD13', '2Y': 'TX_PAY_D5',
    '3I0': 'BD6', '3I1': 'BD14', '3Y': 'TX_PAY_D6',
    '4I0': 'BD7', '4I1': 'BD15', '4Y': 'TX_PAY_D7'
  });

  // RX SYNC (0x80) Detector, CRC-16 Residual (0x800D) & LAST_PID / ERR_CRC Latches
  sim.addChip('U90_RX_SYNC_OR', '74LVC32A', 'Detect RX_D[5:0] == 0x00 for SYNC 0x80', {
    '1A': 'RX_D0', '1B': 'RX_D1', '1Y': 'RX_Z01',
    '2A': 'RX_D2', '2B': 'RX_D3', '2Y': 'RX_Z23',
    '3A': 'RX_D4', '3B': 'RX_D5', '3Y': 'RX_Z45',
    '4A': 'RX_Z01', '4B': 'RX_Z23', '4Y': 'RX_Z03'
  });
  sim.addChip('U91_RX_SYNC_AND', '74LVC08A', 'RX_ACTIVE = RX_D7 & ~(RX_Z06) & S_WAIT_RX & CRC16_RES_OK', {
    '1A': 'RX_D7', '1B': 'S_WAIT_RX', '1Y': 'RX_SYNC_CAND',
    '2A': 'RX_SYNC_CAND', '2B': 'RX_Z06_N', '2Y': 'RX_ACTIVE',
    '3A': 'LAT_PID_NOW', '3B': 'RX_SAMPLE_EN', '3Y': 'LAT_PID_EN',
    '4A': 'CRC16_RES_LO_OK', '4B': 'CRC16_RES_HI_OK', '4Y': 'CRC16_RES_OK'
  });
  sim.addChip('U183_PID_EN_M0', '74LVC157A', 'LAST_PID_REG Enable Hold Mux Bits 3:0', {
    S: 'LAT_PID_EN', G_N: 'GND',
    '1I0': 'LAST_PID0', '1I1': 'PID_C0', '1Y': 'LPID_DIN0',
    '2I0': 'LAST_PID1', '2I1': 'PID_C1', '2Y': 'LPID_DIN1',
    '3I0': 'LAST_PID2', '3I1': 'PID_C2', '3Y': 'LPID_DIN2',
    '4I0': 'LAST_PID3', '4I1': 'PID_C3', '4Y': 'LPID_DIN3'
  });
  sim.addChip('U184_PID_EN_M1', '74LVC157A', 'LAST_PID_REG Enable Hold Mux Bits 7:4', {
    S: 'LAT_PID_EN', G_N: 'GND',
    '1I0': 'LAST_PID_VAL',  '1I1': 'PID_VALID',      '1Y': 'LPID_DIN4',
    '2I0': 'LAST_PID_DAT',  '2I1': 'PID_IS_DAT',     '2Y': 'LPID_DIN5',
    '3I0': 'LAST_PID_HS',   '3I1': 'PID_IS_HS',      '3Y': 'LPID_DIN6',
    '4I0': 'TOGGLE_OK_LAT', '4I1': 'TOGGLE_OK_COMB', '4Y': 'LPID_DIN7'
  });
  sim.addChip('U92_LAST_PID_REG', '74LVC574A', 'Latched Received PID[3:0] & Toggle Match on CLK_48M', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'LPID_DIN0', D1: 'LPID_DIN1', D2: 'LPID_DIN2', D3: 'LPID_DIN3',
    D4: 'LPID_DIN4', D5: 'LPID_DIN5', D6: 'LPID_DIN6', D7: 'LPID_DIN7',
    Q0: 'LAST_PID0', Q1: 'LAST_PID1', Q2: 'LAST_PID2', Q3: 'LAST_PID3',
    Q4: 'LAST_PID_VAL', Q5: 'LAST_PID_DAT', Q6: 'LAST_PID_HS', Q7: 'TOGGLE_OK_LAT'
  });

  sim.addChip('U23_TURN_CNT_LO', '74LVC161', 'Bus Turnaround Timeout Counter Low Nibble on CLK_48M', {
    MR_N: 'CTRL_TURN_EN', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'TURN_CNT_EN', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'TURN_Q0', Q1: 'TURN_Q1', Q2: 'TURN_Q2', Q3: 'TURN_Q3', TC: 'TURN_TC_LO'
  });
  sim.addChip('U24_TURN_CNT_HI', '74LVC161', 'Bus Turnaround Timeout Counter High Nibble on CLK_48M', {
    MR_N: 'CTRL_TURN_EN', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'TURN_CNT_EN', CET: 'TURN_TC_LO',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'TURN_Q4', Q1: 'TURN_Q5', Q2: 'TURN_Q6', Q3: 'TURN_Q7', TC: 'TURN_TC_HI'
  });
  const turnCmp1A = (mutant === 'turnaround_short') ? 'VCC' : 'TURN_Q4';
  sim.addChip('U25_TURN_EOP_AND', '74LVC08A', 'Turnaround Timeout (18 Bit Times) & EOP Detector AND Gate', {
    '1A': turnCmp1A, '1B': 'TURN_Q1', '1Y': 'TURN_TIMEOUT',
    '2A': 'DP_IN_N', '2B': 'DM_IN_N', '2Y': 'SE0_RAW',
    '3A': 'SE0_PREV', '3B': 'BUS_J_SENSE_REG', '3Y': 'RX_EOP_VALID',
    '4A': 'S_RX_DATA', '4B': 'BYTE_DONE', '4Y': 'RX_BYTE_ADV'
  });

  // =========================================================================
  // 6. 1.000 ms SOF / Keep-Alive Timer & 11-Bit Frame Counter (U26..U33)
  // =========================================================================
  sim.addChip('U26_SOF_TMR0', '74LVC161', '1 ms Frame Interval Counter Stage 0 (Bits 3:0)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SOF_RELOAD_N', CEP: 'VCC', CET: 'VCC',
    D0: 'VCC', D1: 'GND', D2: 'GND', D3: 'GND', Q0: 'SOF_T0', Q1: 'SOF_T1', Q2: 'SOF_T2', Q3: 'SOF_T3', TC: 'SOF_TC0'
  });
  sim.addChip('U27_SOF_TMR1', '74LVC161', '1 ms Frame Interval Counter Stage 1 (Bits 7:4, Look-Ahead Carry)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SOF_RELOAD_N', CEP: 'SOF_TC0', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'VCC', Q0: 'SOF_T4', Q1: 'SOF_T5', Q2: 'SOF_T6', Q3: 'SOF_T7', TC: 'SOF_L1'
  });
  sim.addChip('U28_SOF_TMR2', '74LVC161', '1 ms Frame Interval Counter Stage 2 (Bits 11:8, Look-Ahead Carry)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SOF_RELOAD_N', CEP: 'SOF_TC1', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'VCC', D3: 'GND', Q0: 'SOF_T8', Q1: 'SOF_T9', Q2: 'SOF_T10', Q3: 'SOF_T11', TC: 'SOF_L2'
  });
  sim.addChip('U29_SOF_TMR3', '74LVC161', '1 ms Frame Interval Counter Stage 3 (Bits 15:12, Look-Ahead Carry)', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'SOF_RELOAD_N', CEP: 'SOF_TC2', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'VCC', D3: 'GND', Q0: 'SOF_T12', Q1: 'SOF_T13', Q2: 'SOF_T14', Q3: 'SOF_T15', TC: 'SOF_L3'
  });
  sim.addChip('U220_SOF_CARRY_AND', '74LVC08A', '1 ms SOF Timer Synchronous Look-Ahead Carry Tree', {
    '1A': 'SOF_TC0', '1B': 'SOF_L1', '1Y': 'SOF_TC1',
    '2A': 'SOF_L2',  '2B': 'SOF_L3', '2Y': 'SOF_L23',
    '3A': 'SOF_TC1', '3B': 'SOF_L2', '3Y': 'SOF_TC2',
    '4A': 'SOF_TC1', '4B': 'SOF_L23', '4Y': 'SOF_1MS_TICK_RAW'
  });
  sim.addChip('U221_SOF_TICK_FF', '74LVC74A', 'Registered 1-Cycle 1 ms SOF Tick (cuts SOF_1MS_TICK to 5.2ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'SOF_1MS_TICK_RAW', '1Q': 'SOF_1MS_TICK',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'DPLL_EDGE_GATED', '2Q': 'DPLL_EDGE_REG', '2Q_N': 'DPLL_EDGE_REG_N'
  });
  const sofEnableInput = (mutant === 'sof_missing') ? 'GND' : 'AUTO_SOF_EN';
  sim.addChip('U30_SOF_GATE', '74LVC08A', '1 ms SOF / Keep-Alive Trigger & IRQ Gate', {
    '1A': 'SOF_1MS_TICK', '1B': sofEnableInput, '1Y': 'SOF_TRIG_OUT',
    '2A': 'SOF_TRIG_OUT', '2B': 'SPEED_FS', '2Y': 'SOF_TOKEN_REQ',
    '3A': 'SOF_TRIG_OUT', '3B': 'SPEED_LS', '3Y': 'LS_KEEPALIVE_REQ',
    '4A': 'IRQ_EN', '4B': 'DONE_LATCHED', '4Y': 'IRQ'
  });
  sim.addChip('U31_FRNUM_CNT0', '74LVC161', 'USB 11-Bit Frame Number Counter Bits 3:0 on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'SOF_TRIG_OUT', CET: 'VCC',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND', Q0: 'FN0', Q1: 'FN1', Q2: 'FN2', Q3: 'FN3', TC: 'FN_TC0'
  });
  sim.addChip('U32_FRNUM_CNT1', '74LVC161', 'USB 11-Bit Frame Number Counter Bits 7:4 on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'SOF_TRIG_OUT', CET: 'FN_TC0',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND', Q0: 'FN4', Q1: 'FN5', Q2: 'FN6', Q3: 'FN7', TC: 'FN_TC1'
  });
  sim.addChip('U33_FRNUM_CNT2', '74LVC161', 'USB 11-Bit Frame Number Counter Bits 10:8 on CLK_48M', {
    MR_N: 'RST_N', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'SOF_TRIG_OUT', CET: 'FN_TC1',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND', Q0: 'FN8', Q1: 'FN9', Q2: 'FN10', Q3: 'FN11_UNUSED', TC: 'FN_TC2'
  });

  // =========================================================================
  // 7. Shadowed 10 ns SRAM FSM & Protocol Lookup Tables (U34..U38, U52..U53)
  // =========================================================================
  const fsmEnSel = (mutant === 'mcp_source_changes_off_enable') ? 'VCC' : 'ACTIVE_EN';
  sim.addChip('U185_FSM_EN_M0', '74LVC157A', 'FSM State Register Enable Hold Mux Bits 3:0', {
    S: fsmEnSel, G_N: 'GND',
    '1I0': 'CUR_S0', '1I1': 'NXT_S0', '1Y': 'FSM_DIN0',
    '2I0': 'CUR_S1', '2I1': 'NXT_S1', '2Y': 'FSM_DIN1',
    '3I0': 'CUR_S2', '3I1': 'NXT_S2', '3Y': 'FSM_DIN2',
    '4I0': 'CUR_S3', '4I1': 'NXT_S3', '4Y': 'FSM_DIN3'
  });
  sim.addChip('U203_FSM_LATT_MUX', '74LVC157A', 'Latch XFER_T[1:0] only in S_IDLE', {
    S: 'S_IDLE', G_N: 'GND',
    '1I0': 'LAT_T0', '1I1': 'XFER_T0', '1Y': 'XFER_T0_IDLE',
    '2I0': 'LAT_T1', '2I1': 'XFER_T1', '2Y': 'XFER_T1_IDLE',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_FLT3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_FLT4'
  });
  sim.addChip('U186_FSM_EN_M1', '74LVC157A', 'FSM State Register Enable Hold Mux Bits 7:4', {
    S: 'ACTIVE_EN', G_N: 'GND',
    '1I0': 'LAT_T0',    '1I1': 'XFER_T0_IDLE', '1Y': 'FSM_DIN4',
    '2I0': 'LAT_T1',    '2I1': 'XFER_T1_IDLE', '2Y': 'FSM_DIN5',
    '3I0': 'LAT_START', '3I1': 'START_OR_SOF', '3Y': 'FSM_DIN6',
    '4I0': 'LAT_BDONE', '4I1': 'BYTE_DONE',    '4Y': 'FSM_DIN7'
  });
  sim.addChip('U34_FSM_STATE', '74LVC574A', 'SIE State & Mode Register on CLK_48M (No Program Counter)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'FSM_DIN0', D1: 'FSM_DIN1', D2: 'FSM_DIN2', D3: 'FSM_DIN3',
    D4: 'FSM_DIN4', D5: 'FSM_DIN5', D6: 'FSM_DIN6', D7: 'FSM_DIN7',
    Q0: 'CUR_S0', Q1: 'CUR_S1', Q2: 'CUR_S2', Q3: 'CUR_S3',
    Q4: 'LAT_T0', Q5: 'LAT_T1', Q6: 'LAT_START', Q7: 'LAT_BDONE'
  });
  sim.addChip('U248_CRC_INIT_AND', '74LVC08A', 'Direct CRC16_INIT_N & Balanced RX_STUFF_CHK_TRIG (1-cycle clean)', {
    '1A': 'S_TX_DPID_N', '1B': 'S_RX_PID_N', '1Y': 'CRC16_INIT_N0',
    '2A': 'CRC16_INIT_N0', '2B': 'S_IDLE_N', '2Y': 'CRC16_INIT_N',
    '3A': 'RX_SAMPLE_EN', '3B': 'SE0_NOW_N', '3Y': 'RX_SAMP_NOT_SE0',
    '4A': 'RX_STUFF_ARM_REG', '4B': 'RX_SAMP_NOT_SE0', '4Y': 'RX_STUFF_CHK_TRIG'
  });
  sim.addChip('U249_MISC_PIPE_FF', '74LVC74A', 'Registered RX_STUFF_ARM & IS_EOP_STATE (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'RX_STUFF_ARM', '1Q': 'RX_STUFF_ARM_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'IS_EOP_STATE', '2Q': 'IS_EOP_STATE_REG'
  });
  sim.addChip('U274_CMD_PIPE_FF', '74LVC74A', 'Registered CMD_TOGGLE_N & BUS_J_SENSE_REG (5.2 ns, closes last 2 STA paths)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'CMD_TOGGLE',  '1Q': 'CMD_TOGGLE_R_UNUSED', '1Q_N': 'CMD_TOGGLE_N',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'BUS_J_SENSE', '2Q': 'BUS_J_SENSE_REG'
  });
  sim.addChip('U275_SOF_CLR_AND', '74LVC08A', 'Synchronous Clear Gate for SOF_ACTIVE (eliminates async clear setup viol)', {
    '1A': 'SOF_ACTIVE', '1B': 'S_IDLE', '1Y': 'SOF_ACT_HOLD',
    '2A': 'CMD_PID3_N', '2B': 'CMD_PID2_N', '2Y': 'XFER_T0_CPU',
    '3A': 'CMD_PID3',   '3B': 'CMD_PID2_N', '3Y': 'XFER_T1_CPU',
    '4A': 'RX_SAMPLE_EN_PRE', '4B': (mutant === 'enable_spacing_too_short') ? 'VCC' : 'DPLL_EDGE_REG_N', '4Y': 'RX_SAMPLE_EN_PRE_G'
  });
  sim.addChip('U262_FINAL_FF', '74LVC74A', 'Registered IN_CRC16_OUT & TX_OE_ACTIVE (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'IN_CRC16_OUT', '1Q': 'IN_CRC16_OUT_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'TX_OE_ACTIVE', '2Q': 'TX_OE_ACTIVE_REG'
  });
  sim.addChip('U263_ACK_OR', '74LVC32A', 'Direct ACK_WAIT_P01_N = ACK_P0 | ACK_P1 (9.8 ns)', {
    '1A': 'ACK_P0', '1B': 'ACK_P1', '1Y': 'ACK_WAIT_P01_N',
    '2A': 'GND', '2B': 'GND', '2Y': 'UNUSED_AO2',
    '3A': 'GND', '3B': 'GND', '3Y': 'UNUSED_AO3',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_AO4'
  });
  sim.addChip('U260_LAST_PIPE_FF', '74LVC74A', 'Registered EOP_OR_RESET & CRC16_Q15_N (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'EOP_OR_RESET', '1Q': 'EOP_OR_RESET_REG', '1Q_N': 'EOP_OR_RESET_REG_N',
    '2CLR_N': 'VCC',   '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'CRC16_Q15', '2Q': 'CRC16_Q15_R_UNUSED', '2Q_N': 'CRC16_Q15_N_REG'
  });
  sim.addChip('U261_STUFF_RST_FF', '74LVC74A', 'Registered STUFF_RST & ACK_NOT_WAIT (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'STUFF_RST',    '1Q': 'STUFF_RST_REG',
    '2CLR_N': 'VCC',   '2PRE_N': 'RST_N', '2CLK': 'CLK_48M', '2D': 'ACK_NOT_WAIT', '2Q': 'ACK_NOT_WAIT_REG'
  });
  sim.addChip('U254_MISC_PIPE_FF', '74LVC74A', 'Registered IN_CRC5_OUT & Glitch-Free NRZI_TX_RUN_REG (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'IN_CRC5_OUT', '1Q': 'IN_CRC5_OUT_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'NRZI_TX_RUN', '2Q': 'NRZI_TX_RUN_REG'
  });
  sim.addChip('U255_LMIS_PIPE_FF', '74LVC74A', 'Registered LMIS_03 & LMIS_47 for 1-cycle TX_LEN_DONE (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'LMIS_03', '1Q': 'LMIS_03_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'LMIS_47', '2Q': 'LMIS_47_REG'
  });
  sim.addChip('U256_RXZ_PIPE_FF', '74LVC74A', 'Registered RX_Z05 & RX_D6 for 1-cycle RX_ACTIVE_FAST (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'RX_Z05', '1Q': 'RX_Z05_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'RX_D6',  '2Q': 'RX_D6_REG_F'
  });
  sim.addChip('U257_CRC5_AND', '74LVC08A', 'Direct CRC5_INIT_RAW_N & RX_ACTIVE_FAST AND', {
    '1A': 'S_IDLE_N', '1B': 'S_TX_SYNC_N', '1Y': 'CRC5_INIT_N0',
    '2A': 'CRC5_INIT_N0', '2B': 'S_TX_PID_N', '2Y': 'CRC5_INIT_RAW_N',
    '3A': 'RX_SYNC_CAND', '3B': 'RX_Z06_F_N', '3Y': 'RX_ACTIVE_FAST',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_C5A4'
  });
  sim.addChip('U258_RXZ_OR_INV', '74LVC32A', 'RX_Z06_F OR gate for RX_ACTIVE_FAST', {
    '1A': 'RX_Z05_REG', '1B': 'RX_D6_REG_F', '1Y': 'RX_Z06_F',
    '2A': 'GND', '2B': 'GND', '2Y': 'UNUSED_RZO2',
    '3A': 'GND', '3B': 'GND', '3Y': 'UNUSED_RZO3',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_RZO4'
  });
  sim.addChip('U259_RXZ_INV', '74LVC04A', 'RX_Z06_F_N & STUFF_RST Inverters', {
    '1A': 'RX_Z06_F', '1Y': 'RX_Z06_F_N',
    '2A': 'STUFF_RST_N', '2Y': 'STUFF_RST',
    '3A': 'CMD_PID2', '3Y': 'CMD_PID2_N',
    '4A': 'CMD_PID3', '4Y': 'CMD_PID3_N',
    '5A': 'GND', '5Y': 'UNUSED_RZI5',
    '6A': 'GND', '6Y': 'UNUSED_RZI6'
  });
  sim.addChip('U241_FSM_PRE_FF', '74LVC574A', 'FSM Input Pipeline Stage 1 (IS_EOP_STATE, RX_SYNC partials)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'START_PENDING', D1: 'START_D1', D2: 'START_D2', D3: 'GND', D4: 'GND', D5: 'GND', D6: 'GND', D7: 'GND',
    Q0: 'START_D1', Q1: 'START_D2', Q2: 'START_D3', Q3: 'U241_U3', Q4: 'U241_U4', Q5: 'U241_U5', Q6: 'U241_U6', Q7: 'U241_U7'
  });
  sim.addChip('U242_FSM_ADDR_REG', '74LVC574A', 'FSM Input Pipeline Stage 2 (U35/U36 A6..A11 registered -> 17.0 ns SRAM stage)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'START_OR_SOF', D1: 'BYTE_DONE', D2: 'LEN_DONE_MUX', D3: 'RX_ACTIVE_FAST', D4: 'EOP_VALID', D5: 'FSM_ERR_OR_TO', D6: 'GND', D7: 'GND',
    Q0: 'FSM_A6_REG', Q1: 'FSM_A7_REG', Q2: 'FSM_A8_REG', Q3: 'FSM_A9_REG', Q4: 'FSM_A10_REG', Q5: 'FSM_A11_REG', Q6: 'U242_U6', Q7: 'U242_U7'
  });
  sim.addChip('U35_LUT_FSM_LO', 'IS61WV5128EDBLL', '10 ns Shadowed Next-State & TX Control LUT SRAM (Low Byte)', {
    A0: 'CUR_S0', A1: 'CUR_S1', A2: 'CUR_S2', A3: 'CUR_S3',
    A4: 'LAT_T0', A5: 'LAT_T1', A6: 'FSM_A6_REG', A7: 'FSM_A7_REG',
    A8: 'FSM_A8_REG', A9: 'FSM_A9_REG', A10: 'FSM_A10_REG', A11: 'FSM_A11_REG',
    CE_N: 'GND', OE_N: 'GND', WE_N: 'VCC',
    IO0: 'NXT_S0_RAW', IO1: 'NXT_S1_RAW', IO2: 'NXT_S2_RAW', IO3: 'NXT_S3_RAW',
    IO4: 'TX_OE_RAW', IO5: 'CTRL_SYNC', IO6: 'CTRL_PID', IO7: 'CTRL_DATA'
  }, fsmLoInit);
  sim.addChip('U36_LUT_FSM_HI', 'IS61WV5128EDBLL', '10 ns Shadowed Next-State & RX/Handshake Control LUT SRAM (High Byte)', {
    A0: 'CUR_S0', A1: 'CUR_S1', A2: 'CUR_S2', A3: 'CUR_S3',
    A4: 'LAT_T0', A5: 'LAT_T1', A6: 'FSM_A6_REG', A7: 'FSM_A7_REG',
    A8: 'FSM_A8_REG', A9: 'FSM_A9_REG', A10: 'FSM_A10_REG', A11: 'FSM_A11_REG',
    CE_N: 'GND', OE_N: 'GND', WE_N: 'VCC',
    IO0: 'CTRL_CRC', IO1: 'CTRL_EOP', IO2: 'CTRL_RX_EN_RAW', IO3: 'CTRL_BUF_WE',
    IO4: 'CTRL_CRC_CHK', IO5: 'CTRL_TURN_EN_RAW', IO6: 'CTRL_AUTO_ACK', IO7: 'XFER_DONE_RAW'
  }, fsmHiInit);
  sim.addChip('U216_FSM_LUT_REG', '74LVC574A', 'Registered U35/U36 FSM LUT Outputs on CLK_48M (breaks SRAM->logic->FF chain)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'NXT_S0_RAW', D1: 'NXT_S1_RAW', D2: 'NXT_S2_RAW', D3: 'NXT_S3_RAW',
    D4: 'TX_OE_RAW',  D5: 'CTRL_RX_EN_RAW', D6: 'CTRL_TURN_EN_RAW', D7: 'XFER_DONE_RAW',
    Q0: 'NXT_S0',     Q1: 'NXT_S1',     Q2: 'NXT_S2',     Q3: 'NXT_S3',
    Q4: 'TX_OE',      Q5: 'CTRL_RX_EN', Q6: 'CTRL_TURN_EN', Q7: 'XFER_DONE'
  });
  sim.addChip('U37_LUT_PID', 'IS61WV5128EDBLL', '10 ns Shadowed PID Complement & Category Decode LUT SRAM', {
    A0: 'RX_D0', A1: 'RX_D1', A2: 'RX_D2', A3: 'RX_D3',
    A4: 'RX_D4', A5: 'RX_D5', A6: 'RX_D6', A7: 'RX_D7',
    A8: 'GND', A9: 'GND', A10: 'GND', A11: 'GND',
    CE_N: 'GND', OE_N: 'GND', WE_N: 'VCC',
    IO0: 'PID_VALID', IO1: 'PID_IS_TOK', IO2: 'PID_IS_DAT', IO3: 'PID_IS_HS',
    IO4: 'PID_C0', IO5: 'PID_C1', IO6: 'PID_C2', IO7: 'PID_C3'
  }, pidLut);
  sim.addChip('U38_BOOT_FLASH', 'SST39SF040', 'Power-Up Table Image Parallel Flash (Copied to U35..U37, U52..U53 at Reset)', {
    A0: 'CUR_S0', A1: 'CUR_S1', A2: 'CUR_S2', A3: 'CUR_S3',
    A4: 'LAT_T0', A5: 'LAT_T1', A6: 'FSM_A6_REG', A7: 'FSM_A7_REG',
    A8: 'FSM_A8_REG', A9: 'FSM_A9_REG', A10: 'FSM_A10_REG', A11: 'FSM_A11_REG',
    CE_N: 'RST_N', OE_N: 'RST_N', WE_N: 'VCC',
    DQ0: 'FL_D0', DQ1: 'FL_D1', DQ2: 'FL_D2', DQ3: 'FL_D3',
    DQ4: 'FL_D4', DQ5: 'FL_D5', DQ6: 'FL_D6', DQ7: 'FL_D7'
  }, fsmLoInit);
  sim.addChip('U52_LUT_TX_HDR', 'IS61WV5128EDBLL', '10 ns Shadowed TX Header & Transfer Category LUT SRAM', {
    A0: 'CUR_S0', A1: 'CUR_S1', A2: 'CUR_S2', A3: 'CUR_S3',
    A4: 'BIT_Q0', A5: 'BIT_Q1', A6: 'BIT_Q2', A7: 'HDR_PID_R0',
    A8: 'HDR_PID_R1', A9: 'HDR_PID_R2', A10: 'HDR_PID_R3', A11: 'CMD_TOGGLE',
    CE_N: 'GND', OE_N: 'GND', WE_N: 'VCC',
    IO0: 'TX_HDR_BIT', IO1: 'XFER_T0_RAW', IO2: 'XFER_T1_RAW', IO3: 'IS_HDR_STATE',
    IO4: 'IS_EOP_STATE_UNUSED', IO5: 'HDR_U5', IO6: 'HDR_U6', IO7: 'HDR_U7'
  }, hdrLut);
  sim.addChip('U53_LUT_SERIAL_CRC', 'IS61WV5128EDBLL', '10 ns Shadowed Bit-Serializer & CRC-16 Residual Helper SRAM', {
    A0: 'SER_BYTE_R0', A1: 'SER_BYTE_R1', A2: 'SER_BYTE_R2', A3: 'SER_BYTE_R3',
    A4: 'SER_BYTE_R4', A5: 'SER_BYTE_R5', A6: 'SER_BYTE_R6', A7: 'SER_BYTE_R7',
    A8: 'BIT_Q0', A9: 'BIT_Q1', A10: 'BIT_Q2', A11: 'GND',
    CE_N: 'GND', OE_N: 'GND', WE_N: 'VCC',
    IO0: 'SER_BIT_OUT', IO1: 'SER_U1', IO2: 'SER_U2', IO3: 'SER_U3',
    IO4: 'SER_U4', IO5: 'SER_U5', IO6: 'SER_U6', IO7: 'SER_U7'
  }, serLut);

  // =========================================================================
  // 8. Dual-Bank 16-Bit Packet Buffer SRAM & Address Counters (U39..U42, U104..U109)
  // =========================================================================
  const bufCarryNet = (mutant === 'buf_addr_carry_broken') ? 'GND' : 'BA_TC0';
  sim.addChip('U39_BUF_ADDR_LO', '74LVC161', 'Packet Buffer SRAM Word Address Counter Low Nibble', {
    MR_N: 'BUF_ADDR_RST_N', CP: 'SEL_DAT_DLY', PE_N: 'BUF_LOAD_N', CEP: 'VCC', CET: 'VCC',
    D0: 'BUS_D0', D1: 'BUS_D1', D2: 'BUS_D2', D3: 'BUS_D3',
    Q0: 'BA0', Q1: 'BA1', Q2: 'BA2', Q3: 'BA3', TC: 'BA_TC0'
  });
  sim.addChip('U40_BUF_ADDR_HI', '74LVC161', 'Packet Buffer SRAM Word Address Counter High Nibble', {
    MR_N: 'BUF_ADDR_RST_N', CP: 'SEL_DAT_DLY', PE_N: 'BUF_LOAD_N', CEP: bufCarryNet, CET: bufCarryNet,
    D0: 'BUS_D4', D1: 'BUS_D5', D2: 'BUS_D6', D3: 'BUS_D7',
    Q0: 'BA4', Q1: 'BA5', Q2: 'BA6', Q3: 'BA7', TC: 'BA_TC1'
  });
  sim.addChip('U104_BUF_ADR_MUX_LO', '74LVC157A', 'Buffer SRAM Address Mux Bits 3:0 (CPU BA vs SIE BCNT[4:1])', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BA0', '1I1': 'SIE_BCNT1', '1Y': 'BUF_A0',
    '2I0': 'BA1', '2I1': 'SIE_BCNT2', '2Y': 'BUF_A1',
    '3I0': 'BA2', '3I1': 'SIE_BCNT3', '3Y': 'BUF_A2',
    '4I0': 'BA3', '4I1': 'SIE_BCNT4', '4Y': 'BUF_A3'
  });
  sim.addChip('U105_BUF_ADR_MUX_HI', '74LVC157A', 'Buffer SRAM Address Mux Bits 7:4 (CPU BA vs SIE BCNT[7:5])', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BA4', '1I1': 'SIE_BCNT5', '1Y': 'BUF_A4',
    '2I0': 'BA5', '2I1': 'SIE_BCNT6', '2Y': 'BUF_A5',
    '3I0': 'BA6', '3I1': 'SIE_BCNT7', '3Y': 'BUF_A6',
    '4I0': 'BA7', '4I1': 'GND',       '4Y': 'BUF_A7'
  });
  sim.addChip('U106_BUF_DIN_LO0', '74LVC157A', 'Buffer SRAM Low-Bank Write Data Mux Bits 3:0', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BUS_D0', '1I1': 'RX_D0', '1Y': 'BUF_DIN_LO0',
    '2I0': 'BUS_D1', '2I1': 'RX_D1', '2Y': 'BUF_DIN_LO1',
    '3I0': 'BUS_D2', '3I1': 'RX_D2', '3Y': 'BUF_DIN_LO2',
    '4I0': 'BUS_D3', '4I1': 'RX_D3', '4Y': 'BUF_DIN_LO3'
  });
  sim.addChip('U107_BUF_DIN_LO1', '74LVC157A', 'Buffer SRAM Low-Bank Write Data Mux Bits 7:4', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BUS_D4', '1I1': 'RX_D4', '1Y': 'BUF_DIN_LO4',
    '2I0': 'BUS_D5', '2I1': 'RX_D5', '2Y': 'BUF_DIN_LO5',
    '3I0': 'BUS_D6', '3I1': 'RX_D6', '3Y': 'BUF_DIN_LO6',
    '4I0': 'BUS_D7', '4I1': 'RX_D7', '4Y': 'BUF_DIN_LO7'
  });
  sim.addChip('U108_BUF_DIN_HI0', '74LVC157A', 'Buffer SRAM High-Bank Write Data Mux Bits 3:0', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BUS_D8',  '1I1': 'RX_D0', '1Y': 'BUF_DIN_HI0',
    '2I0': 'BUS_D9',  '2I1': 'RX_D1', '2Y': 'BUF_DIN_HI1',
    '3I0': 'BUS_D10', '3I1': 'RX_D2', '3Y': 'BUF_DIN_HI2',
    '4I0': 'BUS_D11', '4I1': 'RX_D3', '4Y': 'BUF_DIN_HI3'
  });
  sim.addChip('U109_BUF_DIN_HI1', '74LVC157A', 'Buffer SRAM High-Bank Write Data Mux Bits 7:4', {
    S: 'SIE_BUF_BUSY', G_N: 'GND',
    '1I0': 'BUS_D12', '1I1': 'RX_D4', '1Y': 'BUF_DIN_HI4',
    '2I0': 'BUS_D13', '2I1': 'RX_D5', '2Y': 'BUF_DIN_HI5',
    '3I0': 'BUS_D14', '3I1': 'RX_D6', '3Y': 'BUF_DIN_HI6',
    '4I0': 'BUS_D15', '4I1': 'RX_D7', '4Y': 'BUF_DIN_HI7'
  });
  sim.addChip('U41_BUF_SRAM_LO', 'IS61WV5128EDBLL', '10 ns Packet Data Buffer SRAM Low Byte (Even Bytes)', {
    A0: 'BUF_A0', A1: 'BUF_A1', A2: 'BUF_A2', A3: 'BUF_A3', A4: 'BUF_A4', A5: 'BUF_A5', A6: 'BUF_A6', A7: 'BUF_A7',
    A8: 'GND', A9: 'GND', A10: 'GND', A11: 'GND',
    CE_N: 'GND', OE_N: 'BUF_OE_N', WE_N: 'BUF_WE_LO_N',
    D0: 'BUF_DIN_LO0', D1: 'BUF_DIN_LO1', D2: 'BUF_DIN_LO2', D3: 'BUF_DIN_LO3',
    D4: 'BUF_DIN_LO4', D5: 'BUF_DIN_LO5', D6: 'BUF_DIN_LO6', D7: 'BUF_DIN_LO7',
    IO0: 'BD0', IO1: 'BD1', IO2: 'BD2', IO3: 'BD3', IO4: 'BD4', IO5: 'BD5', IO6: 'BD6', IO7: 'BD7'
  });
  sim.addChip('U42_BUF_SRAM_HI', 'IS61WV5128EDBLL', '10 ns Packet Data Buffer SRAM High Byte (Odd Bytes)', {
    A0: 'BUF_A0', A1: 'BUF_A1', A2: 'BUF_A2', A3: 'BUF_A3', A4: 'BUF_A4', A5: 'BUF_A5', A6: 'BUF_A6', A7: 'BUF_A7',
    A8: 'GND', A9: 'GND', A10: 'GND', A11: 'GND',
    CE_N: 'GND', OE_N: 'BUF_OE_N', WE_N: 'BUF_WE_HI_N',
    D0: 'BUF_DIN_HI0', D1: 'BUF_DIN_HI1', D2: 'BUF_DIN_HI2', D3: 'BUF_DIN_HI3',
    D4: 'BUF_DIN_HI4', D5: 'BUF_DIN_HI5', D6: 'BUF_DIN_HI6', D7: 'BUF_DIN_HI7',
    IO0: 'BD8', IO1: 'BD9', IO2: 'BD10', IO3: 'BD11', IO4: 'BD12', IO5: 'BD13', IO6: 'BD14', IO7: 'BD15'
  });

  // =========================================================================
  // 9. Backplane 16-Bit CPU Port Decode, Latches & Tri-State Readback
  // =========================================================================
  const decY0 = (mutant === 'reg_dec_swapped') ? 'SEL_TGT_N' : 'SEL_CSR_N';
  const decY1 = (mutant === 'reg_dec_swapped') ? 'SEL_CSR_N' : 'SEL_TGT_N';
  sim.addChip('U43_IO_DEC', '74LVC138A', 'Backplane I/O Port Address Decoder (Ports 0x00..0x06)', {
    A: 'PORT_A0', B: 'PORT_A1', C: 'PORT_A2', G2A_N: 'IO_CS_N', G2B_N: 'GND', G1: 'VCC',
    Y0_N: decY0, Y1_N: decY1, Y2_N: 'SEL_LEN_N', Y3_N: 'SEL_DAT_N',
    Y4_N: 'SEL_FRM_N', Y5_N: 'SEL_PTR_N', Y6_N: 'SEL_DIA_N', Y7_N: 'SEL_RSV_N'
  });
  // Synchronous CLK_48M CPU register hold muxes (single clock domain — eliminates async CPU-write setup violations)
  sim.addChip('U265_CMD_M0', '74LVC157A', 'CPU CMD_LO Hold Mux 0', { S: 'WR_CSR_STB', G_N: 'GND', '1I0': 'CMD_PID0', '1I1': 'BUS_D0', '1Y': 'D_CMD0', '2I0': 'CMD_PID1', '2I1': 'BUS_D1', '2Y': 'D_CMD1', '3I0': 'CMD_PID2', '3I1': 'BUS_D2', '3Y': 'D_CMD2', '4I0': 'CMD_PID3', '4I1': 'BUS_D3', '4Y': 'D_CMD3' });
  sim.addChip('U266_CMD_M1', '74LVC157A', 'CPU CMD_LO Hold Mux 1', { S: 'WR_CSR_STB', G_N: 'GND', '1I0': 'CMD_TOGGLE', '1I1': 'BUS_D4', '1Y': 'D_CMD4', '2I0': 'CMD_AUTO_ACK', '2I1': 'BUS_D5', '2Y': 'D_CMD5', '3I0': 'AUTO_SOF_EN', '3I1': 'BUS_D6', '3Y': 'D_CMD6', '4I0': 'SPEED_LS', '4I1': 'BUS_D7', '4Y': 'D_CMD7' });
  sim.addChip('U267_CMD_M2', '74LVC157A', 'CPU CMD_HI Hold Mux 0', { S: 'WR_CSR_STB', G_N: 'GND', '1I0': 'CMD_START', '1I1': 'BUS_D8', '1Y': 'D_CMD8', '2I0': 'CMD_BUS_RESET', '2I1': 'BUS_D9', '2Y': 'D_CMD9', '3I0': 'CMD_CLR_IRQ', '3I1': 'BUS_D10', '3Y': 'D_CMD10', '4I0': 'CMD_BUF_RST', '4I1': 'BUS_D11', '4Y': 'D_CMD11' });
  sim.addChip('U268_CMD_M3', '74LVC157A', 'CPU CMD_HI Hold Mux 1', { S: 'WR_CSR_STB', G_N: 'GND', '1I0': 'IRQ_EN', '1I1': 'BUS_D12', '1Y': 'D_CMD12', '2I0': 'CMD_U5', '2I1': 'BUS_D13', '2Y': 'D_CMD13', '3I0': 'CMD_U6', '3I1': 'BUS_D14', '3Y': 'D_CMD14', '4I0': 'CMD_U7', '4I1': 'BUS_D15', '4Y': 'D_CMD15' });
  sim.addChip('U269_TGT_M0', '74LVC157A', 'CPU TGT_LO Hold Mux 0', { S: 'WR_TGT_STB', G_N: 'GND', '1I0': 'ADDR0', '1I1': 'BUS_D0', '1Y': 'D_TGT0', '2I0': 'ADDR1', '2I1': 'BUS_D1', '2Y': 'D_TGT1', '3I0': 'ADDR2', '3I1': 'BUS_D2', '3Y': 'D_TGT2', '4I0': 'ADDR3', '4I1': 'BUS_D3', '4Y': 'D_TGT3' });
  sim.addChip('U270_TGT_M1', '74LVC157A', 'CPU TGT_LO Hold Mux 1', { S: 'WR_TGT_STB', G_N: 'GND', '1I0': 'ADDR4', '1I1': 'BUS_D4', '1Y': 'D_TGT4', '2I0': 'ADDR5', '2I1': 'BUS_D5', '2Y': 'D_TGT5', '3I0': 'ADDR6', '3I1': 'BUS_D6', '3Y': 'D_TGT6', '4I0': 'ENDP0', '4I1': 'BUS_D7', '4Y': 'D_TGT7' });
  sim.addChip('U271_TGT_M2', '74LVC157A', 'CPU TGT_HI Hold Mux 0', { S: 'WR_TGT_STB', G_N: 'GND', '1I0': 'ENDP1', '1I1': 'BUS_D8', '1Y': 'D_TGT8', '2I0': 'ENDP2', '2I1': 'BUS_D9', '2Y': 'D_TGT9', '3I0': 'ENDP3', '3I1': 'BUS_D10', '3Y': 'D_TGT10', '4I0': 'TGT_U3', '4I1': 'BUS_D11', '4Y': 'D_TGT11' });
  sim.addChip('U272_LEN_M0', '74LVC157A', 'CPU TXLEN Hold Mux 0',  { S: 'WR_LEN_STB', G_N: 'GND', '1I0': 'TXLEN0', '1I1': 'BUS_D0', '1Y': 'D_LEN0', '2I0': 'TXLEN1', '2I1': 'BUS_D1', '2Y': 'D_LEN1', '3I0': 'TXLEN2', '3I1': 'BUS_D2', '3Y': 'D_LEN2', '4I0': 'TXLEN3', '4I1': 'BUS_D3', '4Y': 'D_LEN3' });
  sim.addChip('U273_LEN_M1', '74LVC157A', 'CPU TXLEN Hold Mux 1',  { S: 'WR_LEN_STB', G_N: 'GND', '1I0': 'TXLEN4', '1I1': 'BUS_D4', '1Y': 'D_LEN4', '2I0': 'TXLEN5', '2I1': 'BUS_D5', '2Y': 'D_LEN5', '3I0': 'TXLEN6', '3I1': 'BUS_D6', '3Y': 'D_LEN6', '4I0': 'TXLEN7', '4I1': 'BUS_D7', '4Y': 'D_LEN7' });
  sim.addChip('U44_REG_CMD_LO', '74LVC574A', 'SIE Command Register Low Byte on CLK_48M (Port 0x00 bits 7:0)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'D_CMD0', D1: 'D_CMD1', D2: 'D_CMD2', D3: 'D_CMD3',
    D4: 'D_CMD4', D5: 'D_CMD5', D6: 'D_CMD6', D7: 'D_CMD7',
    Q0: 'CMD_PID0', Q1: 'CMD_PID1', Q2: 'CMD_PID2', Q3: 'CMD_PID3',
    Q4: 'CMD_TOGGLE', Q5: 'CMD_AUTO_ACK', Q6: 'AUTO_SOF_EN', Q7: 'SPEED_LS'
  });
  sim.addChip('U49_REG_CMD_HI', '74LVC574A', 'SIE Command Register High Byte on CLK_48M (Port 0x00 bits 15:8)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'D_CMD8', D1: 'D_CMD9', D2: 'D_CMD10', D3: 'D_CMD11',
    D4: 'D_CMD12', D5: 'D_CMD13', D6: 'D_CMD14', D7: 'D_CMD15',
    Q0: 'CMD_START', Q1: 'CMD_BUS_RESET', Q2: 'CMD_CLR_IRQ', Q3: 'CMD_BUF_RST',
    Q4: 'IRQ_EN', Q5: 'CMD_U5', Q6: 'CMD_U6', Q7: 'CMD_U7'
  });
  sim.addChip('U45_REG_TARGET_LO', '74LVC574A', 'USB Device Address & Endpoint[0] on CLK_48M (Port 0x01 bits 7:0)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'D_TGT0', D1: 'D_TGT1', D2: 'D_TGT2', D3: 'D_TGT3',
    D4: 'D_TGT4', D5: 'D_TGT5', D6: 'D_TGT6', D7: 'D_TGT7',
    Q0: 'ADDR0', Q1: 'ADDR1', Q2: 'ADDR2', Q3: 'ADDR3',
    Q4: 'ADDR4', Q5: 'ADDR5', Q6: 'ADDR6', Q7: 'ENDP0'
  });
  sim.addChip('U50_REG_TARGET_HI', '74LVC574A', 'USB Endpoint[3:1] on CLK_48M (Port 0x01 bits 15:8)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'D_TGT8', D1: 'D_TGT9', D2: 'D_TGT10', D3: 'D_TGT11',
    D4: 'GND', D5: 'GND', D6: 'GND', D7: 'GND',
    Q0: 'ENDP1', Q1: 'ENDP2', Q2: 'ENDP3', Q3: 'TGT_U3',
    Q4: 'TGT_U4', Q5: 'TGT_U5', Q6: 'TGT_U6', Q7: 'TGT_U7'
  });
  sim.addChip('U51_REG_TXLEN0', '74LVC74A', 'TX Payload Length Register Bits 1:0 on CLK_48M (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'D_LEN0', '1Q': 'TXLEN0',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'D_LEN1', '2Q': 'TXLEN1'
  });
  sim.addChip('U51_REG_TXLEN1', '74LVC74A', 'TX Payload Length Register Bits 3:2 on CLK_48M (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'D_LEN2', '1Q': 'TXLEN2',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'D_LEN3', '2Q': 'TXLEN3'
  });
  sim.addChip('U51_REG_TXLEN2', '74LVC74A', 'TX Payload Length Register Bits 5:4 on CLK_48M (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'D_LEN4', '1Q': 'TXLEN4',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'D_LEN5', '2Q': 'TXLEN5'
  });
  sim.addChip('U51_REG_TXLEN3', '74LVC74A', 'TX Payload Length Register Bits 7:6 on CLK_48M (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'D_LEN6', '1Q': 'TXLEN6',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'D_LEN7', '2Q': 'TXLEN7'
  });
  sim.addChip('U46_BUS_XCVR_LO', '74LVC245A', 'Backplane 16-Bit Data Bus Transceiver Low Byte', {
    DIR: 'IO_RD_N', OE_N: 'IO_CS_N',
    A1: 'PORT_D0', A2: 'PORT_D1', A3: 'PORT_D2', A4: 'PORT_D3',
    A5: 'PORT_D4', A6: 'PORT_D5', A7: 'PORT_D6', A8: 'PORT_D7',
    B1: 'BUS_D0', B2: 'BUS_D1', B3: 'BUS_D2', B4: 'BUS_D3',
    B5: 'BUS_D4', B6: 'BUS_D5', B7: 'BUS_D6', B8: 'BUS_D7'
  });
  sim.addChip('U47_BUS_XCVR_HI', '74LVC245A', 'Backplane 16-Bit Data Bus Transceiver High Byte', {
    DIR: 'IO_RD_N', OE_N: 'IO_CS_N',
    A1: 'PORT_D8', A2: 'PORT_D9', A3: 'PORT_D10', A4: 'PORT_D11',
    A5: 'PORT_D12', A6: 'PORT_D13', A7: 'PORT_D14', A8: 'PORT_D15',
    B1: 'BUS_D8', B2: 'BUS_D9', B3: 'BUS_D10', B4: 'BUS_D11',
    B5: 'BUS_D12', B6: 'BUS_D13', B7: 'BUS_D14', B8: 'BUS_D15'
  });
  sim.addChip('U63_RD_CSR_LO', '74LVC245A', 'CSR Status Readback Buffer Low Byte', {
    DIR: 'VCC', OE_N: 'RD_CSR_N',
    A1: 'SIE_BUSY', A2: 'DONE_LATCHED', A3: 'ERR_TIMEOUT_LAT', A4: 'ERR_CRC_LAT',
    A5: 'ERR_STUFF_LAT', A6: 'ATTACHED_SENSE', A7: 'LS_ATTACH_SENSE', A8: 'SOF_SENT_LAT',
    B1: 'BUS_D0', B2: 'BUS_D1', B3: 'BUS_D2', B4: 'BUS_D3',
    B5: 'BUS_D4', B6: 'BUS_D5', B7: 'BUS_D6', B8: 'BUS_D7'
  });
  sim.addChip('U64_RD_CSR_HI', '74LVC245A', 'CSR Status Readback Buffer High Byte', {
    DIR: 'VCC', OE_N: 'RD_CSR_N',
    A1: 'LAST_PID0', A2: 'LAST_PID1', A3: 'LAST_PID2', A4: 'LAST_PID3',
    A5: 'TOGGLE_OK_LAT', A6: 'IRQ', A7: 'CMD_BUS_RESET', A8: 'SPEED_LS',
    B1: 'BUS_D8', B2: 'BUS_D9', B3: 'BUS_D10', B4: 'BUS_D11',
    B5: 'BUS_D12', B6: 'BUS_D13', B7: 'BUS_D14', B8: 'BUS_D15'
  });
  sim.addChip('U110_RD_LEN_LO', '74LVC245A', 'RX Length Readback Buffer Low Byte (Port 0x02)', {
    DIR: 'VCC', OE_N: 'RD_LEN_N',
    A1: 'RDLEN0', A2: 'RDLEN1', A3: 'RDLEN2', A4: 'RDLEN3',
    A5: 'RDLEN4', A6: 'RDLEN5', A7: 'RDLEN6', A8: 'RDLEN7',
    B1: 'BUS_D0', B2: 'BUS_D1', B3: 'BUS_D2', B4: 'BUS_D3',
    B5: 'BUS_D4', B6: 'BUS_D5', B7: 'BUS_D6', B8: 'BUS_D7'
  });
  sim.addChip('U111_RD_LEN_HI', '74LVC245A', 'RX Length Readback Buffer High Byte (Port 0x02)', {
    DIR: 'VCC', OE_N: 'RD_LEN_N',
    A1: 'GND', A2: 'GND', A3: 'GND', A4: 'GND',
    A5: 'GND', A6: 'GND', A7: 'GND', A8: 'GND',
    B1: 'BUS_D8', B2: 'BUS_D9', B3: 'BUS_D10', B4: 'BUS_D11',
    B5: 'BUS_D12', B6: 'BUS_D13', B7: 'BUS_D14', B8: 'BUS_D15'
  });
  sim.addChip('U65_RD_FRM_LO', '74LVC245A', 'Frame Number Readback Buffer Low Byte', {
    DIR: 'VCC', OE_N: 'RD_FRM_N',
    A1: 'FN0', A2: 'FN1', A3: 'FN2', A4: 'FN3',
    A5: 'FN4', A6: 'FN5', A7: 'FN6', A8: 'FN7',
    B1: 'BUS_D0', B2: 'BUS_D1', B3: 'BUS_D2', B4: 'BUS_D3',
    B5: 'BUS_D4', B6: 'BUS_D5', B7: 'BUS_D6', B8: 'BUS_D7'
  });
  sim.addChip('U66_RD_FRM_HI', '74LVC245A', 'Frame Number Readback Buffer High Byte', {
    DIR: 'VCC', OE_N: 'RD_FRM_N',
    A1: 'FN8', A2: 'FN9', A3: 'FN10', A4: 'GND',
    A5: 'GND', A6: 'GND', A7: 'GND', A8: 'GND',
    B1: 'BUS_D8', B2: 'BUS_D9', B3: 'BUS_D10', B4: 'BUS_D11',
    B5: 'BUS_D12', B6: 'BUS_D13', B7: 'BUS_D14', B8: 'BUS_D15'
  });
  sim.addChip('U67_RD_DAT_LO', '74LVC245A', 'Buffer SRAM Readback Low Byte', {
    DIR: 'VCC', OE_N: 'RD_DAT_N',
    A1: 'BD0', A2: 'BD1', A3: 'BD2', A4: 'BD3',
    A5: 'BD4', A6: 'BD5', A7: 'BD6', A8: 'BD7',
    B1: 'BUS_D0', B2: 'BUS_D1', B3: 'BUS_D2', B4: 'BUS_D3',
    B5: 'BUS_D4', B6: 'BUS_D5', B7: 'BUS_D6', B8: 'BUS_D7'
  });
  sim.addChip('U68_RD_DAT_HI', '74LVC245A', 'Buffer SRAM Readback High Byte', {
    DIR: 'VCC', OE_N: 'RD_DAT_N',
    A1: 'BD8', A2: 'BD9', A3: 'BD10', A4: 'BD11',
    A5: 'BD12', A6: 'BD13', A7: 'BD14', A8: 'BD15',
    B1: 'BUS_D8', B2: 'BUS_D9', B3: 'BUS_D10', B4: 'BUS_D11',
    B5: 'BUS_D12', B6: 'BUS_D13', B7: 'BUS_D14', B8: 'BUS_D15'
  });

  // =========================================================================
  // 10. Glue Logic, Clock-Enable Combines, Auto-ACK, CRC-16 Check & Error Latches
  // =========================================================================
  sim.addChip('U48_GLUE_OR', '74LVC32A', 'Port Write Strobe OR Gates', {
    '1A': 'SEL_CSR_N', '1B': 'IO_WR_N', '1Y': 'WR_CSR_N',
    '2A': 'SEL_TGT_N', '2B': 'IO_WR_N', '2Y': 'WR_TGT_N',
    '3A': 'SEL_LEN_N', '3B': 'IO_WR_N', '3Y': 'WR_LEN_N',
    '4A': 'SEL_DAT_N', '4B': 'IO_WR_N', '4Y': 'CPU_WR_DAT_N'
  });
  sim.addChip('U69_RD_OR', '74LVC32A', 'Port Read Strobe OR Gates', {
    '1A': 'SEL_CSR_N', '1B': 'IO_RD_N', '1Y': 'RD_CSR_N',
    '2A': 'SEL_FRM_N', '2B': 'IO_RD_N', '2Y': 'RD_FRM_N',
    '3A': 'SEL_DAT_N', '3B': 'IO_RD_N', '3Y': 'RD_DAT_N',
    '4A': 'START_D3', '4B': 'SOF_ACTIVE', '4Y': 'START_OR_SOF'
  });
  sim.addChip('U112_GLUE_OR2', '74LVC32A', 'Secondary Control OR Gates', {
    '1A': 'SEL_LEN_N', '1B': 'IO_RD_N', '1Y': 'RD_LEN_N',
    '2A': 'SEL_PTR_N', '2B': 'IO_WR_N', '2Y': 'BUF_LOAD_N',
    '3A': 'IS_EOP_ACTIVE', '3B': 'CMD_BUS_RESET', '3Y': 'EOP_OR_RESET',
    '4A': 'TX_OE_ACTIVE', '4B': 'CMD_BUS_RESET', '4Y': 'TX_OE_PIN'
  });
  sim.addChip('U54_STROBE_INV', '74LVC04A', 'Active-High Strobe & Polarity Inverters', {
    '1A': 'WR_CSR_N', '1Y': 'WR_CSR_STB',
    '2A': 'WR_TGT_N', '2Y': 'WR_TGT_STB',
    '3A': 'WR_LEN_N', '3Y': 'WR_LEN_STB',
    '4A': 'DP_SYNC',  '4Y': 'DP_IN_N',
    '5A': 'SOF_1MS_TICK', '5Y': 'SOF_RELOAD_N',
    '6A': 'BYTE_DONE', '6Y': 'BYTE_DONE_N'
  });
  sim.addChip('U55_INV2', '74LVC04A', 'Secondary Control Inverters', {
    '1A': 'SPEED_LS', '1Y': 'SPEED_FS',
    '2A': 'DM_SYNC',  '2Y': 'DM_IN_N',
    '3A': 'SIE_BUSY', '3Y': 'SIE_BUSY_N',
    '4A': 'TX_LEN_NOT_DONE', '4Y': 'TX_LEN_DONE',
    '5A': 'GND', '5Y': 'UNUSED_I2_5',
    '6A': 'GND', '6Y': 'UNUSED_I2_6'
  });
  sim.addChip('U113_INV3', '74LVC04A', 'CRC & RX Helper Inverters', {
    '1A': 'RX_Z06', '1Y': 'RX_Z06_N',
    '2A': 'GND', '2Y': 'UNUSED_C5Q4N_DUP',
    '3A': 'IN_CRC5_OUT', '3Y': 'NOT_CRC5_OUT',
    '4A': 'IN_CRC16_OUT', '4Y': 'NOT_CRC16_OUT',
    '5A': 'CMD_BUS_RESET', '5Y': 'CMD_BUS_RESET_N',
    '6A': 'GND', '6Y': 'UNUSED_TOG_INV6'
  });
  sim.addChip('U114_INV4', '74LVC04A', 'Buffer & Phase Control Inverters', {
    '1A': 'SIE_BCNT0', '1Y': 'SIE_BCNT0_N',
    '2A': 'GND', '2Y': 'UNUSED_ACKW_INV',
    '3A': 'CPU_WR_DAT_N', '3Y': 'CPU_WR_DAT',
    '4A': 'RD_DAT_N', '4Y': 'CPU_RD_DAT',
    '5A': 'ACK_NOT_WAIT', '5Y': 'ACK_WAIT_PHASE',
    '6A': 'RX_EOP_VALID', '6Y': 'RX_EOP_VALID_N'
  });

  sim.addChip('U212_SOF_GUARD_INV', '74LVC04A', 'IS_SOF_XFER_N & CPU_START_CLR_N Inverters', {
    '1A': 'IS_SOF_XFER', '1Y': 'IS_SOF_XFER_N',
    '2A': 'CPU_XFER_BUSY', '2Y': 'CPU_START_CLR_N',
    '3A': 'CUR_S3', '3Y': 'CUR_S3_N',
    '4A': 'CUR_S2', '4Y': 'CUR_S2_N',
    '5A': 'GND', '5Y': 'UNUSED_EOP_INV5',
    '6A': 'GND', '6Y': 'UNUSED_DEOP_INV6'
  });
  sim.addChip('U213_SOF_GUARD_AND', '74LVC08A', 'Guard DONE_SET and CPU START_PENDING Against SOF', {
    '1A': 'XFER_DONE', '1B': 'IS_SOF_XFER_N', '1Y': 'DONE_SET_GATED',
    '2A': 'S_TX_PID',  '2B': 'IS_SOF_XFER_N', '2Y': 'CPU_XFER_BUSY',
    '3A': 'SE0_FIRST_EN', '3B': 'RX_DAT_ACTIVE', '3Y': 'CRC_CHK_EN',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_SGA4'
  });
  sim.addChip('U58_START_FF', '74LVC74A', 'Transaction Start & SOF Pending Synchronizer Flip-Flops', {
    '1CLR_N': 'CPU_START_CLR_N', '1PRE_N': 'VCC', '1CLK': 'WR_CSR_STB', '1D': 'BUS_D8', '1Q': 'START_PENDING',
    '2CLR_N': 'START_CLR_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'SOF_PEND_NXT', '2Q': 'SOF_PENDING'
  });

  const ackDelayBit = (mutant === 'auto_ack_late') ? 'ACK_DLY_TC' : 'ACK_DLY_Q1';
  sim.addChip('U59_ACK_DLY_CNT', '74LVC161', 'Auto-ACK Turnaround Delay Counter on CLK_48M', {
    MR_N: 'S_AUTO_ACK', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'ACK_DLY_EN', CET: 'ACK_DLY_EN',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'ACK_DLY_Q0', Q1: 'ACK_DLY_Q1', Q2: 'ACK_DLY_Q2', Q3: 'ACK_DLY_Q3', TC: 'ACK_DLY_TC'
  });
  sim.addChip('U115_ACK_PHASE_CNT', '74LVC161', 'Auto-ACK Phase Counter on CLK_48M', {
    MR_N: 'S_AUTO_ACK', CP: 'CLK_48M', PE_N: 'VCC', CEP: 'ACK_PHASE_EN', CET: 'ACK_PHASE_EN',
    D0: 'GND', D1: 'GND', D2: 'GND', D3: 'GND',
    Q0: 'ACK_P0', Q1: 'ACK_P1', Q2: 'ACK_P2', Q3: 'ACK_P3', TC: 'ACK_PTC'
  });
  sim.addChip('U60_ACK_GATE', '74LVC08A', 'Auto-ACK Fire Gate & Error Combine AND Gates', {
    '1A': 'ACK_WAIT_PHASE', '1B': ackDelayBit, '1Y': 'AUTO_ACK_FIRE',
    '2A': 'TURN_TIMEOUT', '2B': 'CTRL_TURN_EN', '2Y': 'ERR_TIMEOUT_CMB',
    '3A': 'RX_STUFF_ARM_REG', '3B': 'NRZI_RX_BIT', '3Y': 'ERR_STUFF_CMB',
    '4A': 'DM_IN', '4B': 'DP_IN_N', '4Y': 'LS_ATTACH_SENSE'
  });
  sim.addChip('U70_STATUS_FF', '74LVC74A', 'DONE & SOF_SENT Status Flip-Flops', {
    '1CLR_N': 'WR_CSR_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'DONE_NXT', '1Q': 'DONE_LATCHED',
    '2CLR_N': 'WR_CSR_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'SOF_SENT_NXT', '2Q': 'SOF_SENT_LAT'
  });

  // Single-Clock-Domain Enable Gates
  sim.addChip('U187_EN_GATES1', '74LVC08A', 'Single-Clock Enable Strobes (CRC, RX_SR, Stuff, BitCnt)', {
    '1A': 'ACTIVE_EN', '1B': 'STUFF_NOT_TRIG', '1Y': 'CRC_EN',
    '2A': 'RX_SAMPLE_EN', '2B': 'STUFF_NOT_TRIG', '2Y': 'RX_SR_EN',
    '3A': 'ACTIVE_EN', '3B': 'STUFF_BIT_IN', '3Y': 'STUFF_CNT_EN',
    '4A': 'ACTIVE_EN', '4B': 'STUFF_NOT_TRIG', '4Y': 'BIT_CNT_EN'
  });
  sim.addChip('U188_EN_GATES2', '74LVC08A', 'Single-Clock Enable Strobes (EOP, Turn, Len, AutoACK)', {
    '1A': 'TX_BIT_EN', '1B': 'IS_EOP_ACTIVE', '1Y': 'EOP_CNT_EN',
    '2A': 'TX_BIT_EN', '2B': 'CTRL_TURN_EN', '2Y': 'TURN_CNT_EN',
    '3A': 'TURN_CNT_EN', '3B': 'TURN_TC_LO', '3Y': 'TURN_HI_EN',
    '4A': 'ACTIVE_EN', '4B': 'BYTE_DONE', '4Y': 'BYTE_DONE_TICK'
  });
  sim.addChip('U189_EN_GATES3', '74LVC08A', 'Single-Clock Enable Strobes (BCNT, RDLEN, TX_LAT, Frame)', {
    '1A': 'BIT_6_TICK', '1B': 'S_TX_DATA', '1Y': 'TX_BCNT_ADV_EN',
    '2A': 'BCNT_ADV_EN', '2B': 'BCNT_TC0', '2Y': 'BCNT_HI_EN',
    '3A': 'BYTE_DONE_TICK', '3B': 'S_RX_DATA', '3Y': 'RX_BYTE_ADV_EN',
    '4A': 'TX_BIT_EN', '4B': 'BYTE_DONE', '4Y': 'TX_LAT_EN'
  });
  sim.addChip('U190_EN_GATES4', '74LVC08A', 'Single-Clock Enable Strobes (ACK, Frame, PID, CRC5/16)', {
    '1A': 'TX_BIT_EN', '1B': 'ACK_WAIT_PHASE', '1Y': 'ACK_DLY_EN',
    '2A': 'TX_BIT_EN', '2B': 'ACK_PHASE_ADV', '2Y': 'ACK_PHASE_EN',
    '3A': 'SOF_TRIG_OUT', '3B': 'FN_TC0', '3Y': 'FN_HI_EN0',
    '4A': 'FN_HI_EN0', '4B': 'FN_TC1', '4Y': 'FN_HI_EN1'
  });

  sim.addChip('U217_EOP_STATE_OR', '74LVC32A', 'Direct EOP State Decode (S_TX_EOP | S_TX_DEOP | ACK_EOP, bypasses U52)', {
    '1A': 'S_TX_EOP', '1B': 'S_TX_DEOP', '1Y': 'IS_EOP_01',
    '2A': 'IS_EOP_01', '2B': 'ACK_EOP_PH', '2Y': 'IS_EOP_STATE',
    '3A': 'GND', '3B': 'GND', '3Y': 'UNUSED_ESO3',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_ESO4'
  });
  sim.addChip('U218_ACK_EOP_AND', '74LVC08A', 'Auto-ACK Phase 3 (EOP) Decode Gate', {
    '1A': 'ACK_P0', '1B': 'ACK_P1', '1Y': 'ACK_P3_MATCH',
    '2A': 'ACK_P3_MATCH', '2B': 'S_AUTO_ACK', '2Y': 'ACK_EOP_PH',
    '3A': 'CUR_S1', '3B': 'CUR_S0', '3Y': 'S_AUTO_ACK_FAST',
    '4A': 'GND', '4B': 'GND', '4Y': 'UNUSED_AEA4'
  });
  sim.addChip('U116_GLUE_AND2', '74LVC08A', 'CRC Feedback & EOP Active Gates', {
    '1A': 'IS_EOP_STATE_REG', '1B': 'IS_EOP_PIPE', '1Y': 'IS_EOP_ACTIVE',
    '2A': 'RX_SAMPLE_EN', '2B': 'RX_PID_DONE_NOW', '2Y': 'RX_PID_DONE_TICK',
    '3A': 'CRC5_FB', '3B': 'NOT_CRC5_OUT', '3Y': 'CRC5_FB_GATED',
    '4A': 'CRC16_FB', '4B': 'NOT_CRC16_OUT', '4Y': 'CRC16_FB_GATED'
  });
  sim.addChip('U117_GLUE_AND3', '74LVC08A', 'Stuffing, TX_OE, and EOP Reset Gates', {
    '1A': 'NRZI_RX_BIT', '1B': 'STUFF_NOT_TRIG', '1Y': 'RX_STUFF_BIT_G',
    '2A': 'TX_OE', '2B': 'ACK_NOT_WAIT_REG', '2Y': 'TX_OE_ACTIVE_0',
    '3A': 'GND', '3B': 'GND', '3Y': 'UNUSED_TXBG_3Y',
    '4A': 'EOP_VPO', '4B': 'CMD_BUS_RESET_N', '4Y': 'EOP_VPO_GATED'
  });
  sim.addChip('U118_GLUE_AND4', '74LVC08A', 'EOP VMO, CRC5/Bit-Counter, and RX PID Gates', {
    '1A': 'EOP_VMO', '1B': 'CMD_BUS_RESET_N', '1Y': 'EOP_VMO_GATED',
    '2A': 'S_RX_PID', '2B': 'BYTE_DONE', '2Y': 'RX_PID_DONE_NOW',
    '3A': 'BIT_Q1', '3B': 'BIT_Q0', '3Y': 'BIT_Q01',
    '4A': 'S_TX_TOK_B1', '4B': 'BIT_GE3', '4Y': 'IN_CRC5_OUT'
  });
  sim.addChip('U119_GLUE_OR3', '74LVC32A', 'CRC5, CRC16 Init, Stuffing & Bit Counter Control ORs', {
    '1A': 'S_IDLE', '1B': 'S_TX_SYNC', '1Y': 'IDLE_OR_SYNC',
    '2A': 'IDLE_OR_SYNC', '2B': 'S_TX_PID', '2Y': 'CRC5_INIT',
    '3A': 'S_TX_DPID', '3B': 'S_RX_PID', '3Y': 'DPID_OR_RPID',
    '4A': 'DPID_OR_RPID', '4B': 'S_IDLE', '4Y': 'CRC16_INIT'
  });
  sim.addChip('U120_GLUE_OR4', '74LVC32A', 'Bit Counter, Stuffing, and EOP OR Gates', {
    '1A': 'BIT_Q2', '1B': 'BIT_Q01', '1Y': 'BIT_GE3',
    '2A': 'TX_OE_ACTIVE_REG', '2B': 'IN_RX_PKT', '2Y': 'STUFF_RST_N',
    '3A': 'RX_Z05', '3B': 'RX_D6', '3Y': 'RX_Z06',
    '4A': 'S_IDLE', '4B': 'IS_EOP_STATE', '4Y': 'IDLE_OR_EOP'
  });
  sim.addChip('U121_STUFF_LAT_FF', '74LVC74A', 'RX PID Latch Trigger & EOP Pipeline Flip-Flops on CLK_48M', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'IS_EOP_PIPE_D', '1Q': 'IS_EOP_PIPE',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'LAT_PID_NOW_D', '2Q': 'LAT_PID_NOW', '2Q_N': 'LAT_PID_NOW_N'
  });
  sim.addChip('U191_PIPE_MUX', '74LVC157A', 'IS_EOP_PIPE, LAT_PID_NOW, and STUFF_LOAD_N Muxes', {
    S: 'TX_BIT_EN', G_N: 'GND',
    '1I0': 'IS_EOP_PIPE', '1I1': 'IS_EOP_STATE', '1Y': 'IS_EOP_PIPE_D',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_PM2',
    '3I0': 'GND', '3I1': 'VCC', '3Y': 'UNUSED_PM3',
    '4I0': 'GND', '4I1': 'VCC', '4Y': 'UNUSED_PM4'
  });
  sim.addChip('U192_PIPE_MUX2', '74LVC157A', 'LAT_PID_NOW (RX_SAMPLE_EN) & STUFF_LOAD_N (ACTIVE_EN) Muxes', {
    S: 'RX_SAMPLE_EN', G_N: 'GND',
    '1I0': 'LAT_PID_NOW', '1I1': 'RX_PID_DONE_NOW', '1Y': 'LAT_PID_NOW_D',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_PM2_2',
    '3I0': 'GND', '3I1': 'VCC', '3Y': 'UNUSED_PM2_3',
    '4I0': 'GND', '4I1': 'VCC', '4Y': 'UNUSED_PM2_4'
  });
  sim.addChip('U193_STUFF_LOAD_MUX', '74LVC157A', 'Stuff Counter Synchronous Load Gate (G_N=STUFF_RST clears to 0)', {
    S: 'ACTIVE_EN', G_N: 'STUFF_RST_REG',
    '1I0': 'VCC', '1I1': 'STUFF_BIT_IN', '1Y': 'STUFF_LOAD_N',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_SLM2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_SLM3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_SLM4'
  });

  // Buffer SRAM WE/OE & Address Reset Glue
  sim.addChip('U122_BUF_WE_AND', '74LVC08A', 'RX Buffer SRAM Write-Enable Qualification', {
    '1A': 'S_RX_DATA', '1B': 'LAST_PID_DAT', '1Y': 'RX_DAT_ACTIVE',
    '2A': 'LAT_BDONE', '2B': 'LAT_PID_NOW_N', '2Y': 'RX_BYTE_OK',
    '3A': 'RX_DAT_ACTIVE', '3B': 'RX_BYTE_OK', '3Y': 'RX_WE_WIN',
    '4A': 'RX_WE_PULSE', '4B': 'SIE_BCNT0_N', '4Y': 'RX_WE_LO'
  });
  sim.addChip('U123_BUF_WE_AND2', '74LVC08A', 'RX High-Bank WE & Buffer Reset Gates', {
    '1A': 'RX_WE_PULSE', '1B': 'SIE_BCNT0', '1Y': 'RX_WE_HI',
    '2A': 'WR_CSR_STB', '2B': 'BUS_D11', '2Y': 'CSR_BUF_RST_PULSE',
    '3A': 'S_TX_DATA', '3B': 'VCC', '3Y': 'S_TX_DATA_BUF_0',
    '4A': 'ACK_P0_N', '4B': 'ACK_P1_N', '4Y': 'ACK_WAIT_P01'
  });
  sim.addChip('U124_BUF_OE_OR', '74LVC32A', 'Buffer SRAM OE_N, WE_LO_N, WE_HI_N, and Address Reset', {
    '1A': 'CPU_WR_DAT', '1B': 'RX_WE_PULSE', '1Y': 'BUF_OE_N',
    '2A': 'CPU_WR_DAT', '2B': 'RX_WE_LO', '2Y': 'BUF_WE_LO_P',
    '3A': 'CPU_WR_DAT', '3B': 'RX_WE_HI', '3Y': 'BUF_WE_HI_P',
    '4A': 'CSR_BUF_RST_PULSE', '4B': 'WR_LEN_STB', '4Y': 'BUF_RST_P'
  });
  sim.addChip('U125_BUF_INV', '74LVC04A', 'Buffer SRAM Active-Low Control & CRC5_INIT_N', {
    '1A': 'GND', '1Y': 'UNUSED_BI1',
    '2A': 'BUF_WE_LO_P', '2Y': 'BUF_WE_LO_N',
    '3A': 'BUF_WE_HI_P', '3Y': 'BUF_WE_HI_N',
    '4A': 'BUF_RST_P', '4Y': 'BUF_ADDR_RST_N',
    '5A': 'GND', '5Y': 'UNUSED_CRC5_INV',
    '6A': 'ACK_P0', '6Y': 'ACK_P0_N'
  });

  // Bit Counter Reset & Wait-RX Synchronous Load
  sim.addChip('U126_BIT_CNT_GLUE', '74LVC08A', 'Bit Counter Reset & Wait-RX Reload Gates', {
    '1A': 'S_WAIT_RX', '1B': 'RX_ACTIVE_N', '1Y': 'WAIT_RX_NO_SYNC',
    '2A': 'IDLE_OR_EOP_N', '2B': 'ACK_NOT_WAIT', '2Y': 'BIT_CNT_RST_N',
    '3A': 'S_AUTO_ACK', '3B': 'BYTE_DONE', '3Y': 'ACK_BYTE_ADV',
    '4A': 'S_RX_DATA', '4B': 'RX_EOP_VALID', '4Y': 'RX_DATA_EOP'
  });
  sim.addChip('U127_BIT_CNT_OR', '74LVC32A', 'Bit Counter Load & Auto-ACK Phase Advance', {
    '1A': 'BYTE_DONE', '1B': 'WAIT_RX_NO_SYNC', '1Y': 'BIT_CNT_LOAD_0',
    '2A': 'AUTO_ACK_FIRE', '2B': 'ACK_BYTE_ADV', '2Y': 'ACK_PHASE_ADV',
    '3A': 'FSM_ERR_OR_TO_0', '3B': 'ERR_STUFF_LAT', '3Y': 'FSM_ERR_OR_TO',
    '4A': 'BIT_CNT_LOAD_0', '4B': 'BIT_CNT_FORCE_LOAD', '4Y': 'BIT_CNT_LOAD_P'
  });
  sim.addChip('U128_INV5', '74LVC04A', 'Miscellaneous Active-Low Control Inverters', {
    '1A': 'RX_ACTIVE', '1Y': 'RX_ACTIVE_N',
    '2A': 'BIT_CNT_RST_N', '2Y': 'BIT_CNT_FORCE_LOAD',
    '3A': 'BIT_CNT_LOAD_CLK_P', '3Y': 'BIT_CNT_LOAD_N',
    '4A': 'ACK_P1', '4Y': 'ACK_P1_N',
    '5A': 'CRC16_RES_OK', '5Y': 'CRC16_RES_BAD',
    '6A': 'START_PENDING', '6Y': 'START_PENDING_N'
  });
  sim.addChip('U194_BIT_LOAD_AND', '74LVC08A', 'Gate BIT_CNT_LOAD_P with ACTIVE_EN', {
    '1A': 'BIT_CNT_LOAD_P', '1B': 'ACTIVE_EN', '1Y': 'BIT_CNT_LOAD_CLK_P',
    '2A': 'STUFF_BIT_IN', '2B': 'STUFF_RST_N', '2Y': 'STUFF_LOAD_N_GATED',
    '3A': 'IS_SOF_LAT', '3B': 'S_IDLE_N', '3Y': 'IS_SOF_XFER_RAW',
    '4A': 'RX_STUFF_CHK_PRE', '4B': 'SE0_NOW_N', '4Y': 'RX_STUFF_CHK_EN'
  });

  // TX Bit Out Final Muxes (Header vs SER vs CRC5 vs CRC16)
  sim.addChip('U243_TOK_PIPE', '74LVC574A', 'TX Serializer Stage 0: Registered TOK_B0[7:0]', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'TOK_B0_0', D1: 'TOK_B0_1', D2: 'TOK_B0_2', D3: 'TOK_B0_3',
    D4: 'TOK_B0_4', D5: 'TOK_B0_5', D6: 'TOK_B0_6', D7: 'TOK_B0_7',
    Q0: 'TOK_B0_R0', Q1: 'TOK_B0_R1', Q2: 'TOK_B0_R2', Q3: 'TOK_B0_R3',
    Q4: 'TOK_B0_R4', Q5: 'TOK_B0_R5', Q6: 'TOK_B0_R6', Q7: 'TOK_B0_R7'
  });
  sim.addChip('U244_SER_BYTE_PIPE', '74LVC574A', 'TX Serializer Stage 1: Registered SER_BYTE[7:0] (feeds U53)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'SER_BYTE0', D1: 'SER_BYTE1', D2: 'SER_BYTE2', D3: 'SER_BYTE3',
    D4: 'SER_BYTE4', D5: 'SER_BYTE5', D6: 'SER_BYTE6', D7: 'SER_BYTE7',
    Q0: 'SER_BYTE_R0', Q1: 'SER_BYTE_R1', Q2: 'SER_BYTE_R2', Q3: 'SER_BYTE_R3',
    Q4: 'SER_BYTE_R4', Q5: 'SER_BYTE_R5', Q6: 'SER_BYTE_R6', Q7: 'SER_BYTE_R7'
  });
  sim.addChip('U246_HDR_PID_PIPE', '74LVC574A', 'TX Header Stage 0: Registered HDR_PID[3:0] & IS_HDR_STATE (feeds U52)', {
    OE_N: 'GND', CLK: 'CLK_48M',
    D0: 'HDR_PID0_IN', D1: 'HDR_PID1_IN', D2: 'HDR_PID2_IN', D3: 'HDR_PID3_IN',
    D4: 'IS_HDR_STATE', D5: 'GND', D6: 'GND', D7: 'GND',
    Q0: 'HDR_PID_R0', Q1: 'HDR_PID_R1', Q2: 'HDR_PID_R2', Q3: 'HDR_PID_R3',
    Q4: 'IS_HDR_STATE_R', Q5: 'U246_U5', Q6: 'U246_U6', Q7: 'U246_U7'
  });
  sim.addChip('U245_SER_BIT_PIPE', '74LVC74A', 'TX Serializer Stage 2: Registered SER_BIT_OUT (U53) & TX_HDR_BIT (U52)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'SER_BIT_OUT', '1Q': 'SER_BIT_OUT_REG',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'TX_HDR_BIT',  '2Q': 'TX_HDR_BIT_REG'
  });
  sim.addChip('U250_XFERT_PIPE1', '74LVC74A', 'Registered XFER_T[1:0] Stage 1 (after U52)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'XFER_T0_RAW', '1Q': 'XFER_T0_R1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'XFER_T1_RAW', '2Q': 'XFER_T1_R1'
  });
  sim.addChip('U251_XFERT_PIPE2', '74LVC74A', 'Registered Direct XFER_T[1:0] (CMD_PID & SOF_ACTIVE, zero stale SOF)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'XFER_T0_DIR', '1Q': 'XFER_T0',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'XFER_T1_DIR', '2Q': 'XFER_T1'
  });
  sim.addChip('U253_TX_SEL_OR', '74LVC32A', 'Balanced TX Mux Select & EOP/Stuff Gate', {
    '1A': 'IS_HDR_STATE_R', '1B': 'IN_CRC16_OUT_REG', '1Y': 'HDR_OR_CRC16',
    '2A': 'EOP_OR_RESET_REG', '2B': 'STUFF_TRIG', '2Y': 'EOP_OR_STUFF',
    '3A': 'XFER_T0_CPU', '3B': 'SOF_ACTIVE', '3Y': 'XFER_T0_DIR',
    '4A': 'XFER_T1_CPU', '4B': 'SOF_ACTIVE', '4Y': 'XFER_T1_DIR'
  });
  sim.addChip('U129_TX_BIT_MUX', '74LVC157A', 'TX Bit Mux Level 1A (SER_BIT_OUT_REG vs CRC5)', {
    S: 'IN_CRC5_OUT_REG', G_N: 'GND',
    '1I0': 'SER_BIT_OUT_REG', '1I1': 'CRC5_Q4_N', '1Y': 'TX_BIT_STEP_A',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'TX_BIT_STEP_B_UNUSED',
    '3I0': 'TX_LEN_DONE', '3I1': 'LAST_PID_HS', '3Y': 'LEN_DONE_MUX',
    '4I0': 'GND', '4I1': 'VCC', '4Y': 'UNUSED_M4'
  });
  sim.addChip('U130_TX_BIT_MUX2', '74LVC157A', 'TX Bit Mux Level 1B (TX_HDR_BIT_REG vs CRC16) & Header PID[1:0]', {
    S: 'IN_CRC16_OUT_REG', G_N: 'GND',
    '1I0': 'TX_HDR_BIT_REG', '1I1': 'CRC16_Q15_N_REG', '1Y': 'TX_BIT_STEP_B',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'TX_BIT_OUT_RAW_UNUSED',
    '3I0': 'CMD_PID0', '3I1': 'ACK_P0', '3Y': 'HDR_PID0_STEP',
    '4I0': 'CMD_PID1', '4I1': 'ACK_P1', '4Y': 'HDR_PID1_STEP'
  });
  sim.addChip('U131_TX_CRC16_MUX', '74LVC157A', 'TX Bit Mux Level 2 (Raw TX Bit) & Header PID[3:2]', {
    S: 'HDR_OR_CRC16', G_N: 'GND',
    '1I0': 'TX_BIT_STEP_A', '1I1': 'TX_BIT_STEP_B', '1Y': 'TX_BIT_OUT_RAW_P',
    '2I0': 'CMD_PID2', '2I1': 'GND', '2Y': 'HDR_PID2_STEP',
    '3I0': 'CMD_PID3', '3I1': 'GND', '3Y': 'HDR_PID3_STEP',
    '4I0': 'HDR_PID0_STEP', '4I1': 'VCC', '4Y': 'HDR_PID0_SOF_UNUSED'
  });
  sim.addChip('U252_TX_GATED_MUX', '74LVC157A', 'TX Bit Mux Level 2B (Gated by EOP_OR_STUFF via G_N)', {
    S: 'HDR_OR_CRC16', G_N: 'EOP_OR_STUFF',
    '1I0': 'TX_BIT_STEP_A', '1I1': 'TX_BIT_STEP_B', '1Y': 'TX_BIT_GATED_P',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_TGM2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_TGM3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_TGM4'
  });
  sim.addChip('U247_TX_BIT_PIPE', '74LVC74A', 'TX Serializer Stage 3: Registered TX_BIT_OUT_RAW & TX_BIT_GATED (5.2 ns)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'TX_BIT_OUT_RAW_P', '1Q': 'TX_BIT_OUT_RAW',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'TX_BIT_GATED_P',   '2Q': 'TX_BIT_GATED'
  });
  sim.addChip('U132_TOGGLE_XOR', '74LVC86A', 'Data Toggle Match XOR', {
    '1A': 'PID_C3', '1B': 'CMD_TOGGLE_N', '1Y': 'TOGGLE_OK_COMB',
    '2A': 'CRC16_Q0', '2B': 'VCC', '2Y': 'CRC16_Q0_N_UNUSED',
    '3A': 'CRC16_Q1', '3B': 'GND', '3Y': 'CRC16_Q1_BUF',
    '4A': 'CRC16_Q15', '4B': 'VCC', '4Y': 'CRC16_Q15_N_CHK'
  });
  sim.addChip('U133_TX_EOP_GATE', '74LVC157A', 'Header PID Mux (Auto-ACK)', {
    S: 'S_AUTO_ACK', G_N: 'GND',
    '1I0': 'CMD_PID0', '1I1': 'ACK_P0', '1Y': 'HDR_PID0_A',
    '2I0': 'CMD_PID1', '2I1': 'ACK_P1', '2Y': 'HDR_PID1_A',
    '3I0': 'CMD_PID2', '3I1': 'GND',    '3Y': 'HDR_PID2_A',
    '4I0': 'CMD_PID3', '4I1': 'GND',    '4Y': 'HDR_PID3_A'
  });

  // CRC-16 Residual 0x800D Comparator
  sim.addChip('U134_CRC_CHK_OR0', '74LVC32A', 'CRC-16 Residual Zero-Bit OR Tree (Low Byte 0x0D)', {
    '1A': 'CRC16_Q7', '1B': 'CRC16_Q6', '1Y': 'C16_Z67',
    '2A': 'CRC16_Q5', '2B': 'CRC16_Q4', '2Y': 'C16_Z45',
    '3A': 'C16_Z67',  '3B': 'C16_Z45',  '3Y': 'C16_Z47',
    '4A': 'C16_Z47',  '4B': 'CRC16_Q1', '4Y': 'C16_LO_BADZ'
  });
  sim.addChip('U135_CRC_CHK_OR1', '74LVC32A', 'CRC-16 Residual Zero-Bit OR Tree (High Byte 0x80)', {
    '1A': 'CRC16_Q14', '1B': 'CRC16_Q13', '1Y': 'C16_Z1314',
    '2A': 'CRC16_Q12', '2B': 'CRC16_Q11', '2Y': 'C16_Z1112',
    '3A': 'CRC16_Q10', '3B': 'CRC16_Q9',  '3Y': 'C16_Z910',
    '4A': 'C16_Z1314', '4B': 'C16_Z1112', '4Y': 'C16_Z1114'
  });
  sim.addChip('U136_CRC_CHK_AND', '74LVC08A', 'CRC-16 Residual 0x800D AND Tree', {
    '1A': 'CRC16_Q3', '1B': 'CRC16_Q2', '1Y': 'C16_Q23',
    '2A': 'C16_Q23',  '2B': 'CRC16_Q0', '2Y': 'C16_LO_ONES',
    '3A': 'C16_LO_ONES', '3B': 'C16_LO_BADZ_N', '3Y': 'CRC16_RES_LO_OK',
    '4A': 'CRC16_Q15', '4B': 'C16_HI_Z_N', '4Y': 'CRC16_RES_HI_OK'
  });
  sim.addChip('U137_CRC_CHK_OR2', '74LVC32A', 'CRC-16 Residual High-Byte Zero OR & Auto-ACK Wait OR', {
    '1A': 'C16_Z910', '1B': 'CRC16_Q8', '1Y': 'C16_Z810',
    '2A': 'C16_Z1114', '2B': 'C16_Z810', '2Y': 'C16_HI_BADZ',
    '3A': 'S_TX_DATA_BUF_0', '3B': 'S_TX_DPID', '3Y': 'S_TX_DATA_BUF',
    '4A': 'S_AUTO_ACK_N', '4B': 'ACK_WAIT_P01_N', '4Y': 'ACK_NOT_WAIT'
  });
  sim.addChip('U138_CRC_CHK_INV', '74LVC04A', 'CRC-16 Residual & Control Inverters', {
    '1A': 'C16_LO_BADZ', '1Y': 'C16_LO_BADZ_N',
    '2A': 'C16_HI_BADZ', '2Y': 'C16_HI_Z_N',
    '3A': 'EOP_OR_RESET', '3Y': 'EOP_OR_RESET_N',
    '4A': 'SOF_ACTIVE', '4Y': 'SOF_ACTIVE_N',
    '5A': 'IDLE_OR_EOP', '5Y': 'IDLE_OR_EOP_N',
    '6A': 'SE0_NOW', '6Y': 'UNUSED_SE0_NOW_N_DUP'
  });

  // Error Latches (CRC, Timeout, Stuff) cleared on WR_CSR_N, clocked on CLK_48M
  sim.addChip('U214_SYNC_LAT_OR', '74LVC32A', 'Synchronous CLK_48M Feedback OR Gates for U70.2, U139.2, U140.2', {
    '1A': 'SOF_SENT_LAT',    '1B': 'SOF_TRIG_OUT',    '1Y': 'SOF_SENT_NXT',
    '2A': 'ERR_TIMEOUT_LAT', '2B': 'ERR_TIMEOUT_CMB', '2Y': 'ERR_TO_NXT',
    '3A': 'SOF_ACT_HOLD',    '3B': 'SOF_TRIG_ST',     '3Y': 'SOF_ACT_SYNC_D',
    '4A': 'NOT_RX_HI',       '4B': 'S_AUTO_ACK_FAST', '4Y': 'ACTIVE_CLK_SEL_D'
  });
  sim.addChip('U139_ERR_LAT_FF', '74LVC74A', 'Latched CRC & Timeout Error Flags on CLK_48M', {
    '1CLR_N': 'WR_CSR_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'ERR_CRC_D_MUX', '1Q': 'ERR_CRC_LAT',
    '2CLR_N': 'WR_CSR_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'ERR_TO_NXT', '2Q': 'ERR_TIMEOUT_LAT'
  });
  sim.addChip('U140_ERR_LAT_FF2', '74LVC74A', 'Latched Stuff-Error Flag & SOF Active Flag', {
    '1CLR_N': 'WR_CSR_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'ERR_STUFF_D_MUX', '1Q': 'ERR_STUFF_LAT',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'SOF_ACT_SYNC_D', '2Q': 'SOF_ACTIVE'
  });
  sim.addChip('U141_ERR_STB_AND', '74LVC08A', 'CRC Error Strobe & SOF Active Trigger Gates', {
    '1A': 'LAT_T0', '1B': 'LAT_T1', '1Y': 'IS_SOF_LAT',
    '2A': 'SOF_PENDING', '2B': 'START_PENDING_N', '2Y': 'SOF_ONLY_PEND',
    '3A': 'SOF_ONLY_PEND', '3B': 'S_IDLE', '3Y': 'SOF_TRIG_ST',
    '4A': 'TX_BIT_OUT_RAW', '4B': 'EOP_OR_RESET_N', '4Y': 'TX_BIT_EOP_CLEAN'
  });

  // SOF Frame Number vs Target Address/Endpoint Muxes
  sim.addChip('U142_SOF_TOK_MUX0', '74LVC157A', 'Token B0 Bits 3:0 (ADDR[3:0] vs FN[3:0])', {
    S: 'IS_SOF_XFER', G_N: 'GND',
    '1I0': 'ADDR0', '1I1': 'FN0', '1Y': 'TOK_B0_0',
    '2I0': 'ADDR1', '2I1': 'FN1', '2Y': 'TOK_B0_1',
    '3I0': 'ADDR2', '3I1': 'FN2', '3Y': 'TOK_B0_2',
    '4I0': 'ADDR3', '4I1': 'FN3', '4Y': 'TOK_B0_3'
  });
  sim.addChip('U143_SOF_TOK_MUX1', '74LVC157A', 'Token B0 Bits 7:4 (ADDR[6:4],ENDP0 vs FN[7:4])', {
    S: 'IS_SOF_XFER', G_N: 'GND',
    '1I0': 'ADDR4', '1I1': 'FN4', '1Y': 'TOK_B0_4',
    '2I0': 'ADDR5', '2I1': 'FN5', '2Y': 'TOK_B0_5',
    '3I0': 'ADDR6', '3I1': 'FN6', '3Y': 'TOK_B0_6',
    '4I0': 'ENDP0', '4I1': 'FN7', '4Y': 'TOK_B0_7'
  });
  sim.addChip('U144_SOF_TOK_MUX2', '74LVC157A', 'Token B1 Bits 2:0 (ENDP[3:1] vs FN[10:8]) & XFER_T[1:0]', {
    S: 'IS_SOF_XFER', G_N: 'GND',
    '1I0': 'ENDP1', '1I1': 'FN8',  '1Y': 'TOK_B1_0',
    '2I0': 'ENDP2', '2I1': 'FN9',  '2Y': 'TOK_B1_1',
    '3I0': 'ENDP3', '3I1': 'FN10', '3Y': 'TOK_B1_2',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_ST2_4'
  });
  sim.addChip('U145_SOF_HDR_MUX', '74LVC157A', 'Header PID (SOF 0x5 override) & XFER_T1', {
    S: 'IS_SOF_XFER', G_N: 'GND',
    '1I0': 'HDR_PID0_A', '1I1': 'VCC', '1Y': 'HDR_PID0_IN',
    '2I0': 'HDR_PID1_A', '2I1': 'GND', '2Y': 'HDR_PID1_IN',
    '3I0': 'HDR_PID2_A', '3I1': 'VCC', '3Y': 'HDR_PID2_IN',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_SHM_4'
  });
  sim.addChip('U204_SOF_XFER_T_MUX', '74LVC157A', 'XFER_T[1:0] SOF Override Mux', {
    S: 'SOF_ACTIVE', G_N: 'GND',
    '1I0': 'XFER_T0_R1', '1I1': 'VCC', '1Y': 'XFER_T0_S2',
    '2I0': 'XFER_T1_R1', '2I1': 'VCC', '2Y': 'XFER_T1_S2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_SXT3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_SXT4'
  });
  sim.addChip('U146_SOF_HDR_MUX2', '74LVC157A', 'Header PID[3] (SOF 0x5 override)', {
    S: 'IS_SOF_XFER', G_N: 'GND',
    '1I0': 'HDR_PID3_A', '1I1': 'GND', '1Y': 'HDR_PID3_IN',
    '2I0': 'VCC', '2I1': 'VCC', '2Y': 'UNUSED_M2',
    '3I0': 'TX_BIT_EOP_CLEAN', '3I1': 'GND', '3Y': 'UNUSED_M3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'ERR_CRC_CMB'
  });

  sim.addChip('U148_NRZI_D_MUX', '74LVC157A', 'Synchronous NRZI TX Idle-J Mux', {
    S: 'NRZI_TX_RUN', G_N: 'GND',
    '1I0': 'VCC', '1I1': 'NRZI_TX_NEXT', '1Y': 'NRZI_TX_D_MUX',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_NRZI2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_NRZI3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_NRZI4'
  });
  sim.addChip('U150_TX_LAT_CLK_AND', '74LVC08A', 'CRC Error Capture Enable & First-SE0 Gates (Balanced Tree)', {
    '1A': 'RX_SAMPLE_EN', '1B': 'LAT_PID_NOW_N', '1Y': 'RX_SAMP_NOT_PID',
    '2A': 'SE0_NOW', '2B': 'SE0_PREV_N', '2Y': 'SE0_FIRST_BIT',
    '3A': 'SE0_FIRST_BIT', '3B': 'RX_SAMP_NOT_PID', '3Y': 'SE0_FIRST_EN',
    '4A': 'RX_SAMPLE_EN', '4B': 'CTRL_RX_EN', '4Y': 'RX_STUFF_CHK_PRE'
  });
  sim.addChip('U202_ERR_STUFF_MUX', '74LVC157A', 'Synchronous Stuff-Error Capture Mux on CLK_48M', {
    S: 'RX_STUFF_CHK_TRIG', G_N: 'GND',
    '1I0': 'ERR_STUFF_LAT', '1I1': 'NRZI_RX_BIT', '1Y': 'ERR_STUFF_D_MUX',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_ESM2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_ESM3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_ESM4'
  });
  sim.addChip('U151_ERR_CRC_MUX', '74LVC157A', 'Synchronous CRC-16 Error Capture Mux on First SE0 Bit', {
    S: 'CRC_CHK_D1', G_N: 'GND',
    '1I0': 'ERR_CRC_LAT', '1I1': 'CRC16_RES_BAD', '1Y': 'ERR_CRC_D_MUX',
    '2I0': 'GND', '2I1': 'GND', '2Y': 'UNUSED_ECM2',
    '3I0': 'GND', '3I1': 'GND', '3Y': 'UNUSED_ECM3',
    '4I0': 'GND', '4I1': 'GND', '4Y': 'UNUSED_ECM4'
  });
  sim.addChip('U152_SE0_PREV_INV', '74LVC04A', 'Invert SE0_PREV, LAT_PID_NOW, RX_WE_DONE', {
    '1A': 'GND', '1Y': 'UNUSED_SE0_PREV_INV',
    '2A': 'GND', '2Y': 'UNUSED_LAT_PID_INV',
    '3A': 'GND', '3Y': 'UNUSED_RX_WE_INV',
    '4A': 'BIT_Q0', '4Y': 'BIT_Q0_N',
    '5A': 'SEL_DAT_N', '5Y': 'SEL_DAT_P',
    '6A': 'SEL_DAT_P', '6Y': 'SEL_DAT_DLY'
  });
  sim.addChip('U153_RX_WE_AND', '74LVC08A', 'RX Buffer WE PID-Skip & One-Shot Gate', {
    '1A': 'GND', '1B': 'GND', '1Y': 'UNUSED_RX_WE_AND1',
    '2A': 'RX_WE_WIN_D1', '2B': 'RX_WE_DONE_N', '2Y': 'RX_WE_PULSE_RAW',
    '3A': 'XFER_DONE', '3B': 'ACTIVE_EN', '3Y': 'DONE_SET',
    '4A': 'TX_OE_ACTIVE_REG', '4B': 'EOP_OR_RESET_REG_N', '4Y': 'NRZI_TX_RUN'
  });
  sim.addChip('U154_RX_WE_FF', '74LVC74A', 'RX Buffer WE One-Shot Flip-Flop (20.8 ns pulse) on CLK_48M', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'RX_WE_WIN', '1Q': 'RX_WE_WIN_D1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'RX_WE_WIN_D1', '2Q': 'RX_WE_DONE', '2Q_N': 'RX_WE_DONE_N'
  });
  sim.addChip('U155_RX_ADR_MUX0', '74LVC157A', 'SIE Byte Index Mux Bits 3:0 (TX BCNT vs RX RDL1)', {
    S: 'S_RX_DATA', G_N: 'GND',
    '1I0': 'BCNT0', '1I1': 'RDL1_0', '1Y': 'SIE_BCNT0',
    '2I0': 'BCNT1', '2I1': 'RDL1_1', '2Y': 'SIE_BCNT1',
    '3I0': 'BCNT2', '3I1': 'RDL1_2', '3Y': 'SIE_BCNT2',
    '4I0': 'BCNT3', '4I1': 'RDL1_3', '4Y': 'SIE_BCNT3'
  });
  sim.addChip('U156_RX_ADR_MUX1', '74LVC157A', 'SIE Byte Index Mux Bits 7:4 (TX BCNT vs RX RDL1)', {
    S: 'S_RX_DATA', G_N: 'GND',
    '1I0': 'BCNT4', '1I1': 'RDL1_4', '1Y': 'SIE_BCNT4',
    '2I0': 'BCNT5', '2I1': 'RDL1_5', '2Y': 'SIE_BCNT5',
    '3I0': 'BCNT6', '3I1': 'RDL1_6', '3Y': 'SIE_BCNT6',
    '4I0': 'BCNT7', '4I1': 'RDL1_7', '4Y': 'SIE_BCNT7'
  });
  sim.addChip('U215_ACT_SEL_FF', '74LVC74A', 'Registered ACTIVE_CLK_SEL (breaks U35 -> TX_OE -> ACTIVE_EN loop)', {
    '1CLR_N': 'VCC', '1PRE_N': 'RST_N', '1CLK': 'CLK_48M', '1D': 'ACTIVE_CLK_SEL_D', '1Q': 'ACTIVE_CLK_SEL',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'IS_SOF_XFER_RAW', '2Q': 'IS_SOF_XFER'
  });
  sim.addChip('U157_CLK_SEL_OR', '74LVC32A', 'Control OR Gates (NOT_RX_HI, SOF Pending, SOF Mux, Buffer Busy)', {
    '1A': 'CUR_S3_N', '1B': 'CUR_S2_N', '1Y': 'NOT_RX_HI',
    '2A': 'SOF_PENDING', '2B': 'SOF_TRIG_OUT', '2Y': 'SOF_PEND_NXT',
    '3A': 'SOF_ACTIVE', '3B': 'IS_SOF_XFER', '3Y': 'SOF_MUX_SEL',
    '4A': 'IN_DATA_STATE', '4B': 'S_TX_DPID', '4Y': 'SIE_BUF_BUSY'
  });

        
  sim.addChip('U199_GLUE_EXTRA', '74LVC08A', 'TX_OE_ACTIVE & BIT_6_TICK Gates', {
    '1A': 'TX_OE_ACTIVE_0', '1B': 'S_IDLE_N', '1Y': 'TX_OE_ACTIVE',
    '2A': 'BIT_Q2', '2B': 'BIT_Q1', '2Y': 'BIT_12',
    '3A': 'BIT_12', '3B': 'BIT_Q0_N', '3Y': 'BIT_6',
    '4A': 'BIT_6', '4B': 'ACTIVE_EN', '4Y': 'BIT_6_TICK'
  });
  sim.addChip('U200_BUS_SYNC_FF', '74LVC74A', '2-Flop Bus Synchronizer Stage 1 (DP_IN & DM_IN async inputs)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'DP_IN', '1Q': 'DP_SYNC_1',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'DM_IN', '2Q': 'DM_SYNC_1'
  });
  sim.addChip('U219_BUS_SYNC_FF2', '74LVC74A', '2-Flop Bus Synchronizer Stage 2 (DP_SYNC & DM_SYNC)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'DP_SYNC_1', '1Q': 'DP_SYNC',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'DM_SYNC_1', '2Q': 'DM_SYNC'
  });

  sim.addChip('U201_SE0_SYNC2', '74LVC74A', 'Align SE0_NOW (2 cycles) with RCV_D2 (2 cycles)', {
    '1CLR_N': 'RST_N', '1PRE_N': 'VCC', '1CLK': 'CLK_48M', '1D': 'SE0_RAW', '1Q': 'SE0_NOW', '1Q_N': 'SE0_NOW_N',
    '2CLR_N': 'RST_N', '2PRE_N': 'VCC', '2CLK': 'CLK_48M', '2D': 'GND', '2Q': 'UNUSED_SS2'
  });

  // Initial static net levels (no protocol state; only reset/strobe idle highs)
  sim.setNetImmediate('RST_N', 1);
  sim.setNetImmediate('IO_CS_N', 1);
  sim.setNetImmediate('IO_RD_N', 1);
  sim.setNetImmediate('IO_WR_N', 1);
  sim.stepUntil(20);
}

module.exports = {
  buildSieNetlist,
  SIE_PINS
};
