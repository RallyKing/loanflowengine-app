# Targeted scroll timeline — one mobile gesture (Pipeline File Workspace)

**Scope:** Forensic reconstruction from source. **Not** a captured browser trace.  
**Route assumption:** Signed-in app, **classic** or **SaaS** scheme, `/pipeline/[fileId]` (Convex id), viewport `<768px`, **pipeline file shell** mounted with **`registerMainCompactSentinel`** (sentinel present → **no** `scroll` listener in `MobileChromeController`).

---

## 0. Preconditions (code-defined)

- `MobileChromeProvider` has `scrollEl === <main>` (from `registerMainScrollContainer` ref).
- `compactSentinelEl !== null` (element `[data-dlc-main-compact-sentinel]` under `PipelineFileWorkspaceShell`).
- `suspendCompact === false` (e.g. SaaS mobile menu closed).
- `isMdUp === false`.

Then the **scroll path** in `MobileChromeController.tsx` is **IntersectionObserver only** (lines 113–135); the **`scroll` + `requestAnimationFrame` effect does not attach** (lines 137–138 guard: `compactSentinelEl != null` → return).

---

## 1. Logical event order (user scrolls down until sentinel leaves root)

| Phase | Event / work unit | Subsystem | Notes |
|-------|-------------------|-----------|--------|
| A | `touchstart` | Browser / compositor | Target may be `<main>` or descendant. |
| B | Scroll gesture | Native | `<main>` is `overflow-y: auto`; momentum may continue after finger up. |
| C | `scroll` events on `<main>` | Browser | **Fired during gesture and momentum.** Fired **without** `MobileChromeController` subscription on this route (no handler). |
| D | Layout / paint | Browser | Sticky file header recomputes stick position vs `<main>` scrollport. |
| E | **IntersectionObserver** delivery | `MobileChromeController` | `root: scrollEl` (`<main>`), `threshold: 0`. When sentinel exits root intersection → callback queued. |
| F | IO callback | `MobileChromeController` L121–124 | `startTransition(() => setCompactChrome(!hit))` — `hit === false` → `compactChrome === true`. |
| G | React **transition** render | React 18 | `AppChromeBody`, `PipelineFileWorkspaceShell`, `MobileBottomNav`, `PipelineFileWorkspaceUtilitiesCollapsible` read context. |
| H | **Class / style mutations** | See Section 2 below | Multiple `transition-*` Tailwind classes animate **300ms / 200ms** windows. |
| I | **`useLayoutEffect`** (`PipelineFileWorkspaceShell` L190–195) | Runs after DOM commit | `compact` / `isSnoozed` deps → `getBoundingClientRect().height` on sticky `<header>` → `setStickyChromeHeightPx` if `h > 0`. |
| J | **`ResizeObserver`** (`PipelineFileWorkspaceShell` L174–186) | Same tick or next microtask | If observed `<header>` border box size changed → `apply()` → `setStickyChromeHeightPx`. |
| K | Inline style on shell | `PipelineFileWorkspaceShell` L197–203 | `--header-height`, `--pipeline-file-sticky-height` updated on `[data-pipeline-file-workspace-shell]`. |
| L | **CSS dependent layout** | `globals.css` | `scroll-margin-top` on pipeline sections uses `var(--header-height, …)` — **scroll snap margins** for targets update. |
| M | `useEffect` (html attributes) | `MobileChromeController` L182–195 | `data-dlc-mobile-compact`, `data-dlc-mobile-focus` toggled on `<html>`. |
| N | **Continued momentum** | Browser | If step F–L change **main inner padding** or **document flow height** beneath sticky, **effective `scrollTop` / visible position** can shift (browser scroll anchoring + `overflow-anchor` overrides). |

**Not deterministically ordered without a trace:** “repaint events” vs “layout recalculations” interleaving (E–L). IO callbacks are **async** relative to scroll events; can coalesce with animation frames.

---

## 2. Component / rerender chain (compact: false → true)

**State:** `compactChrome` in `MobileChromeProvider` (L74).

**Context `useMemo`** (L197–214): new object when `compactChrome`, `isMobileCompactMode`, `isMobileFocusMode` change.

**Subscribers (target scope only):**

1. **`AppChromeBody`** (`AppChrome.tsx` L220–227)  
   - `compact = isMobileCompactMode`, `focus = isMobileFocusMode`.  
   - Rerender triggers different `className` trees: `mobileScrollCollapseGridClass(compact)`, `mobileScrollRevealInnerClass(compact)`, header padding branches, **`main` inner `div`** padding for pipeline wide route vs focus (L522–528 SaaS / classic equivalent).

2. **`PipelineFileWorkspaceShell`** (`PipelineFileWorkspaceShell.tsx` L154–160)  
   - `compact = !mobileMasterExpanded` (same flip as `compactChrome`).  
   - Sticky `<header>`: `compact ? "max-md:pt-0 …" : "max-sm:pt-[max(0.5rem, env(safe-area-inset-top))]"`; `WorkspaceContentContainer` padding L231–235; `mobileWorkspaceStackClass(isMobileCompactMode)` L260.

3. **`MobileBottomNav`** (`MobileBottomNav.tsx` L44, L80–82)  
   - `isMobileFocusMode` → applies `mobileFocusBottomNavHidden` (`translate-y-full`, `opacity-0`, `pointer-events-none`).

4. **`PipelineFileWorkspaceUtilitiesCollapsible`** (optional)  
   - `isMobileCompactMode` adjusts description visibility, header classes, stack gap.

---

## 3. Pipeline-file-specific vs non-pipeline timeline note

On **non-pipeline-file** mobile routes, **Phase C** additionally schedules **raf flush** (L163–166) which may call `setCompactChrome` **every frame** while scroll deltas exceed thresholds (bounded by `startTransition`, but still **scroll-linked state**).

**Pipeline file:** Phase C does **not** update React from scroll; **Phase E–F** is the **first** compact toggle tied to geometry.

---

## 4. “Scroll position shifts” — mechanisms (hypothesis-level, code-backed)

| Mechanism | Source |
|-----------|--------|
| **`main` inner `padding-bottom` transition** (`mobileContentBottomPadTransition` + large `pb` vs `mobileFocusMainBottomPadClass`) | `AppChrome.tsx` L521–527 (classic pipeline wide) |
| **Sticky header height change** (padding / safe-area) | `PipelineFileWorkspaceShell.tsx` L219–236 |
| **Grid row `0fr`/`1fr`** on banner strip | `AppChrome.tsx` `bannerCollapse` L229–235 |
| **`scroll-margin-top` recalculation** | CSS vars from shell → sections reflow alignment for scrollIntoView, not necessarily `scrollTop` |
| **Scroll anchoring** | `overflow-anchor: none` on some headers — interaction with WebKit differs |

---

*End of targeted scroll timeline.*
