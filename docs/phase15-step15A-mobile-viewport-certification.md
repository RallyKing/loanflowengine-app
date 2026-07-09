# Phase 15 Step 15A — Mobile viewport stabilization (root cause fix)

**Date:** 2026-05-27  
**Production:** https://dlcfunds.vercel.app  
**Deployment:** `dpl_AU1m8CKDj6mLypXgrnsrdXQf49HN`  
**Evidence:** `migration-reports/phase15-step15A-mobile-viewport-certification.json`

## Goal

Eliminate mobile browser **shrink-to-fit zoom-out** and **horizontal page scroll** without masking layout defects via `maximum-scale=1` / `user-scalable=no`. Pinch zoom remains enabled (`maximumScale: 5`).

## 1. Canonical viewport config

Next.js `export const viewport` in `lender-app/app/layout.tsx`:

| Property | Value |
|----------|--------|
| `width` | `device-width` |
| `initialScale` | `1` |
| `viewportFit` | `cover` |
| `maximumScale` | `5` (pinch allowed) |
| `interactiveWidget` | `resizes-content` |

No duplicate raw `<meta name="viewport">` in `app/head.tsx` (file does not exist; framework-native export only).

## 2. Forensic audit — forced desktop scale sources

| Area | Finding | Action |
|------|---------|--------|
| `html` / `body` | Body already `overflow-x: clip`; html lacked inline lock | `html { max-width: 100%; overflow-x: clip }` |
| `100vw` dropdowns | Scrollbar bleed widens `100vw` past visible viewport | Replaced with `100dvw` / `min(100%, calc(100dvw - 2rem))` |
| Pipeline hub stage chips | `flex-nowrap` on same node as page flex child | Inner `w-max` row inside `w-full overflow-x-auto` scrollport |
| Hub client/project selects | `min-w-[8rem]` × 2 on 320px | `flex-1 min-w-0` below `sm`, fixed min-width on `sm+` |
| Search toolbar row | `flex-1` without `min-w-0` | Added `min-w-0` on search field wrapper |
| `w-screen` | None in app TSX/CSS | — |
| `transform: scale` hacks | Only decorative keyframes + header compression curve | No viewport scale hacks |
| Intake / ledger tables | `min-w-[720px+]` inside intentional inner scroll | Documented as inner scroll, not page width |

**Shells reviewed:** `AppChrome`, `MobileTopNav`, `MasterHeaderShell`, `ResponsiveNavProvider`, `GlobalSearchPalette`, `UserNotificationsBell`, `PipelinePageClient` hub shell, `PipelineHubHierarchyView`, `WorkspaceContentContainer`, `PipelineBoardView`.

## 3. Responsive container hardening

- Flex children: `min-w-0` on hub hierarchy, filter rows, chrome action clusters (existing + augmented).
- Safe root: `html` + `body` overflow-x clip; hub shells `overflow-x-clip`.
- Stage chips: horizontal pan **inside** bounded scrollport on `< md`, wrap on `md+`.
- Dropdowns: width caps use `100dvw` inset, not raw `100vw`.

Breakpoints exercised in Playwright: **320, 375, 390, 414, 768, 1024** (portrait + landscape tablet).

## 4. Mobile static lock

| Requirement | Mechanism |
|-------------|-----------|
| Device width on load | Viewport export + document width assertions |
| No auto zoom-out | `visualViewport.scale ≈ 1` in E2E |
| No sideways **page** scroll | `documentElement.scrollWidth <= clientWidth` |
| No pinch lock | No `user-scalable=no` in meta |

## 5. Playwright certification

**Spec:** `lender-app/tests/e2e/phase15-step15A-mobile-viewport.spec.ts`  
**Helper:** `lender-app/tests/helpers/mobile/viewportOverflow.ts`  
**Run:** `PW_BASE_URL=https://dlcfunds.vercel.app npm run report:phase15-15a-viewport`

| Viewport | Document fit | Notes |
|----------|--------------|-------|
| 320×568 | Pass | `app-main-scroll` checked |
| 375×812 | Pass | Search dialog bounds |
| 390×844 | Pass | Notifications panel bounds |
| 414×896 | Pass | |
| 768×1024 | Pass | Document only; table may scroll inside `<main>` |
| 1024×768 | Pass | |

**Result:** 9 passed, 0 failed (prod, Chromium).

## 6. Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app |
| `npm run auth:validate` | Pass |
| `npm run report:phase15-15a-viewport` | Pass (9/9) |

## Files changed (summary)

- `lender-app/app/globals.css` — html lock, `--dlc-viewport-inline`
- `lender-app/lib/ui/viewportUnits.ts` — shared width class constants
- `lender-app/app/pipeline/PipelinePageClient.tsx` — hub/toolbar overflow
- `lender-app/components/pipeline/PipelineHubHierarchyView.tsx` — shell clip
- Overlay anchors: `IntakeEditor`, `ResponsiveNavProvider`, `UserOnboardingChecklist`, `ContextualQuickTip`, `ProductTourOverlay`
- `lender-app/tests/e2e/phase15-step15A-mobile-viewport.spec.ts`
- `lender-app/scripts/phase15-step15A-viewport-cert-report.mjs`

## STOP

**Do not begin Phase 16** until Joshua reviews prod on a physical iPhone Safari + Android Chrome (pinch zoom, pipeline hub scroll, search palette, notifications).
