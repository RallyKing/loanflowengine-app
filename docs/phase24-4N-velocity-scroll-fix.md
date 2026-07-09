# Phase 24.4N — Velocity & Async Scroll Hunting

**Date:** 2026-05-28  
**Symptom:** `/pipeline` hub scroll jump returns **only on fast momentum swipes**, not on slow controlled drags — consistent with compositor/JS desync (lazy paint, fixed virtual row heights, delayed scroll handlers, or overscroll chaining).

**Production:** https://lender-app-zeta.vercel.app — deployment `dpl_ByfuheBSbyDTSo3e2WVSnS72HtAY` (2026-05-29).

---

## Step 1 — Virtualization & lazy rendering audit

| Finding | Detail |
|--------|--------|
| **@tanstack/react-virtual** | Implemented in `lender-app/components/pipeline/PipelineHubVirtualizedLists.tsx` with **fixed** `estimateSize` (`densityRowHeightPx` / `CARD_ESTIMATE = 148`). **Not imported anywhere** on the live hub — hierarchy uses full `.map()` renders in `PipelineHubHierarchyView` / `PipelineHubProjectionView`. |
| **react-window / react-virtualized** | Not used in pipeline hub. |
| **Infinite scroll** | No hub “load more on approach to bottom” listener found on `/pipeline`. |

**Action taken**

- `PHASE_24_4N_VELOCITY_SCROLL_FIX.hubVirtualizationDisabled = true` — virtualized hub components throw if wired without `measureElement` and dynamic sizing.
- **24.4I `content-visibility: auto`** on hub rows (`globals.css` + `data-pipeline-hub-layout-contain`) — **disabled** (`layoutContainment: false` + `disableHubLayoutContainment`). This is the closest in-repo analogue to dynamic-height virtualization: fast scroll forces intrinsic-size guesses (`contain-intrinsic-size: 0 120px` etc.) and can shift scroll position when rows paint in.

---

## Step 2 — Debounced / async scroll listeners

| Source | Pipeline hub impact |
|--------|---------------------|
| `useMasterScrollCompression` | **Off** on pipeline surfaces (`AppChrome`: `enabled: !isPipelineSurface`). Uses rAF lerp on `[data-app-main-scroll]` — not active on hub. |
| `MobileChromeController` | **Frozen** on pipeline (`pipelineRouteFrozen` / 24.4L DOM lock): no scroll listener, no 48ms IO debounce compact chrome. |
| `PipelinePageClient` | No `onScroll` handlers; `setTimeout` used for focus/scrollIntoView and copy feedback only. |
| `ClientMomentumStars` / file workspace rails | Scroll listeners on **file** workspace / popovers — not hub list. |
| `pipelineHubLayoutShiftTracker` | ResizeObserver **logging only** — does not mutate layout or scroll position. |

**Action taken:** No additional hub scroll listeners added; existing pipeline freezes left in place.

---

## Step 3 — Overscroll & rubber-banding

| Before | Issue |
|--------|--------|
| `[data-app-main-scroll]` | `overscroll-behavior: contain` (global) |
| **24.4K native scroll test** (`PHASE_24_4K_NATIVE_SCROLL_TEST = true`) | Mobile hub unlocked `html`/`body` `overflow-y: auto` and set main to `overscroll-behavior: auto` — **dual scroll chain** risk during momentum. |

**Action taken**

- `PHASE_24_4N_VELOCITY_SCROLL_FIX.revertNativeScrollTest = true` — 24.4K attribute no longer applied when 24.4N is on (`PipelineChromeDebugMount`).
- `html[data-pipeline-velocity-overscroll-none="true"]` — `overscroll-behavior-y: none` on `html`, `body`, `body[data-shell="app"]`, `#app-main-scroll`, `[data-app-main-scroll]` for pipeline surfaces.

---

## Code touchpoints

| File | Change |
|------|--------|
| `lender-app/lib/debug/phase24-4N-velocity-scroll-fix.ts` | Phase flags |
| `lender-app/lib/debug/phase24-4I-hub-stabilization.ts` | `layoutContainment: false` |
| `lender-app/components/debug/PipelineChromeDebugMount.tsx` | Velocity overscroll attr; gate 24.4K |
| `lender-app/app/pipeline/PipelinePageClient.tsx` | Respect 24.4N for layout-contain attr |
| `lender-app/app/globals.css` | 24.4N overscroll-y none block |
| `lender-app/components/pipeline/PipelineHubVirtualizedLists.tsx` | Guard if ever wired |
| `lender-app/tests/mobile/scroll/phase5-mobile-native.spec.ts` | Accept `none` or `contain` on pipeline main |

---

## Verification (device)

1. Hard refresh production `/pipeline` on **iPhone Safari** and **Android Chrome**.
2. **Fast fling** through hub hierarchy — compare to slow drag.
3. Confirm `document.documentElement` has `data-pipeline-velocity-overscroll-none` and **does not** have `data-pipeline-native-scroll-test` on mobile hub.
4. Optional: `window.__dlcPipelineChromeDebug?.()` — `scrollListeners: 0`, `mobileFocusEnabled: false`.

---

## Revert / tune

Edit `PHASE_24_4N_VELOCITY_SCROLL_FIX` in `phase24-4N-velocity-scroll-fix.ts`:

- Re-enable 24.4K: `revertNativeScrollTest: false`
- Re-test lazy rows: `disableHubLayoutContainment: false` and `layoutContainment: true` in 24.4I
- Looser overscroll: `velocityOverscrollNone: false`

---

## Related phases

- **24.4I** — layout containment + shift tracker (containment off for 24.4N)
- **24.4K** — native window scroll test (reverted while 24.4N active)
- **24.4J–M** — bottom nav lock / DOM mount / neon isolation (unchanged)
