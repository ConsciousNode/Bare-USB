#!/usr/bin/env node
/**
 * Bare USB — Self-Contained Offline HTML Application Builder (`bare-usb.html`)
 * ConsciousNode SoftWorks — Xinu Rules: one self-contained HTML file, zero dependencies, offline.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function stripCommonJs(src) {
  return src
    .replace(/'use strict';/g, '')
    .replace(/const\s+\{[^}]+\}\s*=\s*require\([^)]+\);/g, '')
    .replace(/const\s+\w+\s*=\s*require\(['"]crypto['"]\);/g, '')
    .replace(/if\s*\(require\.main\s*===\s*module\)\s*\{[\s\S]*?\n\}/g, '')
    .replace(/module\.exports\s*=\s*\{[\s\S]*?\};/g, '');
}

function buildHtml(jsonlPath, outHtmlPath) {
  const jsonlText = fs.readFileSync(jsonlPath, 'utf8').trim();
  const records = jsonlText.split('\n').map(line => JSON.parse(line));

  const partsSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/parts-library.js'), 'utf8'));
  const tablesSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'scripts/generate-tables.js'), 'utf8'))
    .replace(/function computeTablesDigest[\s\S]*$/, '');
  const simSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/simulator.js'), 'utf8'));
  const netlistSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/netlist.js'), 'utf8'));
  const lineSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/line-model.js'), 'utf8'));
  const pinHarnessSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/pin-harness.js'), 'utf8'));
  const refSieSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/ref-sie.js'), 'utf8'))
    .replace(/const USB_PIDS = \{[\s\S]*?\};/, '')
    .replace(/const SIE_REGS = \{[\s\S]*?\};/, '')
    .replace(/const CSR_STATUS = \{[\s\S]*?\};/, '')
    .replace(/const CSR_CMD = \{[\s\S]*?\};/, '');
  const devicesSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/devices.js'), 'utf8'))
    .replace(/const expectedSha256 = crypto\.createHash\('sha256'\)\.update\(fileBytes\)\.digest\('hex'\);/, 'const expectedSha256 = fnv1a64Hex(fileBytes);');
  const driverSrc = stripCommonJs(fs.readFileSync(path.join(ROOT_DIR, 'src/driver.js'), 'utf8'))
    .replace(/const sha256 = crypto\.createHash\('sha256'\)\.update\(fileData\)\.digest\('hex'\);/, 'const sha256 = fnv1a64Hex(fileData);');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bare USB — Discrete 74LVC + 10 ns SRAM USB 1.1 Host SIE Gate-Level Simulator</title>
  <style>
    :root {
      --bg-0: #0b0f17;
      --bg-1: #111827;
      --bg-2: #1f2937;
      --bg-3: #374151;
      --text-0: #f9fafb;
      --text-1: #d1d5db;
      --text-2: #9ca3af;
      --accent: #38bdf8;
      --accent-dim: #0284c7;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --purple: #a78bfa;
      --border: #2dd4bf33;
      --card-border: #374151;
      --mono: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-0);
      color: var(--text-0);
      font-family: var(--sans);
      line-height: 1.5;
      font-size: 14px;
      overflow-x: hidden;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { max-width: 1400px; margin: 0 auto; padding: 16px; }
    header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 16px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .title-block h1 {
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--mono);
      text-transform: uppercase;
    }
    .badge-pass { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-fail { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-info { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); }
    .badge-warn { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .subtitle { color: var(--text-2); font-size: 12.5px; margin-top: 4px; }
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: var(--bg-1);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 14px;
    }
    .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-2); }
    .kpi-value { font-size: 20px; font-weight: 700; font-family: var(--mono); color: var(--text-0); margin-top: 3px; }
    .kpi-sub { font-size: 11.5px; color: var(--text-2); margin-top: 2px; }
    .nav-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 10px;
    }
    .tab-btn {
      background: var(--bg-1);
      color: var(--text-1);
      border: 1px solid var(--card-border);
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { background: var(--bg-2); color: #fff; }
    .tab-btn.active {
      background: var(--accent-dim);
      color: #fff;
      border-color: var(--accent);
    }
    .panel {
      display: none;
      background: var(--bg-1);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .panel.active { display: block; }
    .panel-title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
      gap: 10px;
      background: var(--bg-2);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--bg-3);
      margin-bottom: 14px;
    }
    .ctrl-group { display: flex; flex-direction: column; gap: 4px; }
    .ctrl-group label { font-size: 11px; font-weight: 600; color: var(--text-2); text-transform: uppercase; }
    select, input[type="range"], button.action-btn {
      background: var(--bg-0);
      color: var(--text-0);
      border: 1px solid var(--bg-3);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 12.5px;
      font-family: var(--sans);
    }
    button.action-btn {
      cursor: pointer;
      font-weight: 600;
      background: var(--accent-dim);
      border-color: var(--accent);
      color: #fff;
      transition: opacity 0.15s;
    }
    button.action-btn:hover { opacity: 0.92; }
    button.action-btn.secondary {
      background: var(--bg-1);
      border-color: var(--bg-3);
      color: var(--text-1);
    }
    .wave-wrap {
      background: #06090f;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 14px;
    }
    canvas#waveCanvas {
      width: 100%;
      height: 290px;
      display: block;
      cursor: crosshair;
    }
    .wave-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--text-2);
    }
    .split-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
    }
    @media (max-width: 960px) {
      .split-grid { grid-template-columns: 1fr; }
    }
    .table-scroll {
      overflow-x: auto;
      max-height: 440px;
      overflow-y: auto;
      border: 1px solid var(--bg-3);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid #1f2937;
    }
    th {
      background: #0f172a;
      color: var(--text-2);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    tr:hover td { background: rgba(56, 189, 248, 0.05); }
    tr.clickable-row { cursor: pointer; }
    tr.selected-row td { background: rgba(56, 189, 248, 0.14); }
    .mono { font-family: var(--mono); font-size: 12px; }
    .num { text-align: right; font-family: var(--mono); }
    .inspector-box {
      background: #090d14;
      border: 1px solid var(--bg-3);
      border-radius: 8px;
      padding: 12px;
      font-family: var(--mono);
      font-size: 12px;
      max-height: 440px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #e2e8f0;
    }
    .test-card {
      background: var(--bg-2);
      border: 1px solid var(--bg-3);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .test-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .toast {
      position: fixed;
      bottom: 18px;
      right: 18px;
      background: #0f172a;
      border: 1px solid var(--accent);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12.5px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: none;
      z-index: 50;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-block">
        <h1>
          <span>Bare USB: Discrete 74LVC + 10 ns SRAM USB 1.1 Host SIE</span>
          <span id="hdrAllBadge" class="badge badge-info">LOADING...</span>
          <span class="badge badge-info">ZERO MCU / CPLD / FPGA</span>
        </h1>
        <div class="subtitle">
          ConsciousNode SoftWorks — Event-driven gate-level simulator (FS 12 Mb/s &amp; LS 1.5 Mb/s), differential reference SIE, independent USB 2.0 devices, and 10 µs/access CPU-budgeted driver.
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="btnExportJsonl" class="action-btn secondary" type="button">Export results.jsonl</button>
        <button id="btnRunLiveHeader" class="action-btn" type="button">Run Live Gate Simulation</button>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-card">
        <div class="kpi-label">Discrete Chip Count &amp; BOM</div>
        <div class="kpi-value" id="kpiChips">—</div>
        <div class="kpi-sub" id="kpiBomCost">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Worst-Case Timing Margin</div>
        <div class="kpi-value" id="kpiTiming">—</div>
        <div class="kpi-sub" id="kpiTimingSub">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Setup / Hold Violations</div>
        <div class="kpi-value" id="kpiViolations">—</div>
        <div class="kpi-sub" id="kpiEvalCount">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">FS 64 KB Bulk Read Budget</div>
        <div class="kpi-value" id="kpiFsBudget">—</div>
        <div class="kpi-sub" id="kpiFsFrame">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">LS HID Keyboard Budget</div>
        <div class="kpi-value" id="kpiLsBudget">—</div>
        <div class="kpi-sub" id="kpiLsFrame">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Netlist Mutants Killed</div>
        <div class="kpi-value" id="kpiMutants">—</div>
        <div class="kpi-sub" id="kpiMutantsSub">—</div>
      </div>
    </div>

    <nav class="nav-tabs" aria-label="Main views">
      <button class="tab-btn active" data-tab="tab-wave" type="button">1. Waveform &amp; Packet Analyzer</button>
      <button class="tab-btn" data-tab="tab-tests" type="button">2. Verification Suite (Tests 1–9)</button>
      <button class="tab-btn" data-tab="tab-bom" type="button">3. Chip Count, BOM &amp; Closed-Box Netlist</button>
      <button class="tab-btn" data-tab="tab-timing" type="button">4. Critical-Path Timing &amp; CPU Budget</button>
      <button class="tab-btn" data-tab="tab-arch" type="button">5. Register Interface &amp; Provenance</button>
    </nav>

    <!-- TAB 1: WAVEFORM & PACKET ANALYZER -->
    <section id="tab-wave" class="panel active">
      <div class="panel-title">
        <span>Interactive D+/D− Differential Bus Oscilloscope &amp; Gate-Level Fault Lab</span>
        <span id="simStatusBadge" class="badge badge-pass">LIVE SIM READY</span>
      </div>

      <div class="controls-grid">
        <div class="ctrl-group">
          <label for="selDevice">Target USB 2.0 Device</label>
          <select id="selDevice">
            <option value="msc">Full-Speed Mass Storage (12 Mb/s, FAT16)</option>
            <option value="hid">Low-Speed HID Boot Keyboard (1.5 Mb/s)</option>
          </select>
        </div>
        <div class="ctrl-group">
          <label for="selCorner">74LVC / SRAM Delay Corner</label>
          <select id="selCorner">
            <option value="max">Worst-Case Max Delays (−40..+85 °C)</option>
            <option value="min">Best-Case Min Delays</option>
            <option value="typ">Typical Delays</option>
          </select>
        </div>
        <div class="ctrl-group">
          <label for="selSkew">Host 48 MHz Clock Skew</label>
          <select id="selSkew">
            <option value="0">Nominal (0.00% / 48.000 MHz)</option>
            <option value="0.25">+0.25% Fast Corner (48.120 MHz)</option>
            <option value="-0.25">−0.25% Slow Corner (47.880 MHz)</option>
          </select>
        </div>
        <div class="ctrl-group">
          <label for="selMutant">Netlist Mutant (Test 6 Controls)</label>
          <select id="selMutant">
            <option value="">None (Unmutated Netlist)</option>
            <option value="crc16_tap_moved">Mutant 1: CRC-16 Tap Moved (Q1 -> Q3)</option>
            <option value="bit_stuff_off_by_one">Mutant 2: Bit-Stuff Counter Off-By-One (5 ones)</option>
            <option value="nrzi_rx_inverted">Mutant 3: NRZI Receive Inverted</option>
            <option value="turnaround_short">Mutant 4: Turnaround Timer Too Short (2 bits)</option>
            <option value="sof_missing">Mutant 5: 1 ms SOF / Keep-Alive Missing</option>
            <option value="fsm_bad_next_state">Mutant 6: FSM LUT Next-State Corrupted</option>
            <option value="auto_ack_late">Mutant 7: Auto-ACK Turnaround Too Late</option>
            <option value="dpll_resync_disabled">Mutant 8: DPLL Edge Resync Disabled</option>
            <option value="buf_addr_carry_broken">Mutant 9: Buffer Address Counter Carry Broken</option>
            <option value="reg_dec_swapped">Mutant 10: Register Port Decoder Swapped</option>
              <option value="mcp_source_changes_off_enable">Mutant 11: MCP Source Changes Off-Enable</option>
              <option value="mcp_endpoint_captures_off_enable">Mutant 12: MCP Endpoint Captures Off-Enable</option>
          </select>
        </div>
        <div class="ctrl-group">
          <label for="selFault">Line Error Injection (Test 7)</label>
          <select id="selFault">
            <option value="none">None (Clean D+/D− Bus)</option>
            <option value="all3">Inject All 3 (CRC + Stuff + Drop ACK)</option>
            <option value="corrupt_crc">Inject Corrupted CRC-16 on DATA1</option>
            <option value="stuff_error">Inject Bit-Stuffing Violation on DATA0</option>
            <option value="drop_handshake">Inject Dropped ACK Handshake</option>
          </select>
        </div>
        <div class="ctrl-group" style="justify-content:flex-end;">
          <label>&nbsp;</label>
          <button id="btnExecuteSim" class="action-btn" type="button">Execute Gate-Level Run</button>
        </div>
      </div>

      <div class="wave-wrap">
        <div class="wave-toolbar">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span><strong>Signals:</strong> <span style="color:#38bdf8;">■ D+</span> &nbsp;<span style="color:#f43f5e;">■ D−</span> &nbsp;<span style="color:#10b981;">■ Diff (J/K/SE0)</span> &nbsp;<span style="color:#a78bfa;">■ NRZI Bit / Stuff</span></span>
            <label for="rngZoom">Zoom:</label>
            <input id="rngZoom" type="range" min="1" max="8" step="1" value="2" style="width:90px;">
            <span id="lblZoom" class="mono">2x</span>
            <label for="rngPan">Timeline Pan:</label>
            <input id="rngPan" type="range" min="0" max="100" step="1" value="0" style="width:140px;">
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label for="selPktFilter">Filter Packets:</label>
            <select id="selPktFilter">
              <option value="ALL">All Packets</option>
              <option value="HOST->DEV">HOST -&gt; DEV</option>
              <option value="DEV->HOST">DEV -&gt; HOST</option>
              <option value="SOF">SOF / Keep-Alive</option>
            </select>
          </div>
        </div>
        <canvas id="waveCanvas" width="1280" height="290"></canvas>
      </div>

      <div class="split-grid">
        <div>
          <div class="panel-title" style="font-size:13.5px;">
            <span>Decoded USB 1.1 Packet Trace (Click row to inspect NRZI &amp; Gate Evaluations)</span>
            <span id="pktCountLabel" class="mono" style="color:var(--text-2);">0 packets</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Start (ns)</th>
                  <th>Dir</th>
                  <th>Speed</th>
                  <th>PID</th>
                  <th class="num">Payload (B)</th>
                  <th class="num">NRZI Bits</th>
                </tr>
              </thead>
              <tbody id="pktTableBody"></tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="panel-title" style="font-size:13.5px;">
            <span>Gate-Level Packet &amp; Register Inspector</span>
            <span id="inspSummaryBadge" class="badge badge-info">SELECT PACKET</span>
          </div>
          <div id="packetInspector" class="inspector-box"></div>
        </div>
      </div>
    </section>

    <!-- TAB 2: VERIFICATION SUITE (TESTS 1-8) -->
    <section id="tab-tests" class="panel">
      <div class="panel-title">
        <span>Automated Verification Suite Results (Tests 1–9 from results.jsonl)</span>
        <span class="badge" id="testsTabBadge">—</span>
      </div>
      <div id="testsContainer"></div>
    </section>

    <!-- TAB 3: CHIP COUNT, BOM & 48-CHIP NETLIST -->
    <section id="tab-bom" class="panel">
      <div class="panel-title">
        <span>Bill of Materials (BOM) &amp; Discrete-Logic Netlist Explorer</span>
        <span id="bomHeaderBadge" class="badge badge-info">—</span>
      </div>
      <div class="split-grid">
        <div>
          <div class="panel-title" style="font-size:13.5px;">Bill of Materials (Generated from Netlist &amp; Datasheets)</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Part Type</th>
                  <th>Part Number</th>
                  <th class="num">Qty</th>
                  <th class="num">Unit ($)</th>
                  <th class="num">Ext ($)</th>
                  <th class="num">tpd Min/Max (ns)</th>
                  <th class="num">tsu/th (ns)</th>
                </tr>
              </thead>
              <tbody id="bomTableBody"></tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="panel-title" style="font-size:13.5px;">
            <span>Instantiated Netlist Chips (Click to inspect pin wiring)</span>
            <input id="inpChipSearch" type="text" placeholder="Filter chip ID or role..." style="background:var(--bg-0);color:var(--text-0);border:1px solid var(--bg-3);border-radius:5px;padding:4px 8px;font-size:12px;">
          </div>
          <div class="table-scroll" style="max-height:240px; margin-bottom:10px;">
            <table>
              <thead>
                <tr>
                  <th>Chip ID</th>
                  <th>Part Type</th>
                  <th>Subsystem Role</th>
                </tr>
              </thead>
              <tbody id="chipListBody"></tbody>
            </table>
          </div>
          <div id="chipPinInspector" class="inspector-box" style="max-height:180px;">Select a chip above to view its pin-to-net wiring map and datasheet timing parameters.</div>
        </div>
      </div>
    </section>

    <!-- TAB 4: CRITICAL-PATH TIMING & CPU BUDGET -->
    <section id="tab-timing" class="panel">
      <div class="panel-title">
        <span>Worst-Case Critical-Path Timing Margins &amp; Ternary CPU Budget (10 µs/access)</span>
        <span id="timingHeaderBadge" class="badge badge-info">—</span>
      </div>
      <div style="margin-bottom:16px;">
        <div class="panel-title" style="font-size:13.5px;">Critical-Path Static Timing Analysis (−40..+85 °C at 3.3 V ± 0.3 V, +0.25% Fast Clock)</div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Critical Path</th>
                <th>Clock Domain</th>
                <th class="num">Budget (ns)</th>
                <th>Component Delay Chain</th>
                <th class="num">Min (ns)</th>
                <th class="num">Max (ns)</th>
                <th class="num">Slack Margin (ns)</th>
              </tr>
            </thead>
            <tbody id="timingTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="split-grid">
        <div>
          <div class="panel-title" style="font-size:13.5px;">Dynamic Corner Runs (Test 2 Setup/Hold Verification)</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Corner</th>
                  <th>Delays</th>
                  <th class="num">Host Skew</th>
                  <th class="num">Dev Skew</th>
                  <th class="num">Gate Evals</th>
                  <th class="num">Violations</th>
                  <th class="num">Min Bit Slack</th>
                </tr>
              </thead>
              <tbody id="cornerTableBody"></tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="panel-title" style="font-size:13.5px;">Measured CPU I/O Budget (Test 8 @ 10 µs / 16-bit Register Access)</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Workload</th>
                  <th class="num">Transfers</th>
                  <th class="num">Reg Accesses</th>
                  <th class="num">Accesses/Xfer</th>
                  <th class="num">CPU µs / 1ms Frame</th>
                  <th class="num">Frame Util %</th>
                </tr>
              </thead>
              <tbody id="budgetTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 5: REGISTER INTERFACE & PROVENANCE -->
    <section id="tab-arch" class="panel">
      <div class="panel-title">
        <span>16-Bit CPU Register Specification, Shadowed SRAM LUT Disclosure &amp; Provenance Hashes</span>
        <span class="badge badge-info">DISCLOSED LUT GENERATOR</span>
      </div>
      <div class="split-grid">
        <div>
          <div class="panel-title" style="font-size:13.5px;">Backplane 16-Bit Register Map (Decoded by U43 74LVC138A)</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Register</th>
                  <th>Dir</th>
                  <th>Bit Assignments &amp; Hardware Action</th>
                </tr>
              </thead>
              <tbody>
                <tr><td class="mono">0x00</td><td class="mono">SIE_CSR</td><td>R/W</td><td><strong>Read (STATUS):</strong> [0] BUSY, [1] DONE, [2] ERR_TIMEOUT, [3] ERR_CRC, [4] ERR_STUFF, [5] ATTACHED, [6] LOW_SPEED, [7] SOF_SENT, [11:8] LAST_PID, [12] TOGGLE_OK, [13] IRQ_PENDING.<br><strong>Write (CMD):</strong> [3:0] TOKEN_PID, [4] DATA_TOGGLE, [5] AUTO_ACK, [6] AUTO_SOF_EN, [7] SPEED_SEL, [8] START_XFER, [9] BUS_RESET, [10] CLR_IRQ, [11] BUF_RST.</td></tr>
                <tr><td class="mono">0x01</td><td class="mono">SIE_TARGET</td><td>R/W</td><td>[6:0] 7-bit USB Device Address (0..127), [10:7] 4-bit Endpoint Number (0..15).</td></tr>
                <tr><td class="mono">0x02</td><td class="mono">SIE_LEN</td><td>R/W</td><td>Write: TX byte length (0..64) &amp; resets SRAM buffer pointer. Read: RX byte length received in last IN packet.</td></tr>
                <tr><td class="mono">0x03</td><td class="mono">SIE_DATA16</td><td>R/W</td><td>16-bit auto-incrementing Buffer SRAM data port (U41 even byte, U42 odd byte; steps U39..U40 74LVC161 word counter).</td></tr>
                <tr><td class="mono">0x04</td><td class="mono">SIE_FRAME</td><td>R</td><td>[10:0] 11-bit hardware USB frame counter (U31..U33 74LVC161, incremented every 1.000 ms).</td></tr>
                <tr><td class="mono">0x05</td><td class="mono">SIE_BUF_PTR</td><td>R/W</td><td>[7:0] Explicit Buffer SRAM 16-bit word address pointer.</td></tr>
                <tr><td class="mono">0x06</td><td class="mono">SIE_DIAG</td><td>R</td><td>[7:0] Hardware CRC error counter; [15:8] Hardware Bit-Stuff &amp; Turnaround Timeout error counter.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="panel-title" style="font-size:13.5px;">Code &amp; Shadowed SRAM Table Provenance Hashes (results.jsonl)</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Module / Artifact</th>
                  <th>SHA-256 Digest</th>
                </tr>
              </thead>
              <tbody id="hashTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>

  <div id="toastBox" class="toast"></div>

  <script>
    // Fast browser-compatible deterministic 64-bit FNV-1a hex digest for live in-browser file verification
    function fnv1a64Hex(bytes) {
      let h1 = 0x811c9dc5 >>> 0;
      let h2 = 0xcbf29ce4 >>> 0;
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i] & 0xff;
        h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ ((b << 3) | (b >>> 5)), 0x01000193) >>> 0;
      }
      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }

    const PRECOMPUTED_RESULTS = ${JSON.stringify(records)};

    // --- INLINED MODULES (Provenance: Bare USB Discrete-Logic Simulator Suite) ---
    ${partsSrc}
    ${tablesSrc}
    ${simSrc}
    ${netlistSrc}
    ${pinHarnessSrc}
    ${lineSrc}
    ${refSieSrc}
    ${devicesSrc}
    ${driverSrc}

    // --- UI STATE & CONTROLLERS ---
    const PID_NAMES = {
      0x1: 'OUT (0x1)',
      0x9: 'IN (0x9)',
      0x5: 'SOF (0x5)',
      0xD: 'SETUP (0xD)',
      0x3: 'DATA0 (0x3)',
      0xB: 'DATA1 (0xB)',
      0x2: 'ACK (0x2)',
      0xA: 'NAK (0xA)',
      0xE: 'STALL (0xE)',
      'KEEPALIVE_EOP': 'LS_KEEPALIVE'
    };

    let currentWaveSamples = [];
    let currentPacketTrace = [];
    let currentRegTrace = [];
    let selectedPacketIdx = 0;
    let netlistSimInstance = null;

    function showToast(msg) {
      const el = document.getElementById('toastBox');
      el.textContent = msg;
      el.style.display = 'block';
      clearTimeout(el._timer);
      el._timer = setTimeout(() => { el.style.display = 'none'; }, 3200);
    }

    function initFromPrecomputed() {
      const meta = PRECOMPUTED_RESULTS.find(r => r.recordType === 'meta') || {};
      const hw = PRECOMPUTED_RESULTS.find(r => r.recordType === 'hardware_bom') || { totalChips: 0, totalCostUsd: 0, bom: [] };
      const tests = PRECOMPUTED_RESULTS.filter(r => r.recordType === 'test_result').sort((a, b) => a.testId - b.testId);
      const t4 = tests.find(t => t.testId === 4) || { corners: [] };
      const t5 = tests.find(t => t.testId === 5) || {};
      const t6 = tests.find(t => t.testId === 6) || { mutants: [] };
      const t8 = tests.find(t => t.testId === 8) || {};

      const passedCount = tests.filter(t => t.passed).length;
      const tbBadge = document.getElementById('testsTabBadge');
      if (tbBadge) { tbBadge.textContent = passedCount + ' / ' + tests.length + ' PASSED'; tbBadge.className = 'badge ' + (meta.allTestsPassed ? 'badge-pass' : 'badge-fail'); }
      const hdrBadge = document.getElementById('hdrAllBadge');
      hdrBadge.className = 'badge ' + (meta.allTestsPassed ? 'badge-pass' : 'badge-fail');
      hdrBadge.textContent = meta.allTestsPassed
        ? \`ALL \${tests.length} TESTS PASS\`
        : \`\${passedCount}/\${tests.length} TESTS PASS (\${tests.length - passedCount} FAIL)\`;

      document.getElementById('kpiChips').textContent = \`\${hw.totalChips} Chips\`;
      document.getElementById('kpiBomCost').textContent = \`\${(hw.totalCostUsd || 0).toFixed(2)} USD (74LVC + 10ns SRAM + USB1T11A)\`;
      document.getElementById('bomHeaderBadge').textContent = \`\${hw.totalChips} CHIPS — \${(hw.totalCostUsd || 0).toFixed(2)} USD\`;

      const totalViol = (t4.corners || []).reduce((acc, c) => acc + (c.setupHoldViolations || 0), 0);
      const minDpll = (t4.corners || []).reduce((m, c) => c.simulatedDpllSlackNs != null ? Math.min(m, c.simulatedDpllSlackNs) : m, Infinity);
      const minFsm = (t4.corners || []).reduce((m, c) => c.simulatedFsmSlackNs != null ? Math.min(m, c.simulatedFsmSlackNs) : m, Infinity);
      const staMax = t4.sta && t4.sta.max;
      const timingEl = document.getElementById('kpiTiming');
      if (staMax && staMax.worstSlackNs != null) {
        timingEl.textContent = 'STA max ' + (staMax.worstSlackNs >= 0 ? '+' : '') + staMax.worstSlackNs.toFixed(2) + ' ns';
        timingEl.style.color = staMax.passed ? 'var(--green)' : 'var(--red)';
        document.getElementById('kpiTimingSub').textContent = 'STA max ' + staMax.failingEndpoints + '/' + staMax.totalEndpoints + ' fail (' + staMax.worstArrivalNs + ' ns) | ' + totalViol + ' dyn viol';
      } else {
        timingEl.textContent = Number.isFinite(minDpll) ? ('DPLL ' + (minDpll >= 0 ? '+' : '') + minDpll.toFixed(2) + ' ns') : '—';
        timingEl.style.color = totalViol === 0 ? 'var(--green)' : 'var(--amber)';
        document.getElementById('kpiTimingSub').textContent = 'FSM ' + (Number.isFinite(minFsm) ? (minFsm >= 0 ? '+' : '') + minFsm.toFixed(2) : '—') + ' ns | ' + totalViol + ' violations across ' + (t4.corners || []).length + ' corners';
      }
      const timingBadge = document.getElementById('timingHeaderBadge');
      timingBadge.className = 'badge ' + (totalViol === 0 ? 'badge-pass' : 'badge-fail');
      timingBadge.textContent = totalViol === 0 ? '0 VIOLATIONS' : \`\${totalViol} VIOLATIONS\`;
      const totalEvals = (t4.corners || []).reduce((acc, c) => acc + (c.gateEvaluations || 0), 0);
      const violEl = document.getElementById('kpiViolations');
      violEl.textContent = \`\${totalViol.toLocaleString()} Violations\`;
      violEl.style.color = totalViol === 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('kpiEvalCount').textContent = \`\${(totalEvals / 1e6).toFixed(2)}M gate evaluations across \${(t4.corners || []).length} corners\`;
      const mutEl = document.getElementById('kpiMutants');
      const killedCnt = t6.killedMutants || 0;
      const totalMut = t6.totalMutants || (t6.mutants || []).length || 10;
      mutEl.textContent = \`\${killedCnt} / \${totalMut} Killed\`;
      mutEl.style.color = t6.passed ? 'var(--green)' : 'var(--red)';
      document.getElementById('kpiMutantsSub').textContent = (t6.baselineMscOk && t6.baselineHidOk)
        ? \`\${(t6.survivingMutants || []).length} surviving mutants\`
        : 'Gated on unmutated baseline passing (currently FAIL)';

      const fsBMin = t8.fsMassStorageMin || (t5.fsMassStorageMin && t5.fsMassStorageMin.cpuBudget);
      const fsBMax = t8.fsMassStorage || (t5.fsMassStorage && t5.fsMassStorage.cpuBudget);
      const idleMin = t8.idleKeyboardMin;
      const idleMax = t8.idleKeyboardMax;
      const fsB = (fsBMax && fsBMax.measurable !== false) ? fsBMax : fsBMin;
      const lsB = (idleMin && idleMin.measurable !== false) ? idleMin : idleMax;
      document.getElementById('kpiFsBudget').textContent = (fsB && fsB.measurable !== false && fsB.regAccessesPerByte != null)
        ? (fsB.regAccessesPerByte + ' reg/B')
        : (fsBMax && fsBMax.note ? fsBMax.note : 'not measurable');
      document.getElementById('kpiFsFrame').textContent = (fsBMin && fsBMin.measurable !== false && fsBMin.cpuUsPerByte != null)
        ? \`min: \${fsBMin.cpuUsPerByte} µs/B (64KB OK) | max: \${t5.fsMassStorage && t5.fsMassStorage.passed ? '64KB OK' : 'FAIL @ ' + (t5.fsMassStorage ? t5.fsMassStorage.stage : 'n/a')}\`
        : 'not measurable (workload failed)';
      document.getElementById('kpiLsBudget').textContent = (lsB && lsB.measurable !== false && lsB.idleDutyPct != null)
        ? (lsB.idleDutyPct + '% idle duty')
        : (lsB && lsB.note ? lsB.note : 'not measurable');
      document.getElementById('kpiLsFrame').textContent = (idleMin && idleMin.measurable !== false && idleMin.cpuTimeUsPerMsFrame != null)
        ? \`min: \${idleMin.cpuTimeUsPerMsFrame} µs / 1 ms (1 poll/ms, \${idleMin.violations} viol)\`
        : 'not measurable (workload failed)';

      const bomTbody = document.getElementById('bomTableBody');
      bomTbody.innerHTML = (hw.bom || []).map(item => \`
        <tr>
          <td class="mono">\${item.type}</td>
          <td><a href="\${item.datasheetUrl}" target="_blank" rel="noopener">\${item.partNumber}</a><br><span style="font-size:11px;color:var(--text-2);">\${item.description}</span></td>
          <td class="num">\${item.qty}</td>
          <td class="num">\${item.unitPriceUsd.toFixed(2)}</td>
          <td class="num">\${item.extPriceUsd.toFixed(2)}</td>
          <td class="num">\${item.tpdMinNs.toFixed(1)} / \${item.tpdMaxNs.toFixed(1)}</td>
          <td class="num">\${item.tSetupNs.toFixed(1)} / \${item.tHoldNs.toFixed(1)}</td>
        </tr>
      \`).join('');

      netlistSimInstance = new GateSimulator({ delayCorner: 'max' });
      buildSieNetlist(netlistSimInstance, {});
      renderChipList('');

      document.getElementById('timingTableBody').innerHTML = \`
        <tr><td><strong>Measured DPLL Resync Path</strong></td><td class="mono">CLK_48M (20.83 ns)</td><td class="num">20.833</td><td style="font-size:11.5px;color:var(--text-1);">U04_DPLL_EDGE_FF → U09 → U12 → U10 → U05_DPLL_PHASE_CNT.PE_N</td><td class="num">—</td><td class="num">—</td><td class="num">\${Number.isFinite(minDpll) ? (minDpll >= 0 ? '+' : '') + minDpll.toFixed(3) : '—'}</td></tr>
        <tr><td><strong>Measured FSM State/LUT Path</strong></td><td class="mono">CLK_48M (20.83 ns)</td><td class="num">20.833</td><td style="font-size:11.5px;color:var(--text-1);">U34_FSM_STATE → U35_LUT_FSM_LO → U185 → U34_FSM_STATE</td><td class="num">—</td><td class="num">—</td><td class="num">\${Number.isFinite(minFsm) ? (minFsm >= 0 ? '+' : '') + minFsm.toFixed(3) : '—'}</td></tr>
      \`;

      document.getElementById('cornerTableBody').innerHTML = (t4.corners || []).map(c => \`
        <tr>
          <td class="mono">\${c.label}</td>
          <td class="mono">\${c.delayCorner}</td>
          <td class="num">\${c.hostClockSkewPct >= 0 ? '+' : ''}\${c.hostClockSkewPct}%</td>
          <td class="num">\${c.devClockSkewPct >= 0 ? '+' : ''}\${c.devClockSkewPct}%</td>
          <td class="num">\${c.gateEvaluations.toLocaleString()}</td>
          <td class="num" style="color:\${c.setupHoldViolations === 0 ? 'var(--green)' : 'var(--red)'};">\${c.setupHoldViolations}</td>
          <td class="num">DPLL \${c.simulatedDpllSlackNs != null ? (c.simulatedDpllSlackNs >= 0 ? '+' : '') + c.simulatedDpllSlackNs.toFixed(2) : '—'} / FSM \${c.simulatedFsmSlackNs != null ? (c.simulatedFsmSlackNs >= 0 ? '+' : '') + c.simulatedFsmSlackNs.toFixed(2) : '—'} ns</td>
        </tr>
      \`).join('');

      const fmtBudgetRow = (label, b, isIdle) => {
        if (!b || b.measurable === false) {
          return '<tr><td><strong>' + label + '</strong></td><td class="num">—</td><td class="num">—</td><td class="num">not measurable</td><td class="num">—</td><td class="num">—</td></tr>';
        }
        if (isIdle) {
          return '<tr><td><strong>' + label + '</strong></td><td class="num">' + b.frames + ' frames</td><td class="num">' + b.totalRegAccesses + '</td><td class="num"><strong>' + b.regAccessesPerFrame + ' reg/ms</strong></td><td class="num"><strong>' + b.cpuTimeUsPerMsFrame + ' µs</strong></td><td class="num">' + b.idleDutyPct + '%</td></tr>';
        }
        return '<tr><td><strong>' + label + '</strong></td><td class="num">' + b.totalTransfers + '</td><td class="num">' + b.totalRegAccesses + '</td><td class="num"><strong>' + (b.regAccessesPerByte != null ? b.regAccessesPerByte + ' reg/B' : b.regAccessesPerTransfer) + '</strong></td><td class="num"><strong>' + (b.cpuUsPerByte != null ? b.cpuUsPerByte + ' µs/B' : b.cpuTimeUsPerMsFrame + ' µs') + '</strong></td><td class="num">' + (b.cpuUtilizationPct != null ? b.cpuUtilizationPct + '%' : '—') + '</td></tr>';
      };
      document.getElementById('budgetTableBody').innerHTML = [
        fmtBudgetRow('FS 64 KB Read (min)', fsBMin, false),
        fmtBudgetRow('FS 64 KB Read (max)', fsBMax, false),
        fmtBudgetRow('Idle LS Keyboard (min, 1 poll/ms)', idleMin, true),
        fmtBudgetRow('Idle LS Keyboard (max, 1 poll/ms)', idleMax, true)
      ].join('');

      const hashRows = Object.entries((meta.codeHashes && meta.codeHashes.files) || {}).map(([f, h]) => \`<tr><td class="mono">\${f}</td><td class="mono">\${h}</td></tr>\`);
      if (meta.codeHashes && meta.codeHashes.tablesDigest) {
        hashRows.push(\`<tr><td><strong>Shadowed SRAM LUTs (\${meta.codeHashes.tablesDigest.totalBytes} B)</strong></td><td class="mono">\${meta.codeHashes.tablesDigest.sha256}</td></tr>\`);
        hashRows.push(\`<tr><td><strong>Combined Source Digest</strong></td><td class="mono">\${meta.codeHashes.combinedSha256}</td></tr>\`);
      }
      document.getElementById('hashTableBody').innerHTML = hashRows.join('');

      renderTestsCards(tests);
      runInteractiveSimulation();
    }

    function renderTestsCards(tests) {
      const container = document.getElementById('testsContainer');
      container.innerHTML = tests.map(t => {
        let detailsHtml = '';
        if (t.testId === 1) {
          const nl = t.netDriverLint || {}; detailsHtml = '<div class="mono" style="font-size:12px;color:var(--text-1);">• Tokens: ' + (t.tokenHits || []).length + ', Chips: ' + t.totalChipsScanned + ', Undriven nets: ' + (nl.undrivenCount || 0) + ', Mutant: ' + (t.undrivenNetMutant && t.undrivenNetMutant.caught ? 'CAUGHT' : 'MISSED') + '</div>';
        } else if (t.testId === 2) {
          detailsHtml = \`<div class="mono" style="font-size:12px;color:var(--text-1);">• Planted .state peek detected: \${!t.plantedScanPassed}</div>\`;
        } else if (t.testId === 3) {
          detailsHtml = \`<div class="mono" style="font-size:12px;color:var(--text-1);">• Gate ok=\${t.gateOk} (stage=\${t.gateStage || 'COMPLETE'}, \${t.gateTransitions} wire ev) vs Ref ok=\${t.refOk} (\${t.refTransitions} wire ev)</div>\`;
        } else if (t.testId === 4) {
          const clean = (t.corners || []).filter(c => c.passed).length;
          const sp = t.enableSpacingCheck && t.enableSpacingCheck.passed ? 'PASS' : 'FAIL'; const sw = t.bufSramWriteCheck && t.bufSramWriteCheck.passed ? 'PASS' : 'FAIL'; const fp = t.falsePathCheck && t.falsePathCheck.passed ? 'PASS' : 'FAIL'; const pc = t.tristatePositiveControls && t.tristatePositiveControls.passed ? '3/3 CAUGHT' : 'FAIL'; detailsHtml = '<div class="mono" style="font-size:12px;color:var(--text-1);">• ' + clean + '/' + (t.corners || []).length + ' corners clean | Spacing>=3: ' + sp + ' | SRAM WR/3-state: ' + sw + ' | Pos-Ctrls: ' + pc + ' | FP: ' + fp + '</div>';
        } else if (t.testId === 5) {
          detailsHtml = \`<div class="mono" style="font-size:12px;color:var(--text-1);">• FS: \${t.fsMassStorage ? (t.fsMassStorage.passed ? '64KB OK' : t.fsMassStorage.stage) : 'n/a'} | LS: \${t.lsHidKeyboard ? t.lsHidKeyboard.exactMatches + '/100 keys' : 'n/a'}</div>\`;
        } else if (t.testId === 6) {
          detailsHtml = \`<div class="mono" style="font-size:12px;color:var(--text-1);">• Baseline MSC=\${t.baselineMscOk}, HID=\${t.baselineHidOk} | Killed \${t.killedMutants}/\${t.totalMutants} mutants</div>\`;
        } else if (t.testId === 7) {
          const fMin = (t.individualFaultsMin || []).map(x => x.fault + ':' + x.retriesExecuted + 'r').join(', '); const fMax = (t.individualFaultsMax || []).map(x => x.fault + ':' + x.retriesExecuted + 'r').join(', '); detailsHtml = '<div class="mono" style="font-size:12px;color:var(--text-1);">• Combined=' + t.retriesExecuted + 'r | min: [' + fMin + '] | max: [' + fMax + ']</div>';
        } else if (t.testId === 8) {
          const fm = t.fsMassStorageMin && t.fsMassStorageMin.measurable ? (t.fsMassStorageMin.regAccessesPerByte + ' reg/B') : 'not measurable';
          const im = t.idleKeyboardMin && t.idleKeyboardMin.measurable ? (t.idleKeyboardMin.idleDutyPct + '% (' + t.idleKeyboardMin.cpuTimeUsPerMsFrame + ' µs/ms)') : 'not measurable';
          const fx = t.fsMassStorage && t.fsMassStorage.measurable ? (t.fsMassStorage.regAccessesPerByte + ' reg/B') : 'not measurable (max failed)';
          detailsHtml = '<div class="mono" style="font-size:12px;color:var(--text-1);">• min 64KB: ' + fm + ' | min idle KB: ' + im + ' | max 64KB: ' + fx + '</div>';
        } else if (t.testId === 9) {
          detailsHtml = \`<div class="mono" style="font-size:12px;color:var(--text-1);">• Run1 SHA = Run2 SHA = \${t.run1Sha256}</div>\`;
        }
        return \`<div class="test-card"><div class="test-card-header"><strong>Test \${t.testId}: \${t.name}</strong><span class="badge \${t.passed ? 'badge-pass' : 'badge-fail'}">\${t.passed ? 'PASS' : 'FAIL'}</span></div>\${detailsHtml}</div>\`;
      }).join('');
    }

    function renderChipList(filterText) {
      if (!netlistSimInstance) return;
      const q = (filterText || '').trim().toLowerCase();
      const chips = netlistSimInstance.chips.filter(c =>
        !q || c.id.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)
      );
      const tbody = document.getElementById('chipListBody');
      tbody.innerHTML = chips.map(c => \`
        <tr class="clickable-row" data-chip-id="\${c.id}">
          <td class="mono"><strong>\${c.id}</strong></td>
          <td class="mono">\${c.type}</td>
          <td>\${c.role}</td>
        </tr>
      \`).join('');

      tbody.querySelectorAll('tr.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
          tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
          row.classList.add('selected-row');
          inspectChip(row.getAttribute('data-chip-id'));
        });
      });

      if (chips.length > 0) {
        inspectChip(chips[0].id);
      }
    }

    function inspectChip(chipId) {
      const chip = netlistSimInstance.chipById.get(chipId);
      if (!chip) return;
      const pinLines = Object.entries(chip.pinMap).map(([pin, net]) =>
        \`  \${pin.padEnd(8, ' ')} -> \${net.padEnd(20, ' ')} (val=\${netlistSimInstance.getNet(net)})\`
      ).join('\\n');
      document.getElementById('chipPinInspector').textContent =
        \`Chip Instance : \${chip.id} (\${chip.spec.partNumber})\\n\` +
        \`Role          : \${chip.role}\\n\` +
        \`Timing (3.3V) : tpd = \${chip.spec.tpdMinNs}..\${chip.spec.tpdMaxNs} ns | tsu = \${chip.spec.tSetupNs} ns | th = \${chip.spec.tHoldNs} ns\\n\` +
        \`Datasheet     : \${chip.spec.datasheetCite}\\n\` +
        \`Pin-to-Net Map:\\n\${pinLines}\`;
    }

    function runInteractiveSimulation() {
      const deviceType = document.getElementById('selDevice').value;
      const delayCorner = document.getElementById('selCorner').value;
      const hostClockSkewPct = parseFloat(document.getElementById('selSkew').value) || 0;
      const mutant = document.getElementById('selMutant').value || null;
      const faultMode = document.getElementById('selFault').value;

      const line = new UsbLineModel();
      if (faultMode === 'all3') {
        line.scheduleWireFault('corrupt_crc');
        line.scheduleWireFault('stuff_error');
        line.scheduleWireFault('drop_handshake');
      } else if (faultMode !== 'none') {
        line.scheduleWireFault(faultMode);
      }

      const dev = deviceType === 'hid'
        ? new LowSpeedHidKeyboardDevice({ seed: 42 })
        : new FullSpeedMassStorageDevice({ seed: 20261118 });
      line.attachDevice(dev);

      const sim = new GateSimulator({ delayCorner });
      buildSieNetlist(sim, { mutant });
      const sie = new ClosedBoxPinHarness(sim, line, { hostClockSkewPct });
      sie.reset();
      const driver = new UsbHostDriver(sie);

      let ok = false;
      let summaryNote = '';
      const enumRes = driver.enumerateDevice(1);

      if (!enumRes.ok) {
        ok = false;
        summaryNote = \`FAILED at ENUMERATION (\${enumRes.stage || enumRes.reason})\`;
      } else if (deviceType === 'hid') {
        for (let f = 0; f < 4; f++) {
          driver.in16(SIE_REGS.FRAME);
          sie.advanceTimeNs(900000);
        }
        const frameAfter = driver.in16(SIE_REGS.FRAME);
        const keyRes = driver.readHidKeystrokes(1, 20);
        ok = keyRes.ok && frameAfter > 0;
        summaryNote = ok
          ? \`PASS: Enumerated LS HID Keyboard + read \${keyRes.count}/20 keystrokes (Frame=\${frameAfter})\`
          : \`FAILED at HID_KEYSTROKES (\${keyRes.reason || 'SOF_MISSING'})\`;
      } else {
        const botState = { outToggle: 0, inToggle: 0 };
        const readRes = driver.scsiReadSectors(1, 32, 4, botState);
        ok = readRes.ok;
        summaryNote = ok
          ? \`PASS: Enumerated FS Mass Storage + SCSI READ(10) 2,048 B (\${driver.totalRetries} retries)\`
          : \`FAILED at SCSI READ(10) (\${readRes.reason})\`;
      }

      currentWaveSamples = line.waveform;
      currentPacketTrace = line.busTransitions.slice(0, 200).map((tr, idx, arr) => ({ idx, timeNs: tr.timeNs, endTimeNs: (arr[idx + 1] ? arr[idx + 1].timeNs : tr.timeNs + 83.3), pid: tr.state, dir: 'BUS', speed: deviceType === 'hid' ? 'LS' : 'FS', len: 1, nrziBits: 1, bytes: [tr.dp, tr.dm], ok: true }));
      currentRegTrace = sie.regTrace;
      netlistSimInstance = sim;

      const badge = document.getElementById('simStatusBadge');
      badge.className = 'badge ' + (ok ? 'badge-pass' : (mutant ? 'badge-warn' : 'badge-fail'));
      badge.textContent = mutant
        ? (ok ? \`MUTANT SURVIVED (\${mutant})\` : \`MUTANT KILLED (\${mutant})\`)
        : summaryNote;

      renderPacketTable();
      drawWaveform();
      if (currentPacketTrace.length > 0) {
        selectPacketRow(0);
      }
      showToast(badge.textContent);
    }

    function getFilteredPackets() {
      const filter = document.getElementById('selPktFilter').value;
      return currentPacketTrace.map((p, idx) => ({ ...p, idx })).filter(p => {
        if (filter === 'ALL') return true;
        if (filter === 'SOF') return p.pid === USB_PIDS.SOF || p.pid === 'KEEPALIVE_EOP';
        return p.dir === filter;
      });
    }

    function renderPacketTable() {
      const filtered = getFilteredPackets();
      document.getElementById('pktCountLabel').textContent = \`\${filtered.length} packets shown\`;
      const tbody = document.getElementById('pktTableBody');
      tbody.innerHTML = filtered.slice(0, 120).map(p => \`
        <tr class="clickable-row \${p.idx === selectedPacketIdx ? 'selected-row' : ''}" data-pkt-idx="\${p.idx}">
          <td class="mono">\${p.idx}</td>
          <td class="mono">\${p.timeNs.toFixed(1)}</td>
          <td><span class="badge \${p.dir === 'HOST->DEV' ? 'badge-info' : 'badge-pass'}">\${p.dir}</span></td>
          <td class="mono">\${p.speed}</td>
          <td class="mono">\${PID_NAMES[p.pid] || p.pid}</td>
          <td class="num">\${p.len}</td>
          <td class="num">\${p.nrziBits}</td>
        </tr>
      \`).join('');

      tbody.querySelectorAll('tr.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.getAttribute('data-pkt-idx'), 10);
          selectPacketRow(idx);
        });
      });
    }

    function selectPacketRow(idx) {
      selectedPacketIdx = idx;
      const tbody = document.getElementById('pktTableBody');
      tbody.querySelectorAll('tr').forEach(r => {
        r.classList.toggle('selected-row', parseInt(r.getAttribute('data-pkt-idx'), 10) === idx);
      });
      const pkt = currentPacketTrace[idx];
      if (!pkt) return;
      document.getElementById('inspSummaryBadge').textContent = \`PKT #\${idx} (\${PID_NAMES[pkt.pid] || pkt.pid})\`;
      const simStats = netlistSimInstance
        ? \`Gate Evaluations: \${netlistSimInstance.totalGateEvaluations.toLocaleString()} | Pin Events: \${netlistSimInstance.totalPinEvents.toLocaleString()} | Violations: \${netlistSimInstance.timingViolations.length}\`
        : 'Precomputed trace snapshot';

      const regSample = currentRegTrace.slice(0, 18).map((r, i) =>
        \`  [\${i}] \${r.op === 'W' ? 'OUT' : 'IN '} port=0x0\${r.port} val=0x\${r.val.toString(16).padStart(4, '0')}\`
      ).join('\\n');

      document.getElementById('packetInspector').textContent =
        \`Packet Index   : #\${idx}\\n\` +
        \`Direction      : \${pkt.dir} (\${pkt.speed === 'LS' ? 'Low-Speed 1.5 Mb/s' : 'Full-Speed 12 Mb/s'})\\n\` +
        \`Time Window    : \${(pkt.timeNs || 0).toFixed(1)} ns .. \${(pkt.endTimeNs != null ? pkt.endTimeNs : (pkt.timeNs || 0)).toFixed(1)} ns (Δ = \${((pkt.endTimeNs != null ? pkt.endTimeNs : (pkt.timeNs || 0)) - (pkt.timeNs || 0)).toFixed(1)} ns)\\n\` +
        \`PID            : \${PID_NAMES[pkt.pid] || pkt.pid}\\n\` +
        \`Payload Bytes  : \${pkt.len} B\\n\` +
        \`NRZI Wire Bits : \${pkt.nrziBits} bits (+ 2-bit SE0 + 1-bit J EOP)\\n\` +
        \`Gate Netlist   : \${simStats}\\n\\n\` +
        \`Recent CPU 16-Bit Port Register Operations (10 µs/access):\\n\${regSample || '  (Run live simulation to capture step-by-step register trace)'}\`;
    }

    function drawWaveform() {
      const canvas = document.getElementById('waveCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;

      ctx.fillStyle = '#06090f';
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 80; x < W; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      const lanes = [
        { label: 'D+ (3.3V)', yHigh: 32, yLow: 72, color: '#38bdf8' },
        { label: 'D− (3.3V)', yHigh: 102, yLow: 142, color: '#f43f5e' },
        { label: 'DIFF (J/K/SE0)', yHigh: 172, yLow: 212, color: '#10b981' },
        { label: 'PACKET TAGS', yHigh: 242, yLow: 272, color: '#a78bfa' }
      ];

      ctx.font = '11px monospace';
      lanes.forEach(ln => {
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath(); ctx.moveTo(0, ln.yLow + 10); ctx.lineTo(W, ln.yLow + 10); ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(ln.label, 8, ln.yHigh + 14);
      });

      if (!currentWaveSamples || currentWaveSamples.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.fillText('No waveform samples loaded.', 140, 140);
        return;
      }

      const zoom = parseInt(document.getElementById('rngZoom').value, 10) || 2;
      const panPct = parseInt(document.getElementById('rngPan').value, 10) || 0;
      document.getElementById('lblZoom').textContent = zoom + 'x';

      const totalSamples = currentWaveSamples.length;
      const visibleCount = Math.max(24, Math.floor(totalSamples / zoom));
      const maxStart = Math.max(0, totalSamples - visibleCount);
      const startIdx = Math.floor((panPct / 100) * maxStart);
      const slice = currentWaveSamples.slice(startIdx, startIdx + visibleCount);

      const plotLeft = 115;
      const plotWidth = W - plotLeft - 16;
      const stepX = plotWidth / Math.max(1, slice.length - 1);

      // Draw D+
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      slice.forEach((s, i) => {
        const x = plotLeft + i * stepX;
        const y = s.dp ? lanes[0].yHigh : lanes[0].yLow;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prevY = slice[i - 1].dp ? lanes[0].yHigh : lanes[0].yLow;
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw D-
      ctx.strokeStyle = '#f43f5e';
      ctx.beginPath();
      slice.forEach((s, i) => {
        const x = plotLeft + i * stepX;
        const y = s.dm ? lanes[1].yHigh : lanes[1].yLow;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prevY = slice[i - 1].dm ? lanes[1].yHigh : lanes[1].yLow;
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw Diff State (J = high, K = low, SE0 = mid)
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      slice.forEach((s, i) => {
        const x = plotLeft + i * stepX;
        const y = (s.dp === 0 && s.dm === 0)
          ? 0.5 * (lanes[2].yHigh + lanes[2].yLow)
          : (s.state === 'J' || s.state === 'IDLE_J' ? lanes[2].yHigh : lanes[2].yLow);
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prev = slice[i - 1];
          const prevY = (prev.dp === 0 && prev.dm === 0)
            ? 0.5 * (lanes[2].yHigh + lanes[2].yLow)
            : (prev.state === 'J' || prev.state === 'IDLE_J' ? lanes[2].yHigh : lanes[2].yLow);
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw packet tags & state markers
      slice.forEach((s, i) => {
        const x = plotLeft + i * stepX;
        if (stepX >= 14) {
          ctx.fillStyle = s.state === 'SE0' ? '#fbbf24' : '#6ee7b7';
          ctx.fillText(s.state, x + 2, lanes[2].yHigh - 4);
        }
        if (s.tag) {
          ctx.fillStyle = 'rgba(167, 139, 250, 0.22)';
          ctx.fillRect(x, lanes[3].yHigh, Math.max(44, stepX * 3), 24);
          ctx.strokeStyle = '#a78bfa';
          ctx.strokeRect(x, lanes[3].yHigh, Math.max(44, stepX * 3), 24);
          ctx.fillStyle = '#f3e8ff';
          ctx.fillText(s.tag, x + 4, lanes[3].yHigh + 15);
        }
      });
    }

    // Wire all UI controls
    window.addEventListener('DOMContentLoaded', () => {
      // Tab navigation
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          const target = document.getElementById(btn.getAttribute('data-tab'));
          if (target) target.classList.add('active');
          if (btn.getAttribute('data-tab') === 'tab-wave') drawWaveform();
        });
      });

      document.getElementById('btnExecuteSim').addEventListener('click', runInteractiveSimulation);
      document.getElementById('btnRunLiveHeader').addEventListener('click', () => {
        document.querySelector('[data-tab="tab-wave"]').click();
        runInteractiveSimulation();
      });

      document.getElementById('btnExportJsonl').addEventListener('click', () => {
        const content = PRECOMPUTED_RESULTS.map(r => JSON.stringify(r)).join('\\n') + '\\n';
        const blob = new Blob([content], { type: 'application/x-jsonlines' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'results.jsonl';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Exported results.jsonl (' + PRECOMPUTED_RESULTS.length + ' records)');
      });

      document.getElementById('rngZoom').addEventListener('input', drawWaveform);
      document.getElementById('rngPan').addEventListener('input', drawWaveform);
      document.getElementById('selPktFilter').addEventListener('change', renderPacketTable);
      document.getElementById('inpChipSearch').addEventListener('input', e => renderChipList(e.target.value));
      window.addEventListener('resize', drawWaveform);

      initFromPrecomputed();
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(outHtmlPath, html, 'utf8');
  console.log(`Built ${outHtmlPath} (${Buffer.byteLength(html, 'utf8')} bytes)`);
}

if (require.main === module) {
  const jsonlPath = process.argv[2] || path.resolve(__dirname, '../results.jsonl');
  const outHtmlPath = process.argv[3] || path.resolve(__dirname, '../bare-usb.html');
  buildHtml(jsonlPath, outHtmlPath);
}

module.exports = { buildHtml };
