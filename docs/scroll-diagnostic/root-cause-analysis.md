# Root cause analysis (ranked hypotheses)

**Diagnostic only.** Each item is a **probable contributor** to **mobile scroll jumping**, **sticky instability**, **layout shift**, or **touch/momentum interruption**, derived from **code structure** — **not** confirmed by device traces in this session.

---

## R1 — Coupled chrome + padding transitions during scroll

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Confidence** | High |
| **Components** | `MobileChromeController`, `AppChrome`, `MobileBottomNav`, `PipelineFileWorkspaceShell`, `lib/mobileCompactChrome.ts` |
| **Layout chain** | `compactChrome` → master header grid rows + file chrome classes + **`main` inner `padding` transition** + bottom nav `translate-y` |
| **Scroll chain** | Same `<main>` scrollport; **scroll height** and **visible chrome** change **mid-scroll** |
| **Probable fix strategy** (future) | Reduce coupling; debounce compact; use `content-visibility` vs animated grid; avoid simultaneous padding + height transitions |
| **Architecture** | Single-scroll + **scroll-aware chrome** is powerful but inherently **layout-unstable** on mobile |

---

## R2 — `IntersectionObserver` binary compact vs scroll physics

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | Medium |
| **Components** | `MobileChromeController`, `PipelineFileWorkspaceShell` sentinel `[data-dlc-main-compact-sentinel]` |
| **Layout chain** | Sentinel visibility ↔ compact mode |
| **Scroll chain** | `root: main`, `threshold: 0` — **boundary oscillation** possible when user scrolls near edge |
| **Probable fix strategy** (future) | Hysteresis, `rootMargin`, or debounced IO |
| **Architecture** | Intentional tradeoff vs scroll listener jitter |

---

## R3 — `ResizeObserver` + CSS var updates on sticky header

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | Medium |
| **Components** | `PipelineFileWorkspaceShell` |
| **Layout chain** | `--header-height` drives `scroll-margin-top` for modular sections |
| **Scroll chain** | Height change → reflow → **scroll anchoring** / perceived shift |
| **Probable fix strategy** (future) | Throttle var updates; separate “anchor” height from visual height if needed |
| **Architecture** | Correct for `#file-details` clearance but **dynamic** during animations |

---

## R4 — Nested `overflow-y-auto` islands (quick panels, lists)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Confidence** | Medium |
| **Components** | `PipelineFileActivityPanel`, `FileMessagingPanel`, etc. |
| **Layout chain** | Max-height boxes inside `main` |
| **Scroll chain** | **Touch negotiation** between child scroller and `<main>` (`touch-action: pan-y` on main; inner may inherit) |
| **Probable fix strategy** (future) | Consistent `overscroll-behavior`; explicit `touch-action` on nests |
| **Architecture** | Expected pattern; risk is **gesture handoff** |

---

## R5 — `overscroll-behavior-y: contain` on `<main>`

| Field | Detail |
|-------|--------|
| **Severity** | Low–medium |
| **Confidence** | Medium |
| **Components** | `AppChrome` `main` classes + `globals.css` notes |
| **Layout chain** | N/A |
| **Scroll chain** | Prevents chaining to `body`; may alter **iOS rubber-band** feel vs full-page scroll |
| **Probable fix strategy** (future) | A/B `auto` vs `contain` on pipeline route only |
| **Architecture** | Locked-body contract **requires** some containment |

---

## R6 — Global capture scroll listeners (tour, popovers)

| Field | Detail |
|-------|--------|
| **Severity** | Medium (when active) |
| **Confidence** | High |
| **Components** | `ProductTourOverlay`, `SnoozeMenu`, `PipelineBlockDrawerSettings` |
| **Layout chain** | N/A |
| **Scroll chain** | `window` scroll **capture** runs on **every** scroll, including `<main>` |
| **Probable fix strategy** (future) | Scope listeners; passive; disconnect aggressively |
| **Architecture** | Orthogonal to pipeline but affects same thread |

---

## R7 — `jumpToDrawerSection` double `scrollIntoView` + collapse timing

| Field | Detail |
|-------|--------|
| **Severity** | Low–medium |
| **Confidence** | Medium |
| **Components** | `PipelineFileWorkspace.tsx` |
| **Layout chain** | `CollapsibleSection` height animation ~300ms |
| **Scroll chain** | Smooth scroll + delayed `auto` scroll |
| **Probable fix strategy** (future) | Single scroll after `transitionend`; `scrollend` where available |
| **Architecture** | UX correctness vs scroll smoothness |

---

## R8 — Sticky + potential `transform` on same element (`mobileFocusChromeTransition`)

| Field | Detail |
|-------|--------|
| **Severity** | High (if transform applies non-none to sticky) |
| **Confidence** | Low (needs **computed style** on device) |
| **Components** | `PipelineFileWorkspaceShell` header classes |
| **Layout chain** | Sticky containing block |
| **Scroll chain** | Sticky offset wrong or flicker |
| **Probable fix strategy** (future) | Remove `transform` from sticky header transitions |
| **Architecture** | CSS spec constraint |

---

## R9 — Documentation drift (`AGENTS.md` vs `PipelineFileWorkspace`)

| Field | Detail |
|-------|--------|
| **Severity** | Low (process risk) |
| **Confidence** | High |
| **Components** | `AGENTS.md` claims nested `overflow-y-auto` on file body; code uses **`overflow-x-clip` only** |
| **Layout chain** | Misleading for future contributors |
| **Scroll chain** | N/A |
| **Probable fix strategy** (future) | Align docs with code |
| **Architecture** | Governance |

---

*End of root cause analysis.*
