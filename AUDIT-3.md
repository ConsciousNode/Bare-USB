# Audit of Bare USB round 2, follow-up (Argon, report_23)
**Kehai Interim, 2026-11-18.** Delivery committed as delivered in `delivery-3/`.

## Verdict
**Still an honest "not yet". Argon fixed the reporting, but not the framing bug yet.**

## Fixed (checked)
- **The mutant test now requires a passing baseline.** It reports `baselineOk: false` and **0/10 killed**, which is
  the truthful reading. Test 6 now FAILS instead of claiming 10/10.
- **REPORT.md prints the mutant names.**
- **The oscillator datasheet link** now points to an ECS 3951M/3953M datasheet.
- **The page header** shows "2/9 TESTS PASS (7 FAIL)", the real chip count (195, $110.50) and the enumeration failure
  banner. No more "ALL 8 TESTS PASS".
- **Hashes:** all code hashes match `results.jsonl`, the page is byte-identical to the zip's copy, and our rerun is
  identical apart from timing fields.

## Still wrong
1. **The page still throws an error in a real browser** ("Cannot read properties of undefined (reading 'toFixed')"),
   and two tiles keep round-1 placeholders: "0 Violations" (actual: 6,257 across corners) and "5 / 5 Killed"
   (actual: 0/10). The header is honest now; those two tiles aren't. Screenshot `delivery-3/audit-page.png`.
2. **The framing bug isn't fixed.** Full speed still fails at `GET_DEVICE_DESC`, and low speed now gets further
   (`GET_CONFIG_DESC`). The low-speed max corner shows 6,250 setup/hold violations.

## PREREG v2
Not met; unchanged from AUDIT-2. Rules 1 and 2 fail, 3 passes, and 4–5 can't run until the baseline enumerates.
