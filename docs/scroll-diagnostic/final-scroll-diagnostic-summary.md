# Final scroll diagnostic summary — Pipeline File Workspace (mobile)

**Scope:** Diagnostic-only investigation of **scroll ownership**, **overflow**, **sticky/fixed**, **viewport units**, **JS scroll observers**, and **transform/compositing** affecting **pipeline file** experience on mobile.

**Method:** Full static trace of `lender-app/` sources; **no** code changes; **no** production deploy; **no** physical device captures in this session (see `mobile-reproduction-report.md`).

---

## 1. Architecture — what is “safe” by design

- **Single vertical scroll owner for page content:** `<main data-app-main-scroll>` (`AppChrome.tsx`) with `overflow-y-auto`, `min-h-0`, `flex-1`, `touch-scroll-y`, `overscroll-contain`.
- **Pipeline file body (`pipeline-drawer-scroll`) does not add `overflow-y`:** Vertical scrolling stays on `<main>` (`PipelineFileWorkspace.tsx` — aligns with avoiding nested page scroll).
- **Sticky file chrome** lives **inside** `<main>` with `position: sticky; top: 0` (`PipelineFileWorkspaceShell.tsx`) — correct for locked-body architecture.
- **Portaled overlays** (drawers, search) use their **own** `overflow-y-auto` — expected; they supersede `<main>` interaction when open.

---

## 2. Systems that **conflict** or add risk

| System | Conflict type |
|--------|----------------|
| **Mobile compact/focus mode** | Chrome height, grid `0fr/1fr`, **main padding**, bottom nav **transform** — all driven by scroll; changes **scrollable geometry** during scroll |
| **Pipeline IO compact** | Binary compact at sentinel boundary — possible **oscillation** |
| **Nested max-height lists** | Secondary scrollports — **touch handoff** with `<main>` |
| **Product tour** | Global **`scroll` capture** + **`setInterval`** — main-thread work during scroll |
| **`scrollIntoView` + collapse** | Programmatic scroll layered on layout animation |
| **Dynamic `--header-height`** | `ResizeObserver` — reflow + **scroll-margin** dependency |

---

## 3. Exact root causes (concise)

See **`root-cause-analysis.md`** for ranked table (R1–R9).

**Top three (by severity × confidence):**

1. **R1** — Scroll-linked **layout reflow** from compact/focus chrome + **`main` padding** transitions.  
2. **R3** — **Dynamic sticky height** → CSS variable → **`scroll-margin`** and reflow.  
3. **R2** — **IO boundary** behavior for pipeline compact mode.

**Needs device confirmation:** **R8** (transform + sticky on same element).

---

## 4. Highest-risk layout systems (for future changes)

1. `lib/mobileCompactChrome.ts` — grid collapse + **translate/opacity** (affects master + pipeline regions).  
2. `MobileChromeController` — all **scroll/IO**-driven **React state** paths.  
3. `AppChrome` **`main` inner padding** transitions paired with **`MobileBottomNav`** transform.  
4. `PipelineFileWorkspaceShell` **sticky** + **ResizeObserver** + transition classes.

---

## 5. Recommended fix order (when fixes are allowed — **not** executed here)

1. **Measure** on device: CLS, scroll offsets, compact toggle frequency (IO vs scroll).  
2. **Validate R8** — computed `transform` on sticky file `<header>` during transitions.  
3. **Decouple** or **sequence** chrome height vs `main` padding changes (reduce simultaneous transitions).  
4. **Hysteresis** on compact IO if oscillation observed.  
5. **Revisit** global capture listeners (tour) during scroll-heavy flows.  
6. Align **`AGENTS.md`** with current `PipelineFileWorkspace` overflow facts.

---

## 6. Artifact index

| Document | Contents |
|----------|----------|
| `scroll-ownership-map.md` | DOM hierarchy, primary scroll owner, drawers |
| `overflow-audit.md` | All overflow/touch surfaces; nested regions |
| `sticky-audit.md` | Sticky/fixed; height changes; z-index |
| `mobile-viewport-audit.md` | dvh/vh/safe-area; viewport hypotheses |
| `scroll-rerender-analysis.md` | Listeners, IO, rerenders |
| `transform-audit.md` | Transforms, backdrop, sticky constraints |
| `mobile-reproduction-report.md` | Steps; test pointers; QA placeholders |
| `root-cause-analysis.md` | Ranked R1–R9 |

---

*End of final summary.*
