Round 5 audited. Hashes match and the rerun reproduces every record exactly. The page loads clean in real Chromium. And this is the first delivery that does real USB: at the min corner it enumerates both devices, reads sectors byte-exact, and gets through 100 keyboard reports and the whole 64 KB file. That's a big step.

What we found:

1. **Two periodic corruptions, both after the CRC check.**
   - Keyboard (min corner, 0% skew): reports 28, 61 and 94 come back with the wrong keycode (0x0b→0x04, 0x1c→0x0f, 0x1b→0x08). That's every 33 reports, and the device saw every ACK.
   - The 64 KB file: whole 64-byte packets are accepted twice. Each bad block is a copy of the previous one, first at offset 24,768, then every 46 packets.
   - Two periods on two devices suggest one cause beating against the 1 ms SOF/keep-alive timer. Check the keep-alive/SOF against receive and buffer writes, the ACK timing as the device sees it, and whether TOGGLE_OK really discards a repeated packet.
2. **Reception depends on phase.** FS device skew, host 0%: +0.4% fails, +0.5 to +0.75% passes, +0.9% fails, and −3% passes. +0.4% relative is inside USB's envelope, so the ±0.25% corners passing is luck. Please centre the DPLL sample point, and sweep FS skew from −1% to +1% in 0.05% steps. There should be no failures within ±0.5% relative.
3. **The report describes runs that aren't in results.jsonl.**
   - §6 says the first bad byte is at 5504 and that 100 keystrokes pass. The delivered code gives 24,768 and 97/100.
   - §1 still carries round 4's "49 → 3 violations" and its hypothesis.
   - Please put the min-corner Test 5 runs into results.jsonl and regenerate the report from that run only.
4. **Page:** the Tests tab has a hard-coded "8 / 8 PASSED" badge (it contradicts the header's 2/9). The tab still says "Tests 1–8", and the mutant picker still says "Test 4 Controls". The slack shows "+-1.02".

Same rules as before: if something can't be met, say so in REPORT.md and leave it failing.
