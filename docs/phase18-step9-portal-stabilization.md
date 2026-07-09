# Phase 18.9 — Global overlay portals, z-index resolution & build stabilization

**Date:** 2026-05-28

## Problems addressed

1. **Build failure (18.8H follow-up)** — `setConfirmingDelete` references in `PipelineFileWorkspace` after state removal (fixed in 18.8H; build now clean).
2. **Squished delete confirm (screenshot)** — confirm trapped in hierarchy row width when not portaled or when panel inherited flex constraints.
3. **Title / batch bar stacking** — `OperationalBatchBar` used `TOAST` tier (z-index 60), above `MODAL` (50), so chrome floated over the delete overlay.

## Root causes

| ID | Cause |
|----|--------|
| PF-9A | Inline confirm DOM / portal wrapper with `display: contents` weakened stacking |
| PF-9B | Desktop confirm positioned via row-adjacent anchor instead of viewport grid center |
| PF-9C | Batch bar z-index (`TOAST` = 60) > modal overlay (`MODAL` = 50) |
| PF-9D | Panel width not hard-forced (`min-width` from parent flex could still compress) |

## Structural fixes

### Portal stack

- `#dlc-global-overlay-root` on `document.body` (layout.tsx)
- `GlobalOverlayProviders` → `OperationalConfirmProvider` (outside `AppChrome`)
- `OperationalConfirmOverlayHost` — provider portals pending dialog into global root
- `DestructiveConfirmShell` → `GlobalOverlayPortal` — direct `createPortal` (no wrapper box)
- Hub / workspace deletes: `useOperationalConfirm()` only (no inline `<OperationalConfirmDialog />` in rows)

### Z-index map (after)

| Layer | Token | Value |
|-------|--------|------:|
| Sticky hub orientation | `--dlc-z-header` + 1 | ~21 |
| Batch bar | `--dlc-z-sheet` | 40 |
| Modals (generic) | `--dlc-z-modal` | 50 |
| Command palette | `--dlc-z-command-palette` | 52 |
| Toasts | `--dlc-z-toast` | 60 |
| **Destructive confirm** | `--dlc-z-destructive-confirm` | **65** |

### Desktop panel

- `fixed inset-0 grid place-items-center`
- `w-[min(640px,90vw)] min-w-[min(100%,400px)]` on host — immune to table row width

## Verification

```bash
cd lender-app
npm run build   # exit 0
npm run lint
```

Runtime (production / local):

```js
window.__DLC_CONFIRM_DEBUG__?.inspect()
// mountParent.isGlobalOverlayRoot === true
// mountParent.isRowActionRail === false
// parseFloat(computedWidth) >= 400
```

## Files touched

- `lib/ui/layering.ts`, `app/globals.css`
- `components/ui/GlobalOverlayPortal.tsx`
- `components/ui/DestructiveConfirmShell.tsx`
- `components/ui/OperationalConfirmOverlayHost.tsx`
- `components/ui/OperationalConfirmDialog.tsx`
- `components/ui/OperationalBatchBar.tsx`
- `lib/ui/operationalFeedback.ts`
- `lib/ui/operationalLayers.ts`
