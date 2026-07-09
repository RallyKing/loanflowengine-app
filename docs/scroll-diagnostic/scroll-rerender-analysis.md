# Scroll listeners, observers & rerender analysis

**Diagnostic only.** Goal: map **JavaScript** tied to scroll/resize/layout that can cause **rerenders**, **layout recalculation**, or **gesture conflicts** on mobile.

---

## 1. `MobileChromeController` — core pipeline

**File:** `lender-app/components/MobileChromeController.tsx`

| Mechanism | Trigger | State / side effects |
|-----------|---------|----------------------|
| **Passive `scroll`** on `<main>` | Every scroll event (coalesced to **one `requestAnimationFrame`** per frame) | `startTransition` → `setCompactChrome` from `scrollTop` delta + thresholds — **only when `compactSentinelEl == null`** |
| **`IntersectionObserver`** | Sentinel intersection changes vs `root: scrollEl` | `startTransition` → `setCompactChrome` boolean inverted from `isIntersecting` — **when pipeline sentinel registered** |
| **`ResizeObserver`** (not here — in shell) | Sticky chrome height | CSS vars on shell (see below) |
| **DOM attribute toggle** | `isMobileCompactMode` / `isMobileFocusMode` | `document.documentElement` `data-dlc-mobile-compact`, `data-dlc-mobile-focus` |

**Rerender surface:** Any consumer of `useMobileChrome()` ( **`AppChrome`**, **`PipelineFileWorkspaceShell`**, **`MobileBottomNav`**, collapsibles, padding wrappers) may rerender when `compactChrome` flips.

**Scroll-linked updates:** Compact mode uses **`startTransition`** — React 18 deprioritizes updates vs input, but **still schedules work** during scroll bursts.

---

## 2. `PipelineFileWorkspaceShell` — sticky height

**File:** `lender-app/components/PipelineFileWorkspaceShell.tsx`

| Mechanism | Purpose |
|-----------|---------|
| `ResizeObserver` on sticky `<header>` | Updates pixel height → `--header-height` / `--pipeline-file-sticky-height` on shell |
| `useLayoutEffect` deps **`compact`, `isSnoozed`** | Synchronous remeasure after class changes |

**Effects during scroll:** If sticky height changes (compact transition), **observer fires** → React `setState` → rerender shell → **all sections** using CSS `var(--header-height)` for `scroll-margin` may **reflow**.

---

## 3. `PipelineFileWorkspace` — `jumpToDrawerSection`

**File:** `lender-app/components/PipelineFileWorkspace.tsx`

| Call | Behavior |
|------|----------|
| `scrollIntoView` | `behavior: "smooth"` then `behavior: "auto"` after **320ms** |
| `startTransition` + `setDrawerLayout` | Expands target section, may animate **grid** height (`CollapsibleSection`) |

**Conflict potential:** **Smooth** scroll + **collapsing** animation (~300ms) + **second** `scrollIntoView` — user may see **double motion** or **corrective jump** (comment acknowledges reconcile).

---

## 4. `ProductTourOverlay`

**File:** `lender-app/components/ProductTourOverlay.tsx`

| Event | Work |
|-------|------|
| `window` **`scroll` capture `true`** | `refreshRect` → `scrollIntoView({ behavior: "smooth" })` on target + `setRect` / `setHasTarget` |
| `resize` | same |
| **`setInterval` 400ms** while active | `refreshRect` |

**Severity flag:** **Global** capture-phase scroll listener + **periodic** layout reads — can contend with **main** scrolling whenever tour is active (unrelated to pipeline file unless tour runs there).

---

## 5. `SnoozeMenu` — `useSnoozePanelPosition`

**File:** `lender-app/components/SnoozeMenu.tsx`

- `window.addEventListener("scroll", on, true)` + `resize` while panel **open**.
- Updates position state from `getBoundingClientRect`.

**Scope:** Open popover only.

---

## 6. `PipelineBlockDrawerSettingsMenu`

**File:** `lender-app/components/pipeline/PipelineBlockDrawerSettings.tsx`

- While **open**: `window` `scroll` (capture) + `resize` → `updatePos` → `setPanelPos`.

---

## 7. `SettingsPageClient` / hash

**File:** `lender-app/lib/useSettingsHashSection.ts` (referenced from `SettingsPageClient.tsx`)

- `useScrollSettingsSectionIntoView` — **not** on pipeline file route by default; listed for completeness.

---

## 8. Passive vs capture — summary

| Listener | Capture? | Notes |
|----------|----------|-------|
| `MobileChromeController` `main` scroll | No (bubble on element) | Passive |
| Product tour | **Yes** | Runs for all scroll events including `<main>` |
| Snooze / block settings | **Yes** | Positioning |

**Diagnostic:** Capture listeners see scroll events **during** propagation; cost is handler invocations + possible `setState` in children.

---

## 9. IntersectionObserver interactions

| Observer | Root | Effect |
|----------|------|--------|
| Pipeline compact sentinel | `<main>` | Toggles compact — **discrete**; can fire when sentinel **flicks** at threshold |

**vs scroll listener:** IO avoids **per-frame** delta math on file route; still can fire **multiple** times near boundary.

---

*End of scroll/rerender analysis.*
