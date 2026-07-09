# Recommended fix strategy (do not implement from this doc)

**Diagnostic only.** Proposals for a **future** implementation phase. **No** code changes were made as part of this investigation.

---

## Principles

1. **Measure first** on iPhone Safari + Android Chrome (Profiler + timeline) to validate R1–R5 in `final-targeted-root-cause-ranking.md`.  
2. **Prefer decoupling** scroll signaling from **layout-affecting** transitions over micro-optimizing observers.  
3. **Preserve** the product contract: **single `<main>` scroll**, `body` locked.

---

## Lowest-risk / highest-confidence order (suggested)

### Tier A — Surgical (CSS / timing)

1. **Stabilize compact toggle hysteresis** (pipeline **IO**): `rootMargin` / dual thresholds / short debounce after IO fire — reduce oscillation (**R4**).  
2. **Remove or narrow layout transitions** that run **on the sticky element** simultaneously with scroll — e.g. avoid **`padding`/`min-height` animation on sticky**; snap or shorten duration (**R1, R5**).  
3. **Audit `mobileFocusChromeTransition` on sticky `<header>`** — if `transform` is non-noop on sticky, **strip transform** from that node’s transition set (**R5**).  
4. **Throttle `ResizeObserver` → CSS vars** (e.g. rAF batch, or update vars only at **end** of compact transition) (**R3**).

### Tier B — Behavioral

5. **Defer `main` padding change** 50–100ms after compact decision **or** tie to `transitionend` — avoid simultaneous master header + main pb animation (**R2**).  
6. **Add `transition` to `mobileWorkspaceStackClass`** or decouple **gap** change from scroll event — replace instant reflow with intentional animation or hold until scroll idle (**R6**).

### Tier C — Architectural (larger)

7. **Split “visual compact” from “layout compact”** — e.g. compositor-only shrink for 1 phase, layout-affecting shrink in next frame after `scrollend` where supported.  
8. **Unify pipeline + non-pipeline** compact drivers (IO vs scroll delta) for predictable UX — optional, product decision.

---

## What **not** to touch (stable)

- **Single `<main>` scroll owner** (`AppChrome.tsx`) — core invariant.  
- **Passive scroll listener** pattern where used — correct for non-blocking scroll.  
- **`overflow-x-clip` on pipeline drawer body** — avoids nested vertical scroll.  
- **`touch-scroll-y` + `overscroll-contain` on main** — intentional iOS behavior.

---

## Minimal surgical vs architectural

| Type | Examples |
|------|----------|
| **Minimal** | IO `rootMargin`, remove `transform` from sticky transition list, throttle RO Var updates, shorten `grid-template-rows` duration |
| **Architectural** | Split compact phases; redesign chrome so compact uses **opacity/transform-only** on non-sticky layers; scroll-end-gated padding |

---

## Mobile Safari accuracy note

Validate all Tier A items **on WebKit** first — **grid row interpolation**, **scroll anchoring**, and **sticky+transform** differ from Chromium.

---

*End of recommended fix strategy.*
