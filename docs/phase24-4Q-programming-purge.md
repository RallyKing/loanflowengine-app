# Phase 24.4Q — Global Programming Purge & Resize Event Defusal

**Date:** 2026-05-29  
**Hypothesis:** With ~12 hub rows and locked CSS, momentum scroll jumps are caused by **JavaScript** reacting to mobile browser chrome (visual viewport / `window.resize`) or global scroll listeners—not list rendering.

**Production:** https://lender-app-zeta.vercel.app — deployment `dpl_726waEYk1wjjKkUsRoWUkDruY9BY` (2026-05-29).

---

## Step 1 — `window.resize` & layout hooks

| Source | Pipeline impact | 24.4Q action |
|--------|-----------------|--------------|
| **`useViewportNavSignals`** (`useResponsiveNavLayout.ts`) | Subscribes to `window.resize`, `visualViewport.resize`, `visualViewport.scroll`, media-query `change` (80ms debounce → `useSyncExternalStore` emit) | **`setPipelineViewportNavSignalsFrozen(true)`** on pipeline routes — snapshot captured once; **no listeners**; snapshot never updates until leave pipeline |
| **`useNarrowViewport`** | `matchMedia('(max-width: 767.98px)')` + `change` | **Frozen** to first paint value on pipeline |
| **`useNavigationBreakpoint`** | `window.resize` + mq `change` | Not used on hub (`PipelinePageClient` uses `useNarrowViewport` + responsive nav layout) |
| **`useMasterScrollCompression`** | `scroll` on `[data-app-main-scroll]` | Already disabled on pipeline surfaces |
| **`MobileChromeController`** | scroll / IO | Frozen on pipeline (24.4L) |
| **`pipelineHubLayoutShiftTracker`** | ResizeObserver on hub list | **Disabled** when `disableHubResizeObserver` |
| **`pipelineScrollDebug` / `pipelineLayoutDebug`** | ResizeObserver when debug globals installed | Forensics only; not auto-mounted in prod shell |

No `useWindowSize` / `useWindowDimensions` / `useBreakpoint` utilities in repo.

---

## Step 2 — Rogue global listeners & smooth scroll

| Finding | Action |
|---------|--------|
| Analytics scroll trackers (Mixpanel, etc.) | **None** in app shell |
| Global scroll managers | **None** beyond nav viewport + disabled master compression |
| File-only pipeline listeners | `ClientMomentumStars`, `PipelineMobileWorkspaceOpsRail`, triage popovers — **file workspace**, not hub list |
| `scroll-behavior: smooth` on `[data-app-main-scroll]` | Pipeline already `auto` via `:has([data-pipeline-page-root])`; **24.4Q** adds `scroll-behavior: auto !important` on mobile pipeline scroll chain (`data-pipeline-scroll-behavior-auto`) |

---

## Step 3 — Console interception

`PipelineProgrammingPurgeMount` patches `window.addEventListener` while on `/pipeline` when `interceptResizeScrollListeners` is true:

```
[ROUTINE INTERCEPTED] A resize listener was attached by: ...
```

Use Safari/Chrome remote devtools during a **fast fling** to see what still registers after 24.4Q freeze.

---

## Flags & DOM

`lender-app/lib/debug/phase24-4Q-programming-purge.ts`:

| Flag | Default |
|------|---------|
| `freezeViewportSignals` | `true` |
| `freezeNarrowViewport` | `true` |
| `disableHubResizeObserver` | `true` |
| `interceptResizeScrollListeners` | `true` |
| `forceScrollBehaviorAuto` | `true` |

**HTML attributes (pipeline routes):**

- `data-pipeline-programming-purge`
- `data-pipeline-scroll-behavior-auto`

**Mount:** `PipelineProgrammingPurgeMount` in `AppChrome.tsx` (with `PipelineChromeDebugMount`).

---

## Verification

1. Hard refresh `/pipeline` on device.
2. Confirm `<html data-pipeline-programming-purge>` and `data-pipeline-scroll-behavior-auto`.
3. Fast momentum scroll — should not trigger layout fingerprint / shell churn from viewport hooks.
4. Optional: filter console for `[ROUTINE INTERCEPTED]` during scroll.

---

## Revert

Set flags in `phase24-4Q-programming-purge.ts` to `false` and redeploy.

---

## Related phases

- **24.4N** — overscroll + content-visibility off  
- **24.4P** — header lock, sticky purge, frozen safe-area  
