# Phase 18.8G — Pipeline action-rail + overlay escape reconstruction

**Date:** 2026-05-28  
**Phase:** 18.8G (stop here — do not start 18.9)

## Goals

1. Stabilize pipeline hierarchy **right action rail** (fixed width, no shrink, no vertical text stacking).
2. **Remove** delete confirm from row DOM — single overlay via `OperationalConfirmProvider`.
3. Guarantee destructive overlay escapes hierarchy clipping (portal root + viewport centering).
4. Reduce hub toolbar right-edge clipping.

## Changes

### A. Delete ownership — provider only

| File | Change |
|------|--------|
| `HubHierarchyRowActions.tsx` | Client/project delete → `useOperationalConfirm()`; removed inline `OperationalConfirmDialog` |
| `HubHierarchyLoanRowActions.tsx` | Loan delete → same pattern + operational timeout/trace |
| `AppChrome.tsx` | (unchanged) already wraps `OperationalConfirmProvider` |

Row action trees now contain **only** icon buttons + rename modals (`ActionSuiteModal` / `HubModalShell`).

### B. Fixed action rail (`RowShell` + loan rows)

- `RowShell` actions wrapper: `hub-row-action-rail` — `9.25rem` fixed width, `shrink-0 grow-0 flex-none`
- `HubHierarchyLoanRowActions`: matching rail classes on action container
- `ActionSuite`: `flex-nowrap whitespace-nowrap`, full rail width, `justify-end`
- `globals.css`: `.hub-row-action-rail` + `#dlc-destructive-confirm-portal` rules

### C. Row layout rebalance

- Primary: `min-w-0 flex-1 basis-0` (truncates first)
- Meta: `min-w-0 shrink max-w-[min(100%,20rem)]` hidden below `sm`
- Actions: never shrink (fixed rail)

### D. True overlay escape

- `app/layout.tsx`: `<div id="dlc-destructive-confirm-portal" />` at end of `<body>`
- `DestructiveConfirmShell.tsx`: portal to portal root; desktop uses `fixed inset-0 grid place-items-center`; explicit `width` / `minWidth` inline on panel; `data-destructive-confirm-portaled="true"`

### E. Hub toolbar

- `PipelinePageClient.tsx`: export button group `shrink-0 flex-nowrap` (desktop)

## Delete UX certification (expected)

- Confirm opens **once** at app level, centered in viewport
- Full-width panel (`min` 440px desktop)
- Footer actions horizontal, touch-safe
- No content in action column except icons

## Validation

From `lender-app/`:

```bash
npm run build
npm run qa:governance
npm run deploy:prod
```

## Files touched

- `components/pipeline/HubHierarchyRowActions.tsx`
- `components/pipeline/HubHierarchyLoanRowActions.tsx`
- `components/ui/RowShell.tsx`
- `components/ui/ActionSuite.tsx`
- `components/ui/DestructiveConfirmShell.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `app/pipeline/PipelinePageClient.tsx`
- `docs/phase18-step8G-hierarchy-action-rail-forensics.md`
- `migration-reports/phase18-step8G-pipeline-action-rail-reconstruction.json`
