/**
 * Bare USB — Pure D+/D- Physical Wire Line Model (`src/line-model.js`)
 * ConsciousNode SoftWorks — Zero dependencies, offline.
 *
 * Strictly obeys Round 2 Rule 5 & Rule 7:
 * - Connects to the SIE netlist ONLY at `DP_PIN` and `DM_PIN`.
 * - Passes ONLY timed `(timeNs, dp, dm)` differential wire levels between host and device.
 * - Injects errors ONLY on the physical wire (flipped level, 7-ones non-transition run,
 *   or suppressed handshake waveform). No protocol flags or JS packet objects.
 */

'use strict';

class UsbLineModel {
  constructor() {
    this.hostSim = null;
    this.dpNetName = 'DP_PIN';
    this.dmNetName = 'DM_PIN';
    this.attachedDevice = null;
    this.lowSpeedPullUp = false;

    this.curDp = 0;
    this.curDm = 0;
    this.hostDriving = false;

    // Timed D+/D- transitions for differential & waveform display
    this.busTransitions = [];
    this.waveform = [];
    this.maxWaveformSamples = 4000;

    // Scheduled device->host wire transitions (queue of { timeNs, dp, dm })
    this.devTxQueue = [];
    this.devTxCursor = 0;

    // Wire-level error injection queue for Test 7
    this.wireFaults = [];
  }

  connectHostPins(sim, dpNetName = 'DP_PIN', dmNetName = 'DM_PIN') {
    this.hostSim = sim;
    this.dpNetName = dpNetName;
    this.dmNetName = dmNetName;

    // Apply initial pull-up/pull-down idle state to DP_PIN / DM_PIN
    if (this.attachedDevice) {
      sim.setNetImmediate(dpNetName, this.curDp);
      sim.setNetImmediate(dmNetName, this.curDm);
    } else {
      sim.setNetImmediate(dpNetName, 0);
      sim.setNetImmediate(dmNetName, 0);
    }

    sim.watchNet(dpNetName, (t, v) => {
      if (this.curDp !== v) {
        this.curDp = v;
        this._onHostPinChange(t);
      }
    });
    sim.watchNet(dmNetName, (t, v) => {
      if (this.curDm !== v) {
        this.curDm = v;
        this._onHostPinChange(t);
      }
    });
  }

  attachDevice(device) {
    this.attachedDevice = device;
    this.lowSpeedPullUp = !!device.isLowSpeed;
    // 1.5 kΩ pull-up to 3.3V on D- (LS) or D+ (FS) against 15 kΩ host pull-downs
    this.curDp = this.lowSpeedPullUp ? 0 : 1;
    this.curDm = this.lowSpeedPullUp ? 1 : 0;
    if (this.hostSim) {
      this.hostSim.setNetImmediate(this.dpNetName, this.curDp);
      this.hostSim.setNetImmediate(this.dmNetName, this.curDm);
    }
    this._recordTransition(0, this.curDp, this.curDm, 'ATTACH_IDLE_J');
  }

  detachDevice(timeNs = 0) {
    this.attachedDevice = null;
    this.curDp = 0;
    this.curDm = 0;
    if (this.hostSim) {
      this.hostSim.setNetImmediate(this.dpNetName, 0);
      this.hostSim.setNetImmediate(this.dmNetName, 0);
    }
    this._recordTransition(timeNs, 0, 0, 'DETACH_SE0');
  }

  getAttachState() {
    return {
      attached: this.attachedDevice !== null,
      lowSpeed: this.lowSpeedPullUp,
      transceiverPart: 'USB1T11ABQX (onsemi) + 2x 27Ω series + 2x 15kΩ pull-down'
    };
  }

