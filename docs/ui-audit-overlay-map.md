# UI Audit — Overlay & Layering Map (Phase 17.0)

**Mode:** READ-ONLY forensic inventory  
**Date:** 2026-05-27  
**Canonical targets:** `lender-app/lib/ui/layering.ts`, `lender-app/lib/ui/layerTokens.ts`, `lender-app/lib/platform-framework/overlayStack.ts`

## Executive summary

The codebase runs **three parallel z-index vocabularies** (`Z_LAYER`, `OVERLAY_Z_BASE`, `SHELL_Z`) plus **legacy ad-hoc** `z-30` / `z-40` / `z-50` classes. Newer surfaces (command palette, portal dropdowns, hub modals) follow `layerZIndexStyle`; legacy modals and several intake/share flows do not. **Highest conflict severity:** Help Center (z 100–101) vs inspectors (z 30) vs command palette (52) vs product tour (62–64).

## Z-index authority map

| System | Location | Range / tiers | Adoption |
|--------|----------|---------------|----------|
| `Z_LAYER` | `lib/ui/layering.ts` | 20–60 (HEADER→TOAST) | Partial — SnoozeMenu, GlobalSearchPalette, EventDetail share, PortalOverlayPanel |
| `OVERLAY_Z_BASE` | `lib/platform-framework/overlayStack.ts` | 35–60 + stack depth | Documented; `RecordInspectorShell` **not migrated** |
| `SHELL_Z` | `lib/ui/layerTokens.ts` | 20–101 (help, tour break stack) | AppChrome shell, HelpCenter, ProductTour |
| Ad-hoc Tailwind | Many TSX | `z-10`, `z-30`, `z-40`, `z-50`, `z-[calc(...)]` | Widespread legacy |

## Overlay inventory

| Surface | Component path | Layering strategy | Portal | Backdrop | Severity | Normalization path |
|---------|----------------|-------------------|--------|----------|----------|-------------------|
| **App shell sidebar scrim** | `components/AppChrome.tsx` | `fixed inset-0 bg-black/50` md:hidden | No | Opaque black/50 | Medium | `overlayScrimClass()` + `SHELL_Z.overlay` |
| **Global search** | `components/GlobalSearchPalette.tsx` | `layerZIndexStyle("COMMAND_PALETTE")` + scrim blur | No (in-tree) | `overlayScrimClass` | Low | Keep; reference implementation |
| **Help center** | `components/HelpCenterPanel.tsx` | `shellZIndexStyle("helpCenterBackdrop"=100)` | No | `bg-black/40` blur | **Critical** | Fold into `Z_LAYER` or cap below TOAST + stack discipline |
| **Product tour** | `components/ProductTourOverlay.tsx` | `SHELL_Z` 62–64 | `fixed inset-0` | Custom | High | Align to `TOAST+1` tier with stack API |
| **Command palette vs tour** | Above pair | Tour > palette | — | — | High | Single product-overlay registrar |
| **Record inspector** (task/lender/confirm) | `components/RecordInspectorShell.tsx` | **`z-30` fixed** + scrim `bg-dlc-scrim` | No | Blur scrim | **Critical** | Migrate to `OVERLAY_Z_BASE.inspector` (45) + `layerZIndexStyle` |
| **Task drawer** | `components/TaskDrawer.tsx` | Wraps `RecordInspectorShell` | — | — | Critical | Same as inspector |
| **Lender drawer** | `components/LenderDrawer.tsx` | `RecordInspectorShell` | — | — | Critical | Same |
| **SideSheet alias** | `components/SideSheet.tsx` | Re-export inspector | — | — | — | — |
| **M3 confirm sheet** | `components/m3/ConfirmActionSheet.tsx` | `RecordInspectorShell` | — | — | Medium | Use modal tier or shared confirm shell |
| **Pipeline mobile Vaul** | `components/PipelineWorkspaceMobileVaulFrame.tsx` | Vaul `Drawer.Root` top sheet | Vaul portal | Vaul overlay | High | Document stack vs inspector; keep drag-lock |
| **Pipeline hub filter sheet** | `components/pipeline/PipelineHubMobileFilterSheet.tsx` | `fixed inset-0` + `bg-dlc-scrim/80` | No | Blur scrim | Medium | `layerZIndexClass("MODAL")` |
| **Hub modal shell** | `components/ui/hubRowActionPrimitives.tsx` | `layerZIndexClass("MODAL")` + `overlaySurfaceClass("modal-panel")` | No | Click-outside | Low | Reference for hub actions |
| **New file dialog** | `components/NewPipelineFileDialog.tsx` | `fixed inset-0` + `bg-black/30` blur | No | Legacy | Medium | HubModalShell pattern |
| **Hierarchy create dialog** | `components/NewPipelineHierarchyCreateDialog.tsx` | `fixed inset-0` + `bg-black/40` | No | Legacy | Medium | Same |
| **Mobile bottom nav overflow** | `components/MobileBottomNav.tsx` | `fixed inset-0` + `bg-black/40` | No | Legacy | Medium | `SHELL_Z.bottomNav` + stack |
| **Responsive nav sheet** | `components/navigation/ResponsiveNavProvider.tsx` | `fixed inset-0` + `bg-black/40` | No | Legacy | Medium | Sheet tier |
| **Pipeline stages mobile bar** | `components/settings/PipelineStagesManager.tsx` | `z-[calc(var(--shell-overlay-z,50)+2)]` | No | backdrop-blur | High | CSS var dependency — document in shell |
| **Snooze menu** | `components/SnoozeMenu.tsx` | `PortalOverlayPanel` + `DROPDOWN` | **Yes** (`createPortal`) | N/A (menu) | Low | Canonical dropdown |
| **Notifications inbox** | `components/UserNotificationsBell.tsx` | `PortalOverlayPanel` + opaque `overlaySurfaceClass` | **Yes** | No full-screen | Low | Canonical |
| **Intake field pickers** | `components/intake/IntakeEditor.tsx` | `z-[var(--dlc-z-dropdown)]` absolute + scroll | Partial | Opaque panel | Medium | Standardize on `PortalOverlayPanel` |
| **Client momentum popover** | `components/pipeline/ClientMomentumStars.tsx` | `fixed inset-0` scrim + `dlc-surface-overlay` panel | No | Transition opacity | Medium | POPOVER tier + portal |
| **Tooltip** | `components/ui/Tooltip.tsx` | Positioned; check z | — | — | Low | `Z_LAYER.POPOVER` |
| **Attachment preview** | `components/AttachmentPreviewDialog.tsx` | **`z-50`** legacy | No | `bg-black/50` | High | MODAL tier |
| **Intake dashboard modal** | `components/intake/Dashboard.tsx` | **`z-50`** legacy | No | blur | High | MODAL tier |
| **Share manager** | `components/intake/ShareManager.tsx` | **`z-40`** + safe-area | No | blur | High | Sheet tier + safe-area helper |
| **Onboarding checklist** | `components/UserOnboardingChecklist.tsx` | `fixed inset-0` pointer-events-none + card | No | Translucent card | Medium | TOAST/navAuxiliary tier |
| **Event share drawer** | `components/events/EventDetailClient.tsx` | `POPOVER` scrim + `MODAL` panel (mobile) | No | `bg-dlc-scrim/50` | Medium | Align with `RecordInspectorShell` width tokens |
| **Event toast** | `components/events/EventToast.tsx` | `TOAST` | No | Opaque | Low | OK |
| **Pipeline file sharing** | `components/PipelineFileSharingSection.tsx` | In-workspace panel (not overlay) | — | — | Low | UX consolidation with EventSharingPanel |
| **Select / context menus** | Radix via primitives + inline `<select>` | Mixed | Partial | — | Medium | Inventory per-route in 17.1 |

