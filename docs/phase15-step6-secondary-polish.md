# Phase 15 Step 6 — Secondary Graph Mutability Audit & Projection Polish

**Status:** Complete — awaiting review  
**Date:** 2026-05-21

## Summary

Step 6 extends the Step 5 dual-write/dual-read edge sync pattern to **Lenders**, **Referral Partners**, **Team Members**, and **Tasks**. It also completes mode-aware projection search and strict hierarchy for all secondary focus modes, including a redesigned **Task Focus** (open/completed top-level tasks with attachment badges).

## Root cause — same class of bug as clients

After Step 3 backfill, indexed graph edges existed (`fileLenders`, `fileReferralPartners`, `fileTeamMembers`, `fileTasks`) but legacy mutation paths still only read/wrote the original sources:

| Entity | Legacy source | Indexed edge |
|--------|---------------|--------------|
| Lender | `pipeline.lenders[]` / `selectedLenderId` | `fileLenders` |
| Referral partner | `contactFileLinks` (referral types) | `fileReferralPartners` |
| Team member | `assigneeId`, `sharedWithIds`, `resourceShares` | `fileTeamMembers` |
| Task | `tasks.relatedFileId` | `fileTasks` |

**Failure modes:** remove mutations reported "link not found" when only the indexed edge existed; successful legacy removes left ghost badges in `graphLinks`; projection trees showed stale attachments.

## Fix — `indexedGraphEdgeSync.ts` (Step 6 helpers)

### Lenders (`fileLenders`)

- `attachLenderToFile` / `detachLenderFromFile` — dual-write with `pipeline.lenders[]`
- `syncFileLenderEdgesFromPipeline` — full resync on attach/detach/select
- Wired into `pipeline.ts`: `attachLender`, `detachLender`, `selectLender`

### Referral partners (`fileReferralPartners`)

- `syncFileReferralEdgeFromContactLink` on upsert
- `removeFileReferralEdge` on contact file link remove
- Wired into `contactFileLinks.ts`

### Team members (`fileTeamMembers`)

- `resyncFileTeamEdgesFromPipeline` from assignee, sharedWithIds, and resourceShares
- Wired into `pipeline.ts` patch (assignee/sharedWithIds) and `pipelineFileShares.ts`

### Tasks (`fileTasks`)

- `syncFileTaskEdgeFromTask` on create/update/duplicate/split
- `removeAllFileTaskEdgesForTask` on delete
- Wired into `tasks.ts`

**Safety invariants (all entities):**

- Removes delete the **specific edge only** — never the canonical entity or pipeline file
- Legacy string/array fallbacks handled via dual-read in `pipelineGraphPreviewLinks.ts`
- ACL unchanged — `resourceShares` remains authoritative
- No new subscriptions — single `listTablePreview` architecture preserved

## Dual-read in graph preview (`pipelineGraphPreviewLinks.ts`)

`graphLinks` now merges indexed edges with legacy sources for lenders, referrals, team, and tasks (indexed + legacy deduped). Task links include `entityStatus` for open/completed grouping.

## Mode-aware projection search

Dedicated `projectionSearch` input filters **top-level entities only** per mode (zero additional Convex cost):

| Mode | Search target |
|------|---------------|
| Lender Focus | Top-level lender names |
| Referral Partner Focus | Top-level referral partner names |
| Team Member Focus | Top-level team member names |
| Task Focus | Top-level task titles (open + completed sections) |

## Strict hierarchy enforcement

| Mode | Top level | Expanded / detail |
|------|-----------|-------------------|
| Lender Focus | Lenders only | Expand → linked loan files |
| Referral Partner Focus | Referral partners only | Expand → linked loan files |
| Team Member Focus | Team members only | Expand → linked loan files |
| Task Focus | Tasks only (Open vs Completed) | No file grouping; each row shows clickable file/client/project badges via `PipelineHubTaskFocusBadges` |

## Performance / idle writes

No mutation paths added to idle loops. Hub expansion remains localStorage-only. **5-minute idle write budget unchanged:** `HUB_IDLE_MAX_TOTAL_WRITES = 2` (`lib/convexCostBudget.ts`).

## Production proof

Automated (Joshua org `mx76bxqnc23q76cb99tvrffmy58644pf`):

```bash
cd lender-app
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npx tsx scripts/run-phase15-step6-secondary-polish.ts
npm run deploy:prod
npm run auth:validate
```

Report: `migration-reports/phase15-step6-secondary-polish.json`

### Joshua primary session manual proof (required)

1. Remove a non-selected **Lender** from an existing file — edge deleted; file + lender record remain
2. Add a new **Referral Partner** to the same file
3. **Lender Focus** search — filter a known active lender at top level
4. **Task Focus** — open/completed sections with accurate file badges

## Files changed

| Area | Files |
|------|-------|
| Edge sync | `convex/indexedGraphEdgeSync.ts` |
| Mutations | `convex/pipeline.ts`, `convex/contactFileLinks.ts`, `convex/pipelineFileShares.ts`, `convex/tasks.ts` |
| Dual-read preview | `convex/pipelineGraphPreviewLinks.ts` |
| Projection engine | `lib/pipeline/graphProjection.ts` |
| UI | `components/pipeline/PipelineHubProjectionView.tsx`, `PipelineHubTaskFocusBadges.tsx`, `app/pipeline/PipelinePageClient.tsx` |
| Proof | `convex/operator/indexedGraphSecondaryPolishProofStep15_6.ts`, `scripts/run-phase15-step6-secondary-polish.ts` |

## Stop gate

**Do not begin Phase 16** until this report is reviewed. The relational graph must be airtight, mutable, and visually stable before Task Views / external integrations.
