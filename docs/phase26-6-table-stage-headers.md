# Phase 27.2 / Track D — Pipeline table parent stage section headers

**Date:** 2026-05-28  
**Status:** Shipped (build + Vercel prod)  
**Audit:** `docs/phase27-1-stage-grouping-blueprint.md`

## Problem

Pipeline Hub **Table view** → **Loans** projection (`projectionMode === "file"`) showed one uninterrupted flat list. Users could not scan files by funnel parent stage; sub-stages had no visual roll-up to parent headers.

## Solution

Client-side grouping after `fileFlatList`, with sticky horizontal section headers and unchanged **`PipelineFileRowHierarchyStack`** row bodies (Phase 26.5).

### `lib/pipeline/groupPipelineRowsByParentStage.ts`

- **`resolveParentStageId`** — `stageId` → `subStageId.parentStageId` → legacy `status` slug.
- **`groupPipelineRowsByParentStage`** — buckets rows in **`activeStages`** funnel order; **omits empty parents**; **`unassigned`** tail for rows without an active parent.

### `components/pipeline/PipelineHubParentStageHeader.tsx`

- Muted bar: `bg-slate-50/70`, top border, sticky `top-0`.
- Label: `text-xs font-semibold uppercase tracking-wider text-slate-500` + count `({n})`.
- Stage color dot (same cue as board columns).
- **`PipelineHubUnassignedStageHeader`** for the fallback bucket.

### Wiring

| File | Change |
|------|--------|
| `PipelinePageClient.tsx` | `fileFlatGrouped = useMemo(() => group…(fileFlatList, stageIndex))` |
| `PipelineHubProjectionView.tsx` | File mode: section → header → `PipelineHubFileRow` rows |

## Behavior

| Rule | Implementation |
|------|----------------|
| Sub-stage roll-up | Parent from `sub.parentStageId` when needed |
| Empty parent hidden | Section only if `rows.length > 0` |
| Section order | `index.activeStages` by `order` |
| Row order within section | Preserves `fileFlatList` order (post-sort / search) |
| Unassigned | Bottom section when parent missing or archived |

## Validation

From `lender-app/`:

```bash
npm run build
npm run deploy:prod
```

**Smoke:** Pipeline → Table view → **Loans** projection → confirm parent headers with counts; empty stages absent; sub-staged files under correct parent; hierarchy stack still visible without hover.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_9fuWn1gSmSi5y24WvDG8AZRoWeJF`
- **Convex:** unchanged
