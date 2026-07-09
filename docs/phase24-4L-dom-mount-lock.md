# Phase 24.4L — Scorched-Earth DOM Mount Locking

**Date:** 2026-05-28  
**Observation:** Bottom nav still appears to disappear on fast scroll down/up after 24.4J CSS `!important` lock. User hypothesis: React conditional unmount; engineering audit found **no** `{condition && <MobileBottomNav />}` — hide path is **CSS + global focus snapshot**, with a secondary risk of Tailwind `hidden` when `layout.useBottomNavigation` flickers.

---

## Audit (Step 1–2)

| Location | Conditional unmount? |
|----------|----------------------|
| `AppChrome.tsx` | **No** — `<MobileBottomNav />` always rendered (saas + classic) |
| `app/layout.tsx` | **No** — single `AppChrome` wrapper |
| `MobileChromeProvider.tsx` | **No** — context only; scroll listeners drive `compactChrome` / focus |
| `MobileBottomNav.tsx` | **No unmount** — always returns `<nav>`; hides via `translate-y-full` / `opacity-0` or `placement: hidden` |
| `PipelineMobileWorkspaceOpsRail.tsx` | File workspace dock only (`xl:hidden`); fixed position, **no** scroll-hide |
| `OperationalBatchBar` | Unmounts when selection closed — unrelated to scroll |

---

## What shipped

### Flag

`lib/debug/phase24-4L-dom-mount-lock.ts` — `PHASE_24_4L_DOM_MOUNT_LOCK = true`

### `MobileBottomNav.tsx`

- **Always mounted** — no early `return null`
- On pipeline + 24.4L:
  - Ignores focus-hide classes (`hideBottomNav` forced false)
  - `aria-hidden={false}` always
  - Inline `display: flex`, `visibility: visible`, `transform: translate3d(0,0,0)`
  - `bottomNavPlacementClass(..., forceDomLock)` → never `hidden` on mobile
  - Sets `data-pipeline-nav-dom-lock="true"` on `<nav>`

### `MobileChromeController.tsx`

- `pipelineRouteFrozen` — when 24.4L + pipeline route: **no** scroll/IO listeners, focus/compact always false (uses `window.location.pathname` fallback)

### `globals.css`

- `html[data-pipeline-nav-dom-lock="true"] nav[aria-label="Primary"]` — mobile `!important` display/visibility/transform lock

### `PipelineChromeDebugMount.tsx`

- Toggles `html[data-pipeline-nav-dom-lock]`

---

## Device verification

On `/pipeline` mobile:

```js
document.documentElement.hasAttribute("data-pipeline-nav-dom-lock")  // true
__PIPELINE_CHROME_DEBUG()  // bottomNavHidden: false, mobileFocusEnabled: false
```

Fast-scroll — app bottom nav must remain in DOM and visible. If UI chrome still animates, it is **native browser** toolbars (not DLC nav unmount).

---

## Revert

Set `PHASE_24_4L_DOM_MOUNT_LOCK` to `false` in `phase24-4L-dom-mount-lock.ts`.

---

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_67qBE5aTjEZK4GsTTxLDjurCnx1P` (2026-05-28)
