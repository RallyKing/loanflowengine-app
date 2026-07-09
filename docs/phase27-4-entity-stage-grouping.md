# Phase 27.4 — Entity-specific parent stage grouping (Lender / Referral / Team)

**Date:** 2026-05-28  
**Status:** Shipped (build + Vercel prod)  
**Audit:** `docs/phase27-3-entity-stage-grouping-blueprint.md`  
**Prerequisite:** Phase 27.2 flat Loans grouping — `docs/phase26-6-table-stage-headers.md`

## Problem

Lender, Referral Partner, and Team Member hub projections listed all files flat under each entity card. Users could not scan deal stage mix per entity without opening files.

## Solution

Reuse **`groupPipelineRowsByParentStage`** inside the shared **`EntitySection`** component so each entity’s `node.loans` are partitioned by parent stage independently.

### Header variants (`PipelineHubParentStageHeader.tsx`)

| Prop | `default` (Loans view) | `nested` (entity cards) |
|------|------------------------|-------------------------|
| Position | `sticky top-0` | Static (scrolls with card) |
| Background | `bg-slate-50/70` | `bg-muted/25`, inset `rounded-md` |
| Typography | `text-slate-500` uppercase | `text-muted-foreground` |
| `aria-level` | 2 | 3 |
| `entityPrefixId` | optional | **required** — scopes DOM id |
| `isFirstInSection` | optional | `border-t-0` on first group (no double line under entity `border-t`) |

DOM id pattern (nested): `pipeline-hub-stage-{entityId}-{parentStageId}`  
Unassigned (nested): `pipeline-hub-stage-unassigned-{entityId}`

### `EntitySection` (`PipelineHubProjectionView.tsx`)

When expanded:

1. `groupPipelineRowsByParentStage(node.loans.map(l => l.row), stageIndex)`
2. For each non-empty parent group → `PipelineHubParentStageHeader` `variant="nested"` + `PipelineHubFileRow` list
3. Optional **Unassigned** tail section
4. Stack badges disabled per entity (`stackTotal={1}`) so stage headers do not break “N of M” rails

### Wiring

| File | Change |
|------|--------|
| `PipelinePageClient.tsx` | `stageIndex={stageIndex}` on `PipelineHubProjectionView` |
| `PipelineHubProjectionView.tsx` | Required `stageIndex` prop; passed to all `EntitySection` instances (lender / referral / team) |

## Behavior

- **Per-entity grouping:** Lender A and Lender B each get their own stage sections; empty parents omitted per entity.
- **Sub-stage roll-up:** Same `resolveParentStageId` as Phase 27.2.
- **Row order:** Stable partition of existing `node.loans` sort (stage or funding sort from graph builders).
- **Referral search:** Filtered `node.loans` subsets group correctly at render time.

## Out of scope

- Client / project hierarchy projections (unchanged)
- Convex / `listTablePreview` (unchanged)

## Validation

From `lender-app/`:

```bash
npm run build
npm run deploy:prod
```

**Smoke:** Pipeline → Table → **Lenders** (or Referrals / Team) → expand an entity → nested stage headers with counts; no duplicate element ids; headers scroll inside card (not sticky over other entities); Phase 26.5 file lines still visible.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_2yJbXDpw4de97XBojMAiFT9mRVc4`
- **Convex:** unchanged
