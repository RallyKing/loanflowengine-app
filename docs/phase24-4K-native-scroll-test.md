# Phase 24.4K — Native Window Scroll Delegation Test

**Date:** 2026-05-28  
**Hypothesis:** Mobile scroll jump is caused by Safari/Chrome dynamic toolbar collapse fighting a **locked `body`** + nested `#app-main-scroll` scroller—not app bottom-nav hide (24.4J ruled that out).

**Scope:** Mobile (`max-width: 767px`) on pipeline **hub** routes (`/pipeline`, `/pipeline/library`, etc.) — **excludes** `/pipeline/[fileId]` file workspace (still uses `[data-pipeline-workspace-scroll]`).

---

## What shipped

### Flag

`lender-app/lib/debug/phase24-4K-native-scroll-test.ts` — `PHASE_24_4K_NATIVE_SCROLL_TEST = true`

### HTML attribute

`PipelineChromeDebugMount` sets `html[data-pipeline-native-scroll-test="true"]` when flag + hub pipeline route (uses `resolvePipelineHubNativeScrollTestRoute`).

### CSS (`app/globals.css`)

On mobile with attribute set:

| Target | Override |
|--------|----------|
| `html`, `body` | `overflow-y: auto !important`, `height: auto !important` |
| `body > div` (app wrapper) | `overflow: visible`, `flex: none`, `height: auto` |
| `[data-app-shell-root]` | `overflow: visible`, `height: auto` |
| `#app-main-scroll` / `[data-app-main-scroll]` | `overflow-y: visible !important`, `height: auto !important`, `flex: none` |

Document scrolls as one page; native browser chrome handles toolbar show/hide.

### Path helpers

`isPipelineConvexFileRoute`, `isPipelineHubNativeScrollTestRoute`, `resolvePipelineHubNativeScrollTestRoute` in `lib/navigation/isPipelineSurfaceRoute.ts`.

---

## Device test

1. Open https://lender-app-zeta.vercel.app/pipeline on **iPhone Safari** or **Android Chrome**.
2. Confirm attribute: `document.documentElement.hasAttribute("data-pipeline-native-scroll-test")` → `true`.
3. Fast scroll — page should scroll as a **whole document** (window/body), not an inner pane only.
4. Compare jump vs 24.4J build.

**Pass criteria:** Fast scroll feels smooth; native URL bar animates without violent list skip.

**Fail criteria:** Jump persists → cause is likely in-content layout shift (24.4I tracker), not scroll-container architecture.

**Sticky/fixed:** May misbehave during this test — acceptable per charter.

---

## Revert

Set `PHASE_24_4K_NATIVE_SCROLL_TEST` to `false` in `phase24-4K-native-scroll-test.ts` and redeploy.

---

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_EF5Dga9f4bYxCwW4qnGB3RLvvNiX` (2026-05-28)
