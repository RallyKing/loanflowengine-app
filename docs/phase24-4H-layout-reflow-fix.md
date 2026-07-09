# Phase 24.4H — Layout Reflow & Viewport Unit Eradication

**Date:** 2026-05-28  
**Hypothesis:** Mobile browser URL bar collapse/expand recalculates `vh`/`screen` units, causing the AppChrome scroll container to reflow mid-gesture and produce the pipeline hub jump observed in Phases 24.4D–G.

**Prior eliminations (unchanged):** single scroll owner confirmed (24.4G); no rogue JS scroll writes during passive hub scroll; mobile chrome hard-disabled on `/pipeline*` (24.4F); OperationalOrientationStrip, sticky strips, scroll compression ruled out.

---

## Step 1 — Viewport unit audit & replacement

### Patterns searched repo-wide

| Pattern | Pre-patch | Post-patch |
|---------|-----------|------------|
| `100vh` | 1 (`ClientMomentumStars.tsx`) | → `100dvh` |
| `min-h-screen` | Auth pages (duplicate with `min-h-dvh`), `portal/layout.tsx` | → `min-h-dvh` only |
| `h-screen` | None in product TS/CSS (docs only) | N/A |

### Shell hardening (`app/globals.css`)

- **`html`:** kept `height: 100%`; added `min-height: 100dvh` (removed conflicting `min-height: 0` that would cancel dvh).
- **`body`:** kept `height: 100%`; added `min-height: 100dvh` so the document root tracks the **dynamic** viewport when the mobile URL bar animates.

`AppChrome` already uses `h-full` / `min-h-0` flex chain — no `h-screen` or `100vh` in the shell.

### Pipeline-adjacent `vh` → `dvh` (scroll-path hardening)

These surfaces mount on or near the pipeline hub/file routes and could participate in layout during scroll:

| File | Change |
|------|--------|
| `components/PipelineFileWorkspace.tsx` | `50vh` → `50dvh`; inline `18vh` → `18dvh` |
| `components/PipelineDrawerLayoutSettings.tsx` | `50vh` → `50dvh` |
| `components/pipeline/ClientMomentumStars.tsx` | `calc(100vh-24px)` → `calc(100dvh-24px)` |
| `components/pipeline/tasks/TaskTemplateApplyModal.tsx` | `60vh` → `60dvh` |
| `components/pipeline/tasks/triage/TaskTriageLabelManagerSheet.tsx` | `92vh` → `92dvh` |
| `components/PipelineBlockAdminDashboard.tsx` | `50vh` → `50dvh` |
| `app/pipeline/intake/[[...slug]]/LegacyIntakeRedirectClient.tsx` | `30vh` / `40vh` → `dvh` |
| `app/pipeline/library/LibraryDashboardClient.tsx` | `30vh` → `30dvh` |
| `components/GlobalSearchPalette.tsx` (header overlay) | `12vh` / `70vh` → `dvh` |
| `components/UserNotificationsBell.tsx` (header popover) | `60vh` → `60dvh` |

### Intentionally unchanged (non-pipeline / modal-only)

Other `*vh` utilities remain in ledger, tasks, intake editor, attachment preview, etc. They do not participate in passive `/pipeline` hub scroll. Convert in a follow-up if needed.

`#dlc-global-overlay-root` already used `height: 100dvh` before this phase.

---

## Step 2 — Unconstrained asset audit (`/pipeline`)

Searched pipeline route components (`components/pipeline/**`, `Pipeline*.tsx`, `app/pipeline/**`) for `<img>`, `next/image`, and lazy-loaded media.

**Finding:** No raster images or Next `<Image>` on the hub hierarchy path (client/project cards, file rows, avatars). Visuals are Lucide icons with explicit `h-* w-*` (e.g. `h-4 w-4` on chevrons, folder, user icons in `PipelineHubHierarchyView.tsx`). Loading states use `OperationalSkeletonList` / `OperationalSkeletonRow` with fixed `min-h-10` row geometry.

**Action taken:** No image dimension patches required on the hub scroll path. Re-audit if avatars or client logos are added to hierarchy rows.

---

## Verification checklist (manual — post-deploy)

On **production** (`/pipeline`, iPhone Safari + Android Chrome):

1. Fast scroll down — URL bar collapses; list should not jump or rubber-band.
2. Fast scroll up — URL bar expands; same stability.
3. `window.__PIPELINE_CHROME_DEBUG()` — still `mobileFocusEnabled: false`, `scrollListeners: 0`.
4. Optional: `window.__PIPELINE_LAYOUT_DEBUG?.()` — watch for `scrollHeight` / `clientHeight` spikes during passive scroll.

If jump is **gone:** Track A scroll stabilization is complete → unlock **Phase 24.1a Status Engine schema**.

If jump **persists:** next suspects are intrinsic content height changes (font/subpixel), not viewport units — instrument `ResizeObserver` on `[data-app-main-scroll]` children.

---

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_AAAj3bJJBDYHWNW1YWvZKefqTbeH` (2026-05-28)  
**Git SHA (local build):** `b6845c8a601d69492341d31ab6da5ad5c8d6c5b0`
