# Phase 24.4R — Native Document Scroll Unification & PWA Lockdown

**Date:** 2026-05-29  
**Reality check:** Phase 24.4Q muted all resize/scroll-driven React churn; momentum jump **persisted**. Root cause: **nested scroll** (`body { overflow: hidden }` + `#app-main-scroll { overflow-y: auto }`) fighting mobile browser URL bar collapse physics.

**Production:** https://lender-app-zeta.vercel.app — deployment `dpl_Fk7b8FMAnfZEW2GiYecTWJzcYvFU` (2026-05-29).

---

## Step 1 — PWA / standalone meta (root layout)

`lender-app/app/layout.tsx`:

| Mechanism | Value |
|-----------|--------|
| `viewport` export | `viewport-fit=cover`, `maximumScale=1`, `userScalable=false` |
| `metadata.appleWebApp` | `capable: true`, `statusBarStyle: black-translucent` |
| `metadata.other` | `mobile-web-app-capable: yes` |

Next.js emits equivalent `<meta>` tags in `<head>` (no duplicate raw HTML required).

**Note:** Pinch-zoom is capped app-wide for this Track A experiment. Revert `maximumScale` / `userScalable` in `viewport` if accessibility zoom must return.

---

## Step 2 — Destroy nested scroll trap (mobile pipeline hub)

**When:** Mobile (`max-width: 768px`) + `html[data-native-document-scroll="true"]`  
**Routes:** Pipeline hub surfaces (same as 24.4K) — `/pipeline` hub, library, licenses, intake; **not** `/pipeline/[convexFileId]` file workspace.

| Element | Before | After (24.4R) |
|---------|--------|----------------|
| `html`, `body` | `overflow-y: hidden` (app shell) | `overflow-y: auto !important`, `height: auto`, `overscroll-behavior-y: none` |
| `[data-app-shell-root]`, `#app-main-scroll` | Nested scroller | `overflow-y: visible !important`, `height: auto`, `max-height: none` |

**Flag:** `PHASE_24_4R_NATIVE_SCROLL_PWA.enableNativeDocumentScroll`  
**Attr:** `data-native-document-scroll` (set in `PipelineChromeDebugMount`)  
**24.4K:** Disabled (`PHASE_24_4K_NATIVE_SCROLL_TEST = false`); CSS aliases retained for rollback.

---

## Step 3 — Fixed / sticky chrome for document scroll

| Chrome | Rule |
|--------|------|
| `header[data-testid="app-masterpage-chrome"]` | `position: sticky; top: 0` (stays visible while document scrolls) |
| `nav[aria-label="Primary"]` (MobileBottomNav) | `position: fixed; bottom: 0; z-index: 50` (was already `fixed`; z-index boosted) |

Modals/drawers remain portaled to `body` / overlay root — unchanged.

---

## Code touchpoints

| File | Role |
|------|------|
| `lender-app/lib/debug/phase24-4R-native-scroll-pwa.ts` | Flags |
| `lender-app/app/layout.tsx` | PWA viewport + metadata |
| `lender-app/app/globals.css` | Native document scroll CSS block |
| `lender-app/components/debug/PipelineChromeDebugMount.tsx` | Toggle `data-native-document-scroll` |
| `lender-app/lib/platform-framework/virtualization.ts` | Scroll element → `documentElement` when attr set |

---

## Verification (device)

1. Hard refresh `/pipeline` on **iPhone Safari** / **Android Chrome**.
2. Confirm `<html data-native-document-scroll="true">`.
3. Fast momentum fling — URL bar should animate against **document** scroll, not snap nested `#app-main-scroll`.
4. Header remains visible (sticky); bottom nav flush to viewport (`z-index: 50`).
5. Open a **file** route — attr should **clear**; workspace scroll unchanged.

---

## Revert

1. Set `enableNativeDocumentScroll: false` in `phase24-4R-native-scroll-pwa.ts`.
2. Restore `viewport.maximumScale` / `userScalable` in `layout.tsx`.
3. Redeploy.

---

## Related phases

- **24.4Q** — viewport signal freeze (still active on pipeline)  
- **24.4P** — header lock + safe-area freeze  
- **24.4N** — overscroll none on pipeline (complements document scroll)  
