# Audit of Bare USB round 2 (Argon, report_21)
**Kehai Interim, 2026-11-18.** Delivery committed as delivered in `delivery-2/` before auditing.

## Verdict
**Honest "not yet".** This round is the closed box we asked for, and Argon reported the failure as a failure. But the SIE
doesn't get past `GET_DEVICE_DESC`, so discrete-logic USB is **still not demonstrated** (PREREG v2 rule 1 fails).
It's a much better instrument than round 1, and the remaining problem is a framing bug, not a cheat.

## What checks out
- **Hashes:** every source hash matches `results.jsonl`, and the delivered page is byte-identical to the zip's copy.
- **Rerun:** results are identical apart from timing fields (9.8 s).
- **The box is really closed.** `src/pin-harness.js` (111 lines, read in full) only touches CLK_48M, RST_N, the port
  address/data/strobe pins, IRQ and D+/D−. `parts-library.js` contains only standard parts (74LVC04/08/32/86/157/138/
  245/574/74/161/595/165, IS61WV5128, SST39SF040, USB1T11A). There are no behavioural blocks, and no simulator module
  imports the devices, driver or reference SIE. 194 chips, $110.15.
- **Argon took the single-clock suggestion:** one 48 MHz domain with clock enables. The max-corner setup violations
  dropped from 49 to 3.

## What doesn't
1. **The mutant test is meaningless this round.** `run-tests.js:407` counts a mutant as killed when `!r.ok`, but the
   unmutated SIE also fails, at the same stage (`GET_DEVICE_DESC: RETRIES_EXHAUSTED`). Test 6 shows "PASS, 10/10
   killed" when nothing was discriminated. A mutant test needs the baseline to pass first.
2. **The delivered page is broken and shows round-1 claims.** In a real browser it throws "Identifier 'USB_PIDS' has
   already been declared" (two inlined modules both declare it). So the script stops before replacing the template's
   hard-coded round-1 placeholders, and the page displays "ALL 8 TESTS PASS", "48 Chips", "$44.31", "5 / 5 Killed".
   Those are false for this round (screenshot `delivery-2/audit-page.png`). Test 10 (the browser check) wasn't run.
3. **REPORT.md's mutant table prints `undefined`** for every mutant name: a field-name mismatch in `generate-report.js`.
4. **A regression after the refactor.** The interim note said full-speed enumeration passed end to end; after the move
   to one clock domain, `GET_DEVICE_DESC` fails on a 1-bit TX framing offset. My suggestion caused the refactor, so the
   regression is partly downstream of us. The refactor itself was the right call.
5. **The CPU budget numbers (99 %) are meaningless:** a single failed transfer plus three retries. The low-speed
   max-delay corner shows 1,600 violations, not the 3 the report's summary line suggests.
6. **Carried over from round 1:** the oscillator's datasheet link points to TI's logic selection guide, not an ECS
   datasheet.

## PREREG v2, applied as written
| rule | result |
| --- | --- |
| 1. tests 1–5 and 7 pass, planted peek caught | **fail**: 1, 2 pass; 3, 4, 5, 7 fail |
| 2. all mutants caught | can't be assessed: the baseline fails, so no mutant was discriminated |
| 3. hand read: no protocol logic or peeking in the harness | **pass** |
| 4–5. our FSM-entry and over-skew probes | not runnable until the baseline enumerates |

## Suggested follow-up for Argon (same session, it has the context)
See the message drafted in the chat. In short:
- fix the TX_EOP → TX_DATA_SYNC framing;
- make test 6 require a passing baseline;
- fix the duplicate `USB_PIDS` and drop the hard-coded round-1 numbers from the page template;
- actually run test 10;
- fix the mutant names in the report and the oscillator link.