  /**
   * Schedules a pure wire-level fault on the next matching device->host wire burst:
   * - 'corrupt_crc': flips D+/D- polarity near the end of a long device->host burst
   * - 'stuff_error': holds D+/D- flat (7 consecutive identical levels) mid-burst
   * - 'drop_handshake': suppresses a short device->host burst (<= 24 transitions)
   */
  scheduleWireFault(type) {
    this.wireFaults.push({ type, used: false });
  }

  _onHostPinChange(timeNs) {
    const state = this._classifyState(this.curDp, this.curDm);
    this._recordTransition(timeNs, this.curDp, this.curDm, state);
    if (this.attachedDevice) {
      const replyTransitions = this.attachedDevice.onBusLevel(timeNs, this.curDp, this.curDm);
      if (replyTransitions && replyTransitions.length > 0) {
        this._enqueueDeviceWaveform(replyTransitions);
      }
    }
  }

  _enqueueDeviceWaveform(transitions) {
    let list = transitions;
    const isShortBurst = list.length <= 24;

    for (let i = 0; i < this.wireFaults.length; i++) {
      const f = this.wireFaults[i];
      if (f.used) continue;
      if (f.type === 'drop_handshake' && isShortBurst) {
        f.used = true;
        return; // Suppress wire transitions completely -> host turnaround timer expires
      }
      if (f.type === 'corrupt_crc' && !isShortBurst && list.length > 30) {
        f.used = true;
        list = list.map(t => ({ ...t }));
        const flipIdx = list.length - 5;
        list[flipIdx].dp ^= 1;
        list[flipIdx].dm ^= 1;
        break;
      }
      if (f.type === 'stuff_error' && !isShortBurst && list.length > 30) {
        f.used = true;
        list = list.map(t => ({ ...t }));
        // Force 7 consecutive identical bit levels starting at index 18
        const holdDp = list[17].dp;
        const holdDm = list[17].dm;
        for (let k = 18; k < Math.min(26, list.length - 3); k++) {
          list[k].dp = holdDp;
          list[k].dm = holdDm;
        }
        break;
      }
    }

    for (let i = 0; i < list.length; i++) {
      this.devTxQueue.push(list[i]);
    }
  }

  stepDevicesUntil(timeNs) {
    while (this.devTxCursor < this.devTxQueue.length && this.devTxQueue[this.devTxCursor].timeNs <= timeNs) {
      const ev = this.devTxQueue[this.devTxCursor++];
      if (this.curDp !== ev.dp || this.curDm !== ev.dm) {
        this.curDp = ev.dp;
        this.curDm = ev.dm;
        if (this.hostSim) {
          this.hostSim.scheduleNet(this.dpNetName, ev.dp, 0);
          this.hostSim.scheduleNet(this.dmNetName, ev.dm, 0);
        }
        this._recordTransition(ev.timeNs, ev.dp, ev.dm, this._classifyState(ev.dp, ev.dm));
      }
    }
    if (this.devTxCursor > 1024 && this.devTxCursor === this.devTxQueue.length) {
      this.devTxQueue.length = 0;
      this.devTxCursor = 0;
    }
    if (this.attachedDevice && typeof this.attachedDevice.stepUntil === 'function') {
      this.attachedDevice.stepUntil(timeNs);
    }
  }

  _classifyState(dp, dm) {
    if (dp === 0 && dm === 0) return 'SE0';
    if (dp === 1 && dm === 1) return 'SE1';
    if (this.lowSpeedPullUp) return (dm === 1 && dp === 0) ? 'J' : 'K';
    return (dp === 1 && dm === 0) ? 'J' : 'K';
  }

  _recordTransition(timeNs, dp, dm, state) {
    this.busTransitions.push({
      timeNs: +timeNs.toFixed(1),
      dp: dp & 1,
      dm: dm & 1,
      state
    });
    if (this.waveform.length < this.maxWaveformSamples) {
      this.waveform.push({
        timeNs: +timeNs.toFixed(1),
        dp: dp & 1,
        dm: dm & 1,
        state
      });
    }
  }
}

module.exports = {
  UsbLineModel
};
