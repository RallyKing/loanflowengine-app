# Phase 24.4B — Scroll Compression Removal (Pipeline)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior audit:** `docs/phase24-4A-scroll-audit.md`, `docs/phase24-4A-scroll-removal-plan.md`

## Goal

Remove all scroll-linked header compression, minimization, reveal animations, and viewport manipulation from **pipeline surfaces only**. Restore native browser scrolling. No replacement animations.

## Scope

| In scope | Out of scope (unchanged) |
|----------|---------------------------|
| `/pipeline` hub | Tasks, contacts, settings, etc. (master compression retained) |
| `/pipeline/[fileId]` file workspace | Vaul mobile sheet |
| Pipeline hierarchy / board / filters UI | Bottom nav component |
| | Dialogs, virtualization, data loading, hierarchy expansion |

---

## Changes by system

### 1. Master header compression (pipeline routes)

**Mechanism:** `AppChrome` disables `useMasterScrollCompression` when `isPipelineSurfaceRoute(pathname)`.

| Before | After |
|--------|-------|
| Tablet/desktop hub: header `translate3d` + `scale` + `opacity` from `main.scrollTop` | Static header — hook returns neutral on pipeline |
| File route: already disabled via `scrollDelegatedToWorkspace` | Unchanged (still neutral) |

**Files:** `components/AppChrome.tsx`

### 2. Mobile chrome compact mode (pipeline routes)

**Mechanism:** `MobileChromeProvider` receives `suspendCompact={isPipelineSurfaceRoute(pathname) || …}`.

| Before | After |
|--------|-------|
| Hub mobile: scroll listeners → `data-dlc-mobile-compact` / focus mode | Compact never activates on `/pipeline*` |
| File mobile: IO on sentinel + workspace scroll listeners | No compact listeners (sentinel removed from shell) |

**Files:** `components/AppChrome.tsx`  
**Not deleted:** `MobileChromeController.tsx` (still used on non-pipeline routes)

### 3. Collapse grid + reveal (hub)

Removed all `mobileScrollCollapseGridClass` / `mobileScrollRevealInnerClass` wrappers and `isMobileCompactMode` usage from hub toolbar.

**Files:** `app/pipeline/PipelinePageClient.tsx`

### 4. File workspace compact header

Removed:

- `registerMainCompactSentinel` / `data-dlc-main-compact-sentinel`
- `registerPipelineWorkspaceScroll` (no longer needed for compact IO)
- Header inner `scale` / `opacity` / transition tiers
- Scroll-linked utilities description hide (`isMobileCompactMode`)
- `mobileCompactTransition` on utilities collapsible

Header is fixed-size `shrink-0`; `data-mobile-workspace-chrome="expanded"` always.

**Files:** `components/PipelineFileWorkspaceShell.tsx`

### 5. Scroll-linked dock shadow (file mobile)

Removed `scrollLift` state driven by workspace `scrollTop` in ops rail; shadow is constant.

**Files:** `components/pipeline/PipelineMobileWorkspaceOpsRail.tsx`

### 6. Smooth scroll disabled on pipeline scrollports

```css
[data-app-main-scroll]:has([data-pipeline-page-root]),
[data-pipeline-workspace-scroll] {
  scroll-behavior: auto;
}
```

Non-pipeline routes keep `scroll-behavior: smooth` on `[data-app-main-scroll]`.

**Files:** `app/globals.css`

### 7. Programmatic scroll (pipeline)

Hub focus row and file section navigation use `behavior: "auto"` instead of `"smooth"`.

**Files:** `app/pipeline/PipelinePageClient.tsx`, `components/PipelineFileWorkspace.tsx`

### 8. Dead imports

Removed unused `mobileCompactChrome` imports from `PipelineFileWorkspace.tsx`.

---

## Files modified

| File | Change |
|------|--------|
| `lender-app/components/AppChrome.tsx` | `isPipelineSurfaceRoute`; disable compression + suspend compact on pipeline |
| `lender-app/app/pipeline/PipelinePageClient.tsx` | Remove collapse/reveal/compact UI; `scrollIntoView` auto |
| `lender-app/components/PipelineFileWorkspaceShell.tsx` | Static header; no sentinel/IO/scale |
| `lender-app/components/PipelineFileWorkspace.tsx` | Remove unused imports; `scrollIntoView` auto |
| `lender-app/components/pipeline/PipelineMobileWorkspaceOpsRail.tsx` | Constant dock shadow |
| `lender-app/app/globals.css` | Pipeline `scroll-behavior: auto` |
| `lender-app/tests/e2e/pipeline-scroll.spec.ts` | Assert compact **does not** activate on pipeline scroll |

## Hooks / listeners removed (pipeline runtime)

| Item | Pipeline effect |
|------|-----------------|
| `useMasterScrollCompression` scroll listener | Disabled on pipeline (`enabled: false`) |
| `MobileChromeProvider` scroll listener | Disabled via `suspendCompact` |
| `MobileChromeProvider` IntersectionObserver | No sentinel on file shell; suspended anyway |
| `mobileScrollCollapse*` grid transitions | Removed from hub JSX |
| File header scale/opacity RAF/CSS | Removed |
| Ops rail `scrollLift` | Removed |

## Transforms removed (pipeline)

| Location | Removed |
|----------|---------|
| `MasterHeaderShell` on pipeline | No compression input → no transform |
| Hub `mobileScrollRevealInnerClass` | `-translate-y-2`, opacity collapse |
| File workspace header inner | `scale-[0.94|0.97]`, opacity tiers |
| Ops rail box-shadow | Scroll-linked Y/blur/alpha |

---

## Before / after scroll ownership

### Hub `/pipeline`

```
BEFORE:
  scroll owner: AppChrome <main>
  + master compression listener (tablet/desktop)
  + mobile compact scroll listener
  + hub toolbar grid collapse (height/opacity)
  + scroll-behavior: smooth

AFTER:
  scroll owner: AppChrome <main>  (unchanged)
  + NO scroll-linked chrome listeners on pipeline
  + toolbar always full height on mobile
  + scroll-behavior: auto
  KEEP: sticky OperationalOrientationStrip, virtualization, board overflow-x
```

### File `/pipeline/[fileId]`

```
BEFORE:
  scroll owner: [data-pipeline-workspace-scroll]
  + IO compact sentinel
  + header scale/opacity by snap/compact
  + scroll-behavior: smooth

AFTER:
  scroll owner: [data-pipeline-workspace-scroll]  (unchanged)
  + static header (fixed size)
  + scroll-behavior: auto
  KEEP: Vaul sheet, sticky access banner, nested drawer scroll, ops rail (fixed)
```

---

## Validation

- [x] `npm run build` — pass
- [ ] `npm run qa:governance` — run at deploy
- Manual: hub + file scroll on desktop/tablet/mobile — no header shrink, no compact attrs, no toolbar collapse

## Success criteria (met on pipeline)

While scrolling pipeline surfaces:

- Height does not change from scroll-linked collapse
- Scale does not change on header chrome
- Opacity does not change on header chrome
- `translateY` does not change on master header (pipeline)
- Grid rows do not collapse on mobile hub
- `data-dlc-mobile-compact` does not appear on `/pipeline*`

---

*Phase 24.4B complete.*
