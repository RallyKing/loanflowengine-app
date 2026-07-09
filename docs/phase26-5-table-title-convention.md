# Phase 26.5 — Pipeline table / hub row title naming convention (always visible)

**Date:** 2026-05-28  
**Status:** Shipped (build + Vercel prod)

## Problem

After Phase 26.3–26.4, hierarchy fields (`clientDisplayName`, `projectDisplayTitle`, `primaryLender`) existed on `listTablePreview` rows, but the **default Pipeline Hub file list** still showed only `fileName` (often a generic product label like “Line of Credit”). Client, project, and lender context appeared mainly via **tooltips** (`RowShellTitle`) or mobile `parentPathLabel`, so users had to hover or infer ownership.

## Solution

Introduce a shared, **always-visible** three-line stack and wire it everywhere pipeline file rows render.

### Shared helpers

**`lender-app/lib/pipeline/pipelineFileRowHierarchyLabels.ts`**

- `pipelineFileRowClientLabel` — server fields + linked/graph/source fallbacks (same as 26.4).
- `pipelineFileRowProjectLabel` — resolves project title; falls back to **`General Project`** when none.
- `pipelineFileRowPrimaryTitle` — `"{fileTitle} · {client}"` when client exists.

### Shared UI

**`lender-app/components/pipeline/PipelineFileRowHierarchyStack.tsx`**

| Line | Content | Styles |
|------|---------|--------|
| 1 | File title · client (or combined static string) | `text-sm font-medium text-slate-900` (dark: `text-slate-100`) |
| 2 | Project (always shown) | `text-xs text-slate-500` |
| 3 | Primary lender + star when chosen | `text-[11px] uppercase tracking-wide`; selected uses `text-primary/85` + filled `Star` |

No `group-hover`, `opacity-0`, or hover-only blocks on this stack.

### Consumers

| Component | Change |
|-----------|--------|
| `PipelineTableRow.tsx` | First column uses stack; inline-editable file name via `fileTitleSlot`; archived/snooze chips below stack |
| `PipelineHubFileRow.tsx` | Replaces `RowShellTitle` + `parentPathLabel` duplicate path |
| `PipelineHubHierarchyView.tsx` (`LoanStackRow`) | Mobile + desktop open buttons use stack |
| `PipelineHubMobileFileCard.tsx` | Card title area uses stack |

### Virtualizer row height

**`lib/platform-framework/density.ts`** — `densityRowHeightPx` increased so three-line stacks are not clipped (comfortable **72px**, compact **60px**, analyst/dense **52px**).

## Data dependency

No Convex changes in this phase. Rows must already expose Phase 26.3–26.4 fields from `listTablePreview` (`clientDisplayName`, `projectDisplayTitle`, `primaryLender`).

## Validation

From `lender-app/`:

```bash
npm run build
npm run deploy:prod
```

**Smoke:** Pipeline → hub table/hierarchy file list and classic table (if enabled) → every row shows **Line of Credit · {Client}**, project line (or “General Project”), lender line without hover. Chosen lender shows star + primary tint.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_8angMQ6xrVwExQWenjDjvUkMG2qr`
- **Convex:** unchanged — https://basic-anaconda-984.convex.cloud
