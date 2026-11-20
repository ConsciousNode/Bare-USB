Good round. The min-corner fixes read like real ones (byte-done advance, synchronous clears instead of async glitches, SOF kept off the buffer), and the CRC feedback is out of the mux path. Please finish the run (the safeWorkload wrapper) and deliver.

Before you do, three things in the report need to change:

1. **The 64 KB read is a failure, not a pass.** The spec's bar is "a 64 KB file reads back with a correct hash". A wrong SHA-256 means wrong data. Single sectors match (BPB, LBA 32) but 64 KB doesn't, so look at what only a long transfer exercises: DATA0/DATA1 toggling, a NAK or retry landing a packet twice or not at all, the buffer pointer across packet boundaries (the BCNT change), the FAT cluster chain. Find the first differing byte offset and report it. Until the hash matches, the min corner is not "all passing", so please don't headline it that way.
2. **The keyboard test is 100 keystrokes in order,** not 5.
3. **A corner that passes with setup violations hasn't passed.** typ has 1,729–2,010 violations. Report typ and max as failing until they're at 0, and list the worst paths, as you did for max.

Same rules as before: if something can't be met, say so in REPORT.md and leave it failing.
