# Phase 24.4J — Pipeline Bottom Nav Absolute Lock

**Date:** 2026-05-28  
**User observation:** Bottom nav still slides off on fast scroll down and returns on scroll up — contradicting 24.4F “static chrome” reports when debug API showed flags off.

**Root cause hypothesis:** `usePathname()` can be briefly empty during hydration while scroll listeners already drive `mobileFocusModeSnapshot`; conditional `pipelineStaticChrome` then fails and `translate-y-full` applies.

---

## Changes

### Path matching (`lib/navigation/isPipelineSurfaceRoute.ts`)

- `normalizeAppPathname()` — trims trailing slashes (`/pipeline/` → `/pipeline`)
- `resolvePipelineSurfaceRoute()` — checks Next pathname **and** `window.location.pathname`

### `MobileChromeController.tsx`

- `useLayoutEffect` on pipeline `navigationKey` — clears compact/focus **before paint**
- `useLayoutEffect` when `suspendCompact` — same sync path

### `MobileBottomNav.tsx`

- When `PHASE_24_4J_PIPELINE_NAV_LOCK && onPipelineSurface`:
  - Fixed visibility classes (`PIPELINE_BOTTOM_NAV_FORCE_VISIBLE_CLASS`)
  - `!transition-none`, inline `transform: translate3d(0,0,0)`, `opacity: 1`
  - `aria-hidden={false}` always
  - Sets `html[data-pipeline-bottom-nav-locked]`

### `globals.css`

- `!important` override on `nav[aria-label="Primary"]` when lock attribute set

### `AppChrome.tsx`

- `suspendCompact` uses `resolvePipelineSurfaceRoute(pathname)`

---

## Verify on device

1. `/pipeline` — fast scroll; nav must **not** translate off-screen.
2. Console: `__PIPELINE_CHROME_DEBUG()` → `bottomNavHidden: false`, `mobileFocusEnabled: false`.
3. `document.documentElement.hasAttribute("data-pipeline-bottom-nav-locked")` → `true`.

Revert: set `PHASE_24_4J_PIPELINE_NAV_LOCK` to `false` in `phase24-4J-pipeline-nav-lock.ts`.

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_6xJ5zGTudt27VxiNFAUuYxVUBQGi` (2026-05-28)
