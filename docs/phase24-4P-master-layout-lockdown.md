# Phase 24.4P — Master Layout, Top Header & Safe Area Lockdown

**Date:** 2026-05-29  
**Context:** ~12 hub files — jump is not virtualization/CPU. User hypothesis: **master shell** (top header, sticky bands, dynamic `env(safe-area-inset-*)`) shifts during fast momentum scroll.

**Production:** https://lender-app-zeta.vercel.app — deployment `dpl_6PRWwXyG4UjBrANZVfX6URgCdkhQ` (2026-05-29).

---

## Step 1 — Top header / App Chrome lockdown

| Finding | Action |
|--------|--------|
| `useMasterScrollCompression` | Already **disabled** on pipeline (`enabled: !isPipelineSurface`). |
| `MasterHeaderShell` | Still applied transform/opacity when shell motion ready. **24.4P:** `layoutLocked` → transform none, opacity 1. |
| SaaS `<header>` | Used `max-md:max-h-14` and scroll-linked border/shadow via `masterCompression`. **24.4P:** `h-16 min-h-16 max-h-16 shrink-0 flex-shrink-0`, no compression-driven classes. |
| Connectivity strip | Opacity tied to compression. **Frozen** on pipeline (`opacity: 1`). |
| `MobileTopNav` | Row height clamp 48–56px. **24.4P:** `layoutLocked` → `h-16` on mobile. |

**Flags:** `PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.lockTopHeader`  
**DOM:** `html[data-pipeline-master-layout-lock]`, `header[data-pipeline-layout-locked="true"]`

---

## Step 2 — `position: sticky` purge (hub)

| Location | Before | After (24.4P) |
|----------|--------|----------------|
| `OperationalOrientationStrip` on hub | `sticky top-0` (default) | `sticky={false}` when `purgeHubSticky` |
| Other `.sticky` under `[data-pipeline-page-root]` | None found in hub TSX | CSS fallback: `.sticky` → `position: relative !important` |

Filter card / batch bar / hierarchy rows: **no sticky** in hub components (batch bar is `fixed`).

---

## Step 3 — Safe area inset freezing

| Surface | Before | After (pipeline) |
|---------|--------|------------------|
| AppChrome main pad | `env(safe-area-inset-bottom)` | `calc(4.25rem + 24px)` (static) |
| `pwaBottomPadding` inline style | `env(safe-area-inset-bottom)` | `calc(gap + 64px + 24px)` |
| `MobileBottomNav` | `env(safe-area-inset-left/right)` + dynamic bottom | CSS `padding-bottom: 1.5rem` (pb-6) |
| `OperationalBatchBar` | `env(safe-area-inset-bottom)` in bottom offset | `calc(4.5rem + 24px)` |

**Flags:** `freezeSafeAreaInsets`  
**DOM:** `html[data-pipeline-safe-area-frozen]`  
**CSS vars:** `--dlc-pipeline-safe-top: 0px`, `--dlc-pipeline-safe-bottom: 24px`

---

## Code touchpoints

| File | Role |
|------|------|
| `lender-app/lib/debug/phase24-4P-master-layout-lockdown.ts` | Feature flags |
| `lender-app/components/debug/PipelineChromeDebugMount.tsx` | HTML attributes on pipeline routes |
| `lender-app/components/AppChrome.tsx` | Header lock, frozen pads |
| `lender-app/components/layout/MasterHeaderShell.tsx` | `layoutLocked` prop |
| `lender-app/components/layout/MobileTopNav.tsx` | Fixed h-16 when locked |
| `lender-app/app/pipeline/PipelinePageClient.tsx` | Orientation strip non-sticky |
| `lender-app/lib/ui/safeArea.ts` | Frozen padding helpers |
| `lender-app/app/globals.css` | Header, sticky purge, nav/batch safe-area overrides |

---

## Verification (device)

1. Hard refresh `/pipeline` on iPhone Safari / Android Chrome.
2. Confirm `<html>` has `data-pipeline-master-layout-lock` and `data-pipeline-safe-area-frozen`.
3. Fast momentum fling — header height should not change; orientation band scrolls with content (not sticky).
4. Optional: `window.__dlcPipelineChromeDebug?.()` — `scrollListeners: 0`, static chrome.

---

## Revert

Set flags in `phase24-4P-master-layout-lockdown.ts` to `false` and redeploy.

---

## Related

- **24.4N** — velocity overscroll + content-visibility off (still active)
- **24.4J–M** — bottom nav DOM lock / neon isolation (unchanged)