## Transparency & dark-mode risks

| Risk | Examples | Notes |
|------|----------|-------|
| **Translucent panels without isolate** | `bg-background/95 backdrop-blur` sticky headers | Common; acceptable for chrome if opaque fallback `[background-color:rgb(var(--bg))]` |
| **Scrim blur on menus** | ShareManager, Dashboard | Blur on full viewport — performance + bleed on SaaS dark |
| **Missing opaque bridge** | Some `bg-muted/50` table headers | Intake sections table header |
| **Nested overlay** | Vaul sheet + RecordInspector + Command palette | `useWorkspaceSheetDragLock` mitigates; still visually stacks at wrong z |

## Nested overlay conflict matrix

```
[User action] Open inspector on pipeline file (mobile)
  → Vaul sheet (snap) + RecordInspector z-30
  → Risk: inspector UNDER bottom nav (30) / hub chrome

[User action] Open Help while search open
  → Help z-100 over command palette z-52 — OK visually but breaks tier mental model

[User action] Product tour during modal
  → Tour 63+ over modal 50 — may block dismiss
```

## Recommended normalization (Phase 17.1 — not implemented here)

1. **Single registry** — extend `layering.ts` with `HELP`, `TOUR`, `INSPECTOR` or map `SHELL_Z` → `Z_LAYER` numerically.
2. **Migrate `RecordInspectorShell`** off `z-30` to inspector tier (45) with stack depth.
3. **Eliminate `z-50`/`z-40`** in intake/attachment flows.
4. **Mandatory portal** for anchored menus (IntakeEditor long tail).
5. **Document stack** when opening inspector over Vaul (existing drag-lock + z bump).

## Files to touch first (highest severity)

1. `components/RecordInspectorShell.tsx`
2. `components/HelpCenterPanel.tsx` + `lib/ui/layerTokens.ts`
3. `components/intake/Dashboard.tsx`, `AttachmentPreviewDialog.tsx`, `intake/ShareManager.tsx`
4. `components/ProductTourOverlay.tsx`
5. `components/AppChrome.tsx` (mobile scrim)
