# Phase 24.4F — Mobile Chrome Scroll-Direction Audit

**Date:** 2026-05-28  
**Status:** Audit only — **no patches**  
**User repro (strongest signal):** Scroll down → bottom nav hides + top label/header changes → **scroll position jumps**. Scroll up → reverse.

**Scope:** All scroll-direction-driven chrome. **Out of scope per user:** hierarchy expansion, triage bubbling, virtualization, OperationalOrientationStrip investigation.

---

## Executive finding

The **only** scroll-direction system in this codebase that matches the user repro (bottom nav hide on scroll down, reappear on scroll up, coupled to a “chrome state change”) is:

| Layer | Component | File |
|-------|-----------|------|
| **Controller** | `MobileChromeProvider` | `components/MobileChromeController.tsx` |
| **Bottom nav actuator** | `MobileBottomNav` | `components/MobileBottomNav.tsx` |
| **Motion tokens** | `mobileFocusBottomNavHidden` / `Visible` | `lib/mobileCompactChrome.ts` |

**Mechanism:** `<main data-app-main-scroll>` scroll listener → `requestAnimationFrame` → 14px delta hysteresis → `compactChrome` state → `isMobileFocusMode` → bottom nav `translate-y-full` + `opacity-0` (transform/opacity only; main content padding is **not** supposed to change).

**Top app header on scroll-direction routes:** `data-mobile-masterpage` toggles `expanded` ↔ `compact` on `<header data-testid="app-masterpage-chrome">`, but **no CSS or JSX consumer** currently reads that attribute for height collapse (legacy `mobileScrollCollapseGridClass` helpers are **dead code** — defined only in `lib/mobileCompactChrome.ts`, zero imports). Visual “top header change” on non-pipeline routes is therefore **mostly bottom-nav motion + optional master compression on tablet/desktop**, not a live collapse grid.

