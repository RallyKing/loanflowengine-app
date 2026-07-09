# Phase 25.13 — Pipeline hub filter z-index realignment

**Date:** 2026-05-28  
**Scope:** UI stacking only (`PipelinePageClient.tsx`, layout debug selector). No schema, ACL, or board logic changes.  
**Prerequisite:** [phase25-11-pipeline-overlay-audit.md](./phase25-11-pipeline-overlay-audit.md)

## Symptom

On `/pipeline` (board view, desktop/tablet):

- Filter **dropdowns** and `<details>` menus could paint **under** kanban columns when menus extended into the board region.
- The hub filter **toolbar band** (`z-10`) could paint **over** column headers when geometry intersected (scroll/layout edge cases), blocking clicks and readability.

## Root cause (dual stacking failure)

1. **Dropdowns under board:** Filter UI and board are **sibling** subtrees under the hub wrapper. Without a raised stacking context on the filter card, later siblings (board) win paint order for overlapping pixels—even when menus use `absolute z-30` inside the filter row.
2. **Toolbar over headers:** `relative z-10` on the entire filter band elevated the **opaque** `bg-background/95 backdrop-blur` rectangle above board headers (`z-index: auto`) wherever Y coordinates overlapped.

## Fix

| Layer | Element | Change |
|-------|---------|--------|
| Filter chrome | Filter card wrapper (`.rounded-xl` hub card) | `relative z-20 isolate` — hub controls stack above board content |
| Filter toolbar | Inner band (`data-pipeline-hub-filter-toolbar`) | **Removed `z-10`**; solid `bg-background` (no semi-transparent blur bleed) |
| Board | `[data-testid="pipeline-board-scroll"]` + `OperationalContentReveal` | `relative z-0` — explicit lower layer |
| Menus | `<details>` panels + export menu | `operationalZIndexClass("DROPDOWN")` + `operationalOverlayDropdownClass()` (opaque `bg-background`, shadow, `--dlc-z-dropdown` = 38) |

**Design tokens:** Dropdown z-index uses canonical `--dlc-z-dropdown` (38), not ad-hoc `z-50`, so hub menus stay below modals/toasts per `lib/ui/layering.ts`.

## Files touched

- `lender-app/app/pipeline/PipelinePageClient.tsx`
- `lender-app/lib/debug/pipelineLayoutDebug.ts` — probe selector → `[data-pipeline-hub-filter-toolbar]`

## Verification

- `npm run build` from `lender-app/`
- Production: `npm run deploy:prod` → https://dlcfunds.vercel.app
- Manual: Board view at 1024×768 — open **Saved views**, **More** (mobile), **Export**, hub **DropdownMenu**; menus must float over column headers/cards with solid backgrounds. Column headers remain readable and clickable at scroll top.

## Out of scope

- Sticky `OperationalOrientationStrip` behavior (still governed by Phase 24.4P lockdown + `purgeHubSticky`).
- Mobile fixed filter sheet (`OperationalFilterDrawer`) — already uses `layerZIndexStyle("SHEET")`.
