# Phase 18.8H — Overlay architecture rebuild

**Date:** 2026-05-28  
**Phase stop:** 18.8H (do not start 18.9)

## Architecture (after)

```
body
├── … app providers / AppChrome / page …
└── #dlc-global-overlay-root          ← sole DOM host for operational overlays
    └── [data-destructive-confirm-root]  (fixed, workspace-centered desktop)
        └── [data-destructive-confirm-host]  (520–640px panel)
```

**React ownership:**

```
layout.tsx
  GlobalOverlayProviders          ← OperationalConfirmProvider (outside AppChrome)
    AppChrome
      pipeline / hierarchy rows   ← triggers only (useOperationalConfirm)
```

## Implemented changes

### 1. Global overlay root

- `lib/ui/globalOverlayRoot.ts` — `GLOBAL_OVERLAY_ROOT_ID = dlc-global-overlay-root`
- `app/layout.tsx` — body child `#dlc-global-overlay-root`
- `app/globals.css` — fixed full-viewport host, no flex inheritance

### 2. Portal + debug

- `components/ui/GlobalOverlayPortal.tsx` — `useLayoutEffect` portal into global root
- `components/ui/DestructiveConfirmShell.tsx` — workspace-centered desktop (`measureDestructiveConfirmAnchor`), mobile sheet unchanged
- `lib/ui/confirmOverlayDebug.ts` — `window.__DLC_CONFIRM_DEBUG__` (`inspect`, `mapContainment`, `log`)
- `lib/ui/pipelineContainmentMap.ts` — pipeline scroll/clipping markers

### 3. Provider placement

- `components/GlobalOverlayProviders.tsx` — wraps app in layout (not AppChrome)
- Removed `OperationalConfirmProvider` from `AppChrome.tsx`

### 4. Zero inline pipeline confirms

Migrated to `useOperationalConfirm()` only:

- `HubHierarchyRowActions.tsx` (already provider in 18.8G)
- `HubHierarchyLoanRowActions.tsx`
- `ClientHierarchySettings.tsx`
- `ProjectHierarchySettings.tsx`
- `PipelineFileWorkspace.tsx` (danger zone + header menu)

**No** `{deleteOpen && <OperationalConfirmDialog />}` remains in pipeline tree.

### 5. Action rail (triggers only)

- `RowShell` — fixed `hub-row-action-rail` 9.25rem, `flex-none`
- Buttons are triggers; no overlay JSX in rail

### 6. Desktop UX

- Width: `min(640px, calc(100vw - 2rem))`, `minWidth: min(100%, 520px)`
- Center: main scroll rect center (sidebar-aware), not raw viewport edge
- Footer buttons: `min-w` + `shrink-0`
- Animation: `transform: scale()` (not invalid `scale` property alone)

### 7. Containment diagnostics

- `data-scroll-owner`, `data-clipping-parent`, `data-layer` on pipeline hub shell + page root + AppChrome main

## Validation

From `lender-app/`:

```bash
npm run build
npm run qa:governance
npm run deploy:prod
```

Manual: pipeline client delete → DevTools → `__DLC_CONFIRM_DEBUG__.inspect()` → `isGlobalOverlayRoot: true`, width ≥ 520px.

## Production URL

Deployed via `lender-app` Vercel project → https://lender-app-zeta.vercel.app

(If stakeholders use https://dlcfunds.vercel.app, deploy `loanflowengine` separately — different Vercel project.)