**Pipeline `/pipeline*` (current main):** Phase 24.4B sets `suspendCompact={isPipelineSurfaceRoute(pathname)}` on `MobileChromeProvider` (`AppChrome.tsx:589–592`), which **should** disable all scroll listeners and keep focus mode off. E2E asserts this (`tests/e2e/pipeline-scroll.spec.ts:570–614).

**If the user still sees bottom-nav hide/show on `/pipeline`**, one of these must be true:

1. **Runtime is not on 24.4B+ build** (production lag).
2. **`suspendCompact` is not effective** in their session (needs runtime proof below).
3. **Perceived “top header change”** is not app chrome focus mode — e.g. sticky in-page bands, browser UI, or a route other than `/pipeline`.

---

## Answers A–D

### A. Which component controls bottom nav visibility?

**Primary:** `MobileBottomNav` (`components/MobileBottomNav.tsx:62–124`)

- Subscribes via `useMobileBottomNavFocusMode()` (external store from `MobileChromeController`).
- When `isMobileFocusMode === true`: applies `mobileFocusBottomNavHidden` → `max-md:translate-y-full max-md:opacity-0 max-md:pointer-events-none` (`lib/mobileCompactChrome.ts:45–49`).
- When false: `mobileFocusBottomNavVisible`.
- Transition: `shellMotionTw.bottomNavSlide` (300ms transform/opacity, `lib/ui/motionTokens.ts:54–58`).
- **Fixed positioning** — `position: fixed; bottom: 0` (+ keyboard lift via `layout.keyboardInsetBottom`).

**State source:** `MobileChromeController` publishes focus mode (`MobileChromeController.tsx:269–274`).

**Not scroll-direction:** `ResponsiveNavProvider` sets `data-nav-bottom` on/off from viewport shell (`ResponsiveNavProvider.tsx:266–273`) — **layout breakpoint only**, not scroll direction.

---

### B. Which component controls top label/header visibility?

| Chrome band | Component | Scroll-direction? | On `/pipeline` hub |
|-------------|-----------|-------------------|---------------------|
| **App shell header** (DLC mark, search, actions) | `MobileTopNav` inside `MasterHeaderShell` / `<header data-testid="app-masterpage-chrome">` | **No** on mobile (compression hook returns neutral). `data-mobile-masterpage` toggles but **nothing reads it** for collapse. | Visible, static height |
| **Master header morph** (tablet/desktop) | `useMasterScrollCompression` → `MasterHeaderShell` | **Yes** — `main.scrollTop` → translate/scale/opacity | **Disabled** (`enabled: !isPipelineSurface`) |
| **Connectivity strip** (banners) | `AppChrome` shell strip | Opacity tied to master compression only | Static on pipeline mobile |
| **In-page hub context band** | `OperationalOrientationStrip` in `PipelinePageClient.tsx:2177` | **Sticky**, not direction-hide — **excluded from this phase** | Sticky `top-0` inside `<main>` scroll |
| **Hub filter toolbar** | `PipelinePageClient.tsx:1551` | **No** — `relative z-10`, scrolls with content | Always in flow |
| **File workspace file chrome** | `PipelineFileWorkspaceShell.tsx:137–164` | **No** — static `data-mobile-workspace-chrome="expanded"` | File route only |

**Scroll-direction “top chrome” that still exists app-wide:** only **`MobileChromeController` compact state** (attribute markers, not live header collapse) + **`useMasterScrollCompression`** on non-pipeline tablet/desktop.

---

### C. Does either system change layout height?

| System | DOM height | Layout reflow | Transform/opacity only | Mount/unmount |
|--------|------------|---------------|------------------------|---------------|
| **MobileChromeController → MobileBottomNav hide** | **No** (fixed nav) | **No** — nav stays in DOM | **Yes** — `translate-y-full`, opacity | **No** |
| **Main content bottom padding** | Fixed `pwaBottomPadding` / `pb-[max(5.5rem,…)]` | Does **not** shrink when nav hides (by design, `MobileChromeController.tsx:99–100`) | — | — |
| **MasterHeaderShell compression** | **No** (transform) | **No** on composited path | **Yes** | **No** |
| **Legacy collapse grid** (`mobileScrollCollapseGridClass`) | Would change (`grid-rows-[0fr]`) | **Dead code** — not imported | — | — |
| **visualViewport keyboard inset** | **No** | **No** | `bottom` CSS on nav/dock | **No** |
| **PipelineMobileWorkspaceOpsRail** | **No** | **No** | Shadow + `bottom` for keyboard | **No** |

**Scroll jump implication:** If jump correlates with nav hide/show, cause is **not** main-column padding height change (that was explicitly fixed in Phase 4). Likely candidates: **(1)** focus mode still toggling despite padding policy → compositing/scroll anchoring/browser interaction, **(2)** `scrollTop` disturbance from React `startTransition` + scroll listener feedback, **(3)** user environment not running pipeline `suspendCompact`.

---

### D. Is either system active on `/pipeline`?

| System | `/pipeline` hub | `/pipeline/[fileId]` | Notes |
|--------|-----------------|----------------------|-------|
| **MobileChromeController scroll listener** | **Should be OFF** (`suspendCompact`) | **Should be OFF** | Listeners skipped when `suspendCompact` (`MobileChromeController.tsx:174, 225`) |
| **MobileChromeController IO sentinel path** | **OFF** (no sentinel registered) | **OFF** (registration removed 24.4B) | `registerMainCompactSentinel` / `registerPipelineWorkspaceScroll` — **no callers** in app |
| **Bottom nav focus hide** | **Should be OFF** | **Should be OFF** (minimal file chrome shell has **no** `MobileBottomNav` in DOM) | File route: `AppChrome` early return without bottom nav (`AppChrome.tsx:222–245`, `379–401`) |
| **useMasterScrollCompression** | **OFF** | **OFF** (also `scrollDelegatedToWorkspace`) | `AppChrome.tsx:165–170` |
| **Hub collapse/reveal grids** | **Removed** (24.4B) | N/A | — |
| **PipelineMobileWorkspaceOpsRail IO/scroll** | N/A | **Active** — updates **active dock chip** only | Does not hide nav or header |
| **visualViewport listeners** | **Active** (global) | **Active** | Keyboard inset, not scroll-direction hide |

---

## Complete inventory — scroll-linked chrome systems

### Tier 1 — Matches user repro (scroll direction → chrome state)

| File | Component / hook | Trigger | Height | Layout | Transform | Mount/unmount |
|------|------------------|---------|--------|--------|-----------|---------------|
| `MobileChromeController.tsx` | `MobileChromeProvider` | `effectiveScrollEl.scrollTop` delta > 14px down / < -14px up; or `scrollTop < 48` expand; **md+ disabled** | No | No | No (state only) | No |
| `MobileChromeController.tsx` | Same — IO path | `IntersectionObserver` on compact sentinel vs scroll root | No | No | No | No — **unused** (no sentinel registered) |
| `MobileBottomNav.tsx` | `MobileBottomNav` | `useMobileBottomNavFocusMode()` true | No | No | **Yes** — slide off-screen | No |
| `lib/mobileCompactChrome.ts` | `mobileFocusBottomNavHidden` | class when focus mode | No | No | **Yes** | No |
| `lib/mobileCompactChrome.ts` | `mobileScrollCollapseGridClass` | `collapsed` boolean | **Would** (0fr grid) | **Dead** — zero imports | Opacity/translate on inner | No |
| `lib/mobileCompactChrome.ts` | `mobileScrollRevealInnerClass` | `collapsed` boolean | **Dead** | **Dead** | **Yes** | No |

### Tier 2 — Scroll-linked header morph (not mobile phone shell)

| File | Component / hook | Trigger | Height | Layout | Transform | Mount/unmount |
|------|------------------|---------|--------|--------|-----------|---------------|
| `useMasterScrollCompression.ts` | hook | `[data-app-main-scroll].scrollTop` → smootherstep 0–64/88/112px | No | No | **Yes** — header translate/scale/opacity | No |
| `MasterHeaderShell.tsx` | wrapper | `compression` prop from hook | No | No | **Yes** | No |
| `AppChrome.tsx` | connectivity strip | opacity from `masterCompression.compression` | No | No | Opacity only | No |

**Pipeline:** hook `enabled: !isPipelineSurface` + mobile shell returns neutral (`useMasterScrollCompression.ts:67–71`).

### Tier 3 — Viewport / keyboard (scroll-adjacent, not direction-hide)

| File | Component / hook | Trigger | Height | Layout | Transform | Mount/unmount |
|------|------------------|---------|--------|--------|-----------|---------------|
| `useResponsiveNavLayout.ts` | `subscribeViewportSignals` | `visualViewport` resize/**scroll**, window resize (80ms debounce + rAF) | No | No | `bottom` on nav/dock | No |
| `MobileBottomNav.tsx` | nav `style.bottom` | `layout.keyboardInsetBottom` | No | No | Position only | No |
| `PipelineMobileWorkspaceOpsRail.tsx` | workspace dock | `visualViewport` + workspace scroll → active chip | No | No | Shadow, `bottom` | No |
| `useVisualViewportMaxHeightStyle.ts` | hook | `visualViewport` resize/scroll | Can affect max-height | Possible | No | No |

### Tier 4 — Scroll listeners (not chrome hide/show)

| File | Listener | Purpose |
|------|----------|---------|
| `scrollContinuity.ts` | scrollTop read/restore | Operational scroll preserve — **not** direction chrome |
| `pipelineScrollDebug.ts` | passive scroll mark | Debug only |
| `PipelineMobileWorkspaceOpsRail.tsx` | workspace scroll + IO | Dock section highlight |
| `useMasterScrollCompression.ts` | main scroll | Header morph (Tier 2) |
| `MobileChromeController.tsx` | main/workspace scroll | Compact/focus (Tier 1) |
| `ClientMomentumStars.tsx` | window scroll capture | Popover reposition |
| `OperationalFilterDrawer.tsx` | window scroll | Sheet position |
| `TaskTriageQuickEditPopover.tsx` | window scroll | Popover position |
| `GlobalSearchPalette` / `ProductTourOverlay` / `SnoozeMenu` | scroll | Overlay positioning |
| `PipelineBlockDrawerSettings.tsx` | window scroll | Popover position |

**Not found in repo:** `useScrollDirection`, `hideOnScroll`, `showOnScroll`, `useWindowScroll`, `useScroll(`, `pageYOffset` in product code (only debug/scrollContinuity).

### Tier 5 — Fixed/sticky chrome (not scroll-direction toggled)

| File | Component | Behavior |
|------|-----------|----------|
| `AppChrome.tsx` | `<header>`, `MobileBottomNav` | Fixed/sibling of `<main>`; nav always in DOM |
| `PipelineFileWorkspaceShell.tsx` | file header, access banner sticky | Static / sticky inside workspace scroll |
| `ContextualQuickTip.tsx` | fixed bottom-left | Route-based, not scroll |
| `OperationalBatchBar.tsx` | enter animation (rAF) | Not scroll-driven |

### Tier 6 — Hydration / first-frame (not scroll-direction)

| File | Component | Trigger |
|------|-----------|---------|
| `ShellMotionReadyContext.tsx` | `ShellMotionReadyProvider` | First rAF enables nav transitions |
| `OperationalContentReveal.tsx` | opacity reveal | One-shot mount rAF on hub content wrapper |

---

## Proof — exact component causing jump (runtime, no code changes)

Run on **mobile** (`<768px` width), `/pipeline`, while reproducing jump:

```js
// Paste in DevTools console during fast scroll down/up
(() => {
  const nav = document.querySelector('nav[aria-label="Primary"]');
  const cs = nav ? getComputedStyle(nav) : null;
  return {
    path: location.pathname,
    dataDlcMobileFocus: document.documentElement.hasAttribute("data-dlc-mobile-focus"),
    dataDlcMobileCompact: document.documentElement.hasAttribute("data-dlc-mobile-compact"),
    dataMobileMasterpage: document.querySelector("[data-testid=app-masterpage-chrome]")?.getAttribute("data-mobile-masterpage"),
    mainScrollTop: document.querySelector("[data-app-main-scroll]")?.scrollTop,
    navTransform: cs?.transform,
    navOpacity: cs?.opacity,
    navBottom: cs?.bottom,
    navAriaHidden: nav?.getAttribute("aria-hidden"),
  };
})();
```

| If jump correlates with… | Proven cause |
|--------------------------|--------------|
| `data-dlc-mobile-focus` flips **true** + `navTransform` includes matrix translate Y | **`MobileChromeController` → `MobileBottomNav`** (Tier 1) |
| Attributes stay **false** but nav still transforms | **CSS/transition bug or different build** — capture HAR + deployment ID |
| `data-mobile-masterpage` → `compact` but nav unchanged | Stale state marker only (no height consumer) — **not** primary jump source |
| `masterCompression.compression > 0` on mobile pipeline | **Should not happen** — hook disabled |
| All chrome attrs stable, jump persists | Escalate to layout forensics (24.4E) — **not** scroll-direction chrome |

**Enable layout debug (optional):** `localStorage.setItem("dlc-pipeline-layout-debug","1"); location.reload()` — watch for `SCROLL_WRITE` coinciding with nav transform.

---

## Phase 24.4F — Removal plan (proposal only)

**Goal:** On **all `/pipeline*` routes**, mobile chrome is **static**: bottom nav always visible, app header always expanded, **zero** scroll-direction state, **zero** mount/unmount during scroll, **zero** height animation, native scroll uninterrupted.

### Step 1 — Hard-proof pipeline exemption (controller)

**File:** `components/MobileChromeController.tsx`

- When `suspendCompact` is true (pipeline): **do not attach** scroll or IO listeners; force `compactChrome = false`; call `publishMobileFocusMode(false)` on every scroll event (belt-and-suspenders).
- Alternative: split `MobileChromeProvider` into no-op pipeline variant.

**Acceptance:** `data-dlc-mobile-focus` never appears during 30s fast scroll on `/pipeline`.

### Step 2 — Bottom nav always visible on pipeline

**File:** `components/MobileBottomNav.tsx`

- If `isPipelineZonePath(pathname)` (or prop from AppChrome): **never** apply `mobileFocusBottomNavHidden`; skip focus mode subscription.
- Remove `aria-hidden` toggling on pipeline.

**Acceptance:** `navTransform` stays `none` or identity matrix during scroll.

### Step 3 — Top header static on pipeline

**Files:** `AppChrome.tsx`, `useMasterScrollCompression.ts` (already disabled — verify no regression)

- Keep `enabled: !isPipelineSurface`.
- Pin `data-mobile-masterpage="expanded"` on pipeline (ignore controller state).
- **Do not** reintroduce `mobileScrollCollapseGridClass` on hub.

**Hub in-page context band:** User choice for 24.4F implementation — **permanently visible** (non-sticky) **or** **permanently hidden** on mobile pipeline; **not** scroll-direction toggled. (OperationalOrientationStrip out of scope for root-cause proof; only static policy here.)

### Step 4 — Delete dead scroll-chrome paths on pipeline

- Confirm no `registerMainCompactSentinel` / `registerPipelineWorkspaceScroll` callers (already true).
- Remove unused collapse helpers from pipeline imports if any remain.
- File route: keep `PipelineMobileWorkspaceOpsRail` chip tracking (not chrome hide) OR gate behind “static dock” flag if it contributes to perceived motion.

### Step 5 — Tests + deploy

| Test | File |
|------|------|
| `data-dlc-mobile-focus` stays false on hub scroll | extend `pipeline-scroll.spec.ts` |
| Bottom nav never `translateY(100%)` on hub scroll | **new** assertion on computed transform |
| Same on file workspace scroll | existing + transform check |
| `npm run qa:governance` | required |
| `npm run deploy:prod` | when implementing 24.4F |

### Step 6 — Optional global cleanup (post-pipeline)

After pipeline is stable, consider disabling scroll-direction focus mode **app-wide** (tasks, contacts, etc.) if product wants permanent bottom nav everywhere — **separate decision**, not required for pipeline fix.

---

## Decision tree

```
User repro: scroll ↓ → bottom nav hides → jump
│
├─ On /pipeline + data-dlc-mobile-focus toggles
│   └─ suspendCompact ineffective or not deployed
│       → 24.4F Steps 1–2 (hard disable + nav guard)
│
├─ On /pipeline + focus attrs stay false + nav still hides
│   └─ Investigate deployment / CSS override / wrong element
│
├─ On /tasks or other route + focus toggles
│   └─ Expected Tier-1 behavior today
│       → 24.4F pipeline-first, then global policy
│
└─ Chrome attrs stable + jump persists
    └─ Not mobile chrome (escalate 24.4E layout capture)
```

---

## Files reference (canonical)

| Role | Path |
|------|------|
| Scroll-direction controller | `lender-app/components/MobileChromeController.tsx` |
| Bottom nav actuator | `lender-app/components/MobileBottomNav.tsx` |
| Pipeline suspend flag | `lender-app/components/AppChrome.tsx` (589–592, 104–107) |
| Motion / hide classes | `lender-app/lib/mobileCompactChrome.ts` |
| Master header morph | `lender-app/hooks/useMasterScrollCompression.ts` |
| 24.4B prior removal | `docs/phase24-4B-scroll-compression-removal.md` |

---

*Phase 24.4F audit — mobile chrome scroll-direction inventory. Investigation only until runtime proof confirms `data-dlc-mobile-focus` on the reproducing device.*
