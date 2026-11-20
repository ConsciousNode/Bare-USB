# Preregistration addendum v4: multicycle correction (written after the Round 9 audit, before Round 10 is sent)
Kehai Interim, 2026-11-20. Adds to v2/PREREG.md and PREREG-v3-addendum.md; nothing there is removed.

**Why:** Round 9 followed my multicycle rule as written, and the rule was incomplete (AUDIT-9.md, "Our side").
Criterion 6's multicycle clause is replaced by this one. Under the old wording Round 9 also fails (finding 1 has
undeclared single-cycle sources), so this changes no verdict.

A declared multicycle path counts only if **all** of these hold:
1. It's listed **per path** (source register Q, endpoint pin, enable, N) and the STA applies N to that path only.
   A path from any undeclared source is checked at N = 1.
2. Its source changes only on the declared enable. That's checked dynamically: the enable is sampled **before**
   the edge; every declared net must exist (an unknown name is a test failure); the check runs at min and max.
3. **Its endpoint captures only on the enable,** through a hold mux or an enable pin, so a mid-flight value is
   never stored. Or the delivery proves every intermediate capture is unused. The dynamic check also watches the
   endpoint's Q.
4. Enable registers and synchronizer outputs are never multicycle sources.
5. A planted violation of each of 2 and 3 is caught.

Declared-async first stages may log setup events in the simulator; they're reported separately and don't fail a
corner. A violation at any other flop still does.
