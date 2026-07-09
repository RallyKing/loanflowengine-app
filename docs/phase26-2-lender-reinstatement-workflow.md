# Phase 26.2 — Lender reinstatement workflow (Bring Back)

**Date:** 2026-06-03  
**Status:** Shipped (build + Convex prod + Vercel prod)  
**Depends on:** [Phase 26.1 — Lender rejection](./phase26-1-lender-rejection-workflow.md)

## Problem

After Phase 26.1, declined lenders are excluded from Pipeline Hub **Lender View** but remain on the file. Operators need to **reverse** a rejection without deleting timeline history or re-attaching the lender.

## Solution

**`restoreLenderLink`** clears the declined junction state, appends a reinstatement note, and relies on existing hub graph rules (skip only `relationshipType === "declined"`) to show the file under that lender again.

## Backend (`convex/fileLenders.ts`)

### `restoreLenderLink`

**Args:** `fileLenderLinkId` *or* `fileId` + `lenderId`, plus `memberUserKey` / `preferencesAccountId`.

**Actions:**

1. Require existing edge with `relationshipType === "declined"`.
2. Patch junction directly (bypasses `upsertFileLenderEdge` declined lock):
   - `relationshipType` → `"selected"` if that lender is `selectedLenderId`, else `"quoted"` (baseline active).
   - `rejectionReason` → cleared (`undefined`).
3. Insert timeline note:

   `[Lender Reinstated] Lender: {company} - File has been updated and marked active again.`

Rejection notes from 26.1 are **not** deleted.

## Hub projection (no code change required)

`pipelineGraphPreviewLinks.ts` and `lib/pipeline/graphProjection.ts` already omit links only when `relationshipType === "declined"`. Restoring to `quoted` / `selected` re-includes the file in that lender’s column on the next query/subscription refresh.

## Frontend (`PipelineFileWorkspace.tsx`)

When `relationshipType === "declined"`:

- Show **Bring Back** (`variant="outline"`, loading: “Restoring…”).
- Hide **Rejected** action button.
- After success: badge/reason row clears, **Select** re-enabled, **Rejected** button returns.

Calls `api.fileLenders.restoreLenderLink` with `fileId` + `lenderId`.

## Validation

From `lender-app/`:

```bash
npm run build
npm run convex:deploy:prod
npm run deploy:prod
```

**Smoke:** Reject lender → Hub column empty → **Bring Back** → reinstatement note in Notes → Hub column shows file → **Select** works.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_2o7dmozij2VwBAAZu2BuDdSDqhCU`
- **Convex:** https://basic-anaconda-984.convex.cloud
