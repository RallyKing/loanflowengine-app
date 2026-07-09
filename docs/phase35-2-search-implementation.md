# Phase 35.2 — Universal search bar implementation (shipped)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior:** `docs/phase35-1-search-optimization-audit.md`

## Summary

Introduced a dedicated high-contrast search styling layer (`opSearchFieldClass`) and reusable **`SearchField`** component, then migrated all **20** audit-listed search/filter text fields. Default **`Input`** / `opInputFieldClass()` unchanged — ledger add-payment and other forms keep standard field styling.

## New assets

### `lib/ui/operationalInputs.ts`

| Export | Purpose |
|--------|---------|
| `opSearchFieldClass({ compact?, className? })` | Grey `bg-dlc-surface-low`, **bold** text + **bold** placeholder, standard height or `compact` (`h-8`) |
| `opSearchOverlayInputClass()` | Bold transparent inner input for overlay rows |
| `OP_SEARCH_OVERLAY_ROW_CLASS` | Bordered grey row wrapper for ⌘K / help search |

### `components/ui/SearchField.tsx`

- Built-in Lucide **Search** icon (`pl-9`)
- `type="search"` + `enterKeyHint="search"`
- Optional **`onClear`** → X button when value non-empty
- Props: `containerClassName`, `inputClassName`, `compact`, forwards ref to `<input>`

## Migrations (by batch)

### Batch A — Pages

| File | Fields |
|------|--------|
| `app/pipeline/PipelinePageClient.tsx` | Hub toolbar + projection search (with `onClear`) |
| `app/tasks/page.tsx` | Toolbar (`compact`) + today-plan pin |
| `app/ledger/page.tsx` | Main toolbar + add-to-ledger picker (`compact`) |
| `app/contacts/page.tsx` | Debounced list search |
| `app/lenders/LendersWorkspaceClient.tsx` | Quick table search |
| `components/events/EventsWorkspaceClient.tsx` | Events list search |

### Batch B — Drawers & overlays

| File | Fields |
|------|--------|
| `components/TaskDrawer.tsx` | Link tasks + link pipeline files |
| `components/PipelineFileWorkspace.tsx` | Attach lender search |
| `components/LenderTable.tsx` | Quick search |
| `components/LenderDrawer.tsx` | Merge-duplicate search |
| `components/pipeline/PipelineHubMobileFilterSheet.tsx` | Mobile filter drawer |
| `components/PipelineFileSharingSection.tsx` | Team member filter |
| `components/GlobalSearchPalette.tsx` | ⌘K query (`opSearchOverlayInputClass` + row wrapper) |
| `components/HelpCenterPanel.tsx` | Help article filter (overlay row) |

### Batch C — Intake

| File | Fields |
|------|--------|
| `components/intake/Dashboard.tsx` | Sheet list filter → `SearchField` |

## QA

- `npm run build` — passed (standard `Input` unchanged; `PipelineFileSharingSection` still uses `Input` for email field)
- Visual: search fields use `bg-dlc-surface-low` + bold typography; non-search inputs remain `bg-background`

## Deploy

- Vercel production `dpl_8Y3kmuNgXikPr3xPuc9Ro1nfLaSu`

Production: https://dlcfunds.vercel.app

## Smoke

1. Pipeline / Tasks / Ledger / Contacts / Lenders — toolbar search is grey + bold.
2. ⌘K global search — same treatment inside command panel header row.
3. Help panel search — grey row + bold placeholder.
4. Ledger → expand row → Add payment Gross/Net — **unchanged** standard input styling.
