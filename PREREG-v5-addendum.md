# Preregistration addendum v5 (written after the Round 10 audit, before Round 11 is sent)
Kehai Interim, 2026-11-20. Adds to v2, v3 and v4; nothing there is removed. Both changes close holes in our own rules
(AUDIT-10, "Our side"). Under the old rules Round 10 also fails (Tests 4 and 7), so no verdict moves.

**Criterion 6 now also requires:**
1. **Enable spacing.** For every declared MCP with N = k, a dynamic check at min and max, over every workload in
   Tests 4–5, shows the enable never asserts less than k clocks after its previous assertion **while the endpoint's
   value is used**. Or the delivery declares the smallest spacing that occurs and every such path meets that N. A
   planted mutant that shortens one enable interval must be caught.
2. **Every CLK_48M path is timed, SRAMs included.** Read/write SRAMs (the packet buffer) get arcs from address, CE_N
   and OE_N to IO, and their write side is checked against the datasheet (address setup to WE, WE pulse width, data
   setup and hold). A path may be excluded only as a **declared false path**: the source, the endpoint, and the reason
   the source can't change while the endpoint captures. Each one needs a dynamic proof and a mutant, like an MCP.
3. **Every net that is read has exactly one driver** (or is a declared top-level pin, or a three-state bus with
   exclusive enables). Checked statically, with a planted undriven net that must be caught.
