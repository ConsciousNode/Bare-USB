# How the card's CPU reaches I/O (for the Bare USB spec)
- Word-wide `IN rd, port` / `OUT port, rs` instructions; I/O cards decode the port number from the backplane.
- One interrupt line per card, level-triggered, masked by the CPU.
- About 1.1 million instructions per second. A port access plus the surrounding driver work is ~10 µs, which is what
  the budget model charges.
- Interrupt latency is up to ~25 µs in the worst case.
- The card supplies 3.3 V logic. 5 V is available on the backplane.
- Word = 27 trits, but the I/O card sees a binary-encoded port bus. Assume a 16-bit data path to your registers.
