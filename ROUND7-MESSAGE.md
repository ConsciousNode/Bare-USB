Round 6 audited. Hashes match, the rerun reproduces all 11 records, and the page loads clean. Every round-6 ask is met at the min corner:
- the periodic corruption is gone (100/100 keystrokes, exact SHA-256 on the 64 KB file);
- the FS skew sweep is clean across ±0.5%;
- the min-corner runs are in results.jsonl;
- the report is regenerated from this run only.

Nice work on the SOF guard.

The blocker now is timing, and it's structural:

1. **The netlist only works at best-case delays.** A static timing check of the netlist (CLK_48M to CLK_48M paths, synchronous arcs only, period 20.78 ns) finds:
   - **max:** 112 of 134 endpoints fail, the worst path is 86 ns;
   - **typ:** 81 fail, the worst path is 52 ns;
   - **min:** 22 are marginal.

   The long paths chain two SRAM lookups and 12–18 gates in one clock. An example: FSM state → S_AUTO_ACK → header-PID mux → U52 header table → IS_EOP_STATE → EOP_VALID → U35 FSM table → TX_OE → ACTIVE_CLK_SEL → ACTIVE_EN → stuff/byte counters.

   Real parts aren't best-case, so this has to close at max. Options:
   - register the table outputs (one SRAM per cycle);
   - break the EOP_VALID → FSM table → TX_OE → ACTIVE_EN loop;
   - or declare the FSM update a multicycle path (it changes only on ACTIVE_EN: 4 clocks at FS, 32 at LS) and check each declared path explicitly. Even 4 × 20.8 = 83 ns is under the 86 ns worst path, though.

   Please add a static timing check to the suite: any path longer than the period at max fails.
2. **Three flip-flops are clocked by logic**, not CLK_48M, so a glitch clocks them:
   - U139.2 on ERR_TIMEOUT_CMB;
   - U140.2 on SOF_TRIG_ST;
   - U70.2 on SOF_TRIG_OUT.

   Put them on CLK_48M with enables. The CPU-strobe-clocked port latches are fine as an asynchronous interface.
3. **Mutants were judged at max, where the baseline fails.** At min, on the keyboard workload, 7 of 10 die. Three survive because that workload can't see them:
   - sof_missing: polling keeps the device awake;
   - buf_addr_carry_broken: 8-byte packets never carry;
   - dpll_resync_disabled: short LS packets with no skew.

   Run Tests 3, 6 and 7 at a corner where the baseline passes and say which. Add the FS 64-byte workload, an idle gap of more than 3 ms, and a skewed device to the mutant run.
4. **Retries on a clean wire:** with no injected faults, the min baseline needs 6 retries for the keyboard and 16 for the file. Please find out why.
5. **Small:**
   - "FSM +-1.02 ns" (slack sign format) is still on the page;
   - the Tests tab badge shows "—";
   - the mutant picker lists 5 of 10;
   - the report prints `Tables Digest: [object Object]`.

Same rules as before: if something can't be met, say so in REPORT.md and leave it failing.
