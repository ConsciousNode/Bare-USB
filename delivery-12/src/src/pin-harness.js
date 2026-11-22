/**
 * Bare USB — Closed-Box Generic Pin Harness (`src/pin-harness.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Strictly obeys Round 2 Rule 1 & Rule 3:
 * - Touches ONLY the external pins of the SIE netlist:
 *   CLK_48M, RST_N, PORT_A[2:0], PORT_D[15:0], IO_CS_N, IO_RD_N, IO_WR_N, IRQ, DP_PIN, DM_PIN.
 * - Contains ZERO protocol logic, ZERO register meanings, ZERO chip internal access.
 */

'use strict';

class ClosedBoxPinHarness {
  /**
   * @param {import('./simulator').GateSimulator} sim
   * @param {object} lineBus - Physical D+/D- wire model attached to DP_PIN and DM_PIN
   * @param {object} [options]
   * @param {number} [options.hostClockSkewPct=0] - ±0.25% FS crystal skew
   */
  constructor(sim, lineBus, options = {}) {
    this.sim = sim;
    this.lineBus = lineBus;
    this.hostClockSkewPct = options.hostClockSkewPct || 0;
    this.halfPeriod48Ns = 1000 / (2 * 48.0 * (1 + this.hostClockSkewPct / 100));
    this.simTimeNs = 0;
    this.regTrace = [];

    // Connect physical bus DP_PIN / DM_PIN to the line model
    this.lineBus.connectHostPins(this.sim, 'DP_PIN', 'DM_PIN');
  }

  reset() {
    this.sim.setNetImmediate('RST_N', 0);
    this.sim.setNetImmediate('IO_CS_N', 1);
    this.sim.setNetImmediate('IO_RD_N', 1);
    this.sim.setNetImmediate('IO_WR_N', 1);
    for (let i = 0; i < 16; i++) this.sim.releaseNetImmediate('PORT_D' + i);
    this._tick48M(4);
    this.sim.setNetImmediate('RST_N', 1);
    this._tick48M(4);
  }

  _tick48M(cycles = 1) {
    const h = this.halfPeriod48Ns;
    for (let i = 0; i < cycles; i++) {
      this.sim.scheduleNet('CLK_48M', 1, 0);
      this.sim.stepUntil(this.sim.nowNs + h);
      this.lineBus.stepDevicesUntil(this.sim.nowNs);
      this.sim.scheduleNet('CLK_48M', 0, 0);
      this.sim.stepUntil(this.sim.nowNs + h);
      this.lineBus.stepDevicesUntil(this.sim.nowNs);
      this.simTimeNs += 2 * h;
    }
  }

  advanceTimeNs(deltaNs) {
    const cycles = Math.max(1, Math.round(deltaNs / (2 * this.halfPeriod48Ns)));
    this._tick48M(cycles);
  }

  getIrq() {
    return this.sim.getNet('IRQ');
  }

  readReg(port) {
    const p = port & 0x07;
    this.sim.setNetImmediate('PORT_A0', p & 1);
    this.sim.setNetImmediate('PORT_A1', (p >> 1) & 1);
    this.sim.setNetImmediate('PORT_A2', (p >> 2) & 1);
    this.sim.setNetImmediate('IO_WR_N', 1);
    this.sim.setNetImmediate('IO_CS_N', 0);
    this.sim.setNetImmediate('IO_RD_N', 0);
    this._tick48M(2);

    let val = 0;
    for (let i = 0; i < 16; i++) {
      val |= (this.sim.getNet('PORT_D' + i) << i);
    }

    this.sim.setNetImmediate('IO_RD_N', 1);
    this.sim.setNetImmediate('IO_CS_N', 1);
    for (let i = 0; i < 16; i++) this.sim.releaseNetImmediate('PORT_D' + i);
    this._tick48M(1);

    this.regTrace.push({ op: 'R', port: p, val: val & 0xFFFF });
    return val & 0xFFFF;
  }

  writeReg(port, value) {
    const p = port & 0x07;
    const v = value & 0xFFFF;
    this.sim.setNetImmediate('PORT_A0', p & 1);
    this.sim.setNetImmediate('PORT_A1', (p >> 1) & 1);
    this.sim.setNetImmediate('PORT_A2', (p >> 2) & 1);
    for (let i = 0; i < 16; i++) {
      this.sim.setNetImmediate('PORT_D' + i, (v >> i) & 1);
    }
    this.sim.setNetImmediate('IO_RD_N', 1);
    this.sim.setNetImmediate('IO_CS_N', 0);
    this._tick48M(1);
    this.sim.setNetImmediate('IO_WR_N', 0);
    this._tick48M(2);
    this.sim.setNetImmediate('IO_WR_N', 1);
    this.sim.setNetImmediate('IO_CS_N', 1);
    for (let i = 0; i < 16; i++) this.sim.releaseNetImmediate('PORT_D' + i);
    this._tick48M(1);

    this.regTrace.push({ op: 'W', port: p, val: v });
  }
}

module.exports = {
  ClosedBoxPinHarness
};
