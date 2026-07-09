# Phase 24.4F — Pipeline Static Mobile Chrome (Elimination)

**Date:** 2026-05-28  
**Status:** Implemented — scroll-reactive mobile chrome **hard-disabled** on `/pipeline` and `/pipeline/*`

---

## Inventory (scroll-reactive chrome systems)

| File | Lines | Trigger | State | Visual effect |
|------|-------|---------|-------|---------------|
| `MobileChromeController.tsx` | 238–276 | `scrollTop` delta ±14px on `<main>` | `compactChrome` → `isMobileFocusMode` | Publishes focus; sets `data-dlc-mobile-*` |
| `MobileChromeController.tsx` | 184–232 | IO on compact sentinel | `compactChrome` | Same (sentinel path unused on pipeline) |
| `MobileChromeController.tsx` | 71–75 | `publishMobileFocusMode` | external store | Bottom nav subscribers update |
| `MobileBottomNav.tsx` | 114–116 | `useMobileBottomNavFocusMode()` | hide class toggle | `translate-y-full`, `opacity-0` |
| `lib/mobileCompactChrome.ts` | 45–49 | focus mode classes | CSS | Nav slide off-screen |
| `AppChrome.tsx` | 165–170 | `main.scrollTop` (non-pipeline) | `masterCompression` | Header translate/scale/opacity |
| `MasterHeaderShell.tsx` | 46–47 | compression prop | inline style | GPU transform on header |
| `useResponsiveNavLayout.ts` | 177 | `visualViewport` scroll | `keyboardInsetBottom` | Nav `bottom` offset (keyboard only) |

**Not scroll-direction chrome:** `PipelineMobileWorkspaceOpsRail` IO/scroll (dock chip highlight on file route only).

---

## Elimination (pipeline routes)

| Requirement | Implementation |
|-------------|----------------|
| Bottom nav always visible | `MobileBottomNav`: `pipelineStaticChrome` → always `mobileFocusBottomNavVisible` |
| No nav animate/translate | `max-md:!transition-none`; no hide classes on pipeline |
| No scroll listeners for chrome | `MobileChromeProvider` `suspendCompact={isPipelineSurfaceRoute(...)}` — listeners not attached |
| No chrome IO | IO effect returns early when `suspendCompact` |
| Top chrome permanently **visible** | `masterpageState="expanded"`; `prefersReducedMotion \|\| pipelineStaticChrome` on `MasterHeaderShell` |
| No focus/compact attrs | Forced remove when `suspendCompact` |
| Debug API | `window.__PIPELINE_CHROME_DEBUG()` |

---

## Verification

```js
window.__PIPELINE_CHROME_DEBUG()
// Expected on /pipeline after scroll:
// mobileFocusEnabled: false
// mobileCompactEnabled: false
// bottomNavHidden: false
// scrollListeners: 0
// intersectionObservers: 0
```

E2E: `tests/e2e/pipeline-scroll.spec.ts` — mobile compact + chrome debug assertions.

---

## Files changed

- `lib/navigation/isPipelineSurfaceRoute.ts`
- `lib/debug/pipelineChromeDebug.ts`
- `components/debug/PipelineChromeDebugMount.tsx`
- `components/MobileChromeController.tsx`
- `components/MobileBottomNav.tsx`
- `components/AppChrome.tsx`
- `tests/e2e/pipeline-scroll.spec.ts`

---

*No redesign — scroll-reactive chrome bypassed on pipeline only; other routes unchanged.*
