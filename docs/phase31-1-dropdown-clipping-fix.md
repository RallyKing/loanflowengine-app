# Phase 31.1 — NoteCard dropdown clipping fix

## Symptom

After Phase 30.x added **Edit note** and **Pin note** to the NoteCard ⋯ menu, the dropdown was cut off by cards and hub sections below the note row.

## Root cause

`components/ui/DropdownMenu.tsx` rendered the menu as `position: absolute` inside a `relative` wrapper. Parent hub/workspace shells use `overflow-hidden` on collapsible bodies (`pipelineWorkspaceCollapseInner`, `pipelineWorkspaceCardFrame`), which clips any in-flow absolutely positioned children.

RBAC and NoteCard JSX were fine; the shared menu primitive did not escape the scroll/clip stack.

## Fix

Updated `DropdownMenu` to match the established `SnoozeMenu` pattern:

- Portal menu panel to `document.body` via `createPortal`
- `position: fixed` anchored with `getBoundingClientRect()` on the trigger
- Reposition on scroll (capture) and resize
- Canonical z-index via `layerZIndexStyle("DROPDOWN")` (`--dlc-z-dropdown`, 38)
- Outside-click handler excludes `[data-dropdown-menu-panel]`

NoteCard (`NoteThread.tsx`) unchanged — it already uses this primitive.

## Parent containers checked

- `HubCollapsibleSubsection` → `pipelineWorkspaceCollapseInner` (`overflow-hidden`)
- `pipelineWorkspaceCardFrame` → `overflow-hidden`
- No additional NoteThread-specific overflow overrides required once portaled.

## Deploy

From `lender-app/`: `npm run deploy:prod` (build + Vercel production).

## Verify

On hub client notes or file notes block: open ⋯ on a note with multiple actions — menu fully overlays project lists and adjacent cards without clipping.
