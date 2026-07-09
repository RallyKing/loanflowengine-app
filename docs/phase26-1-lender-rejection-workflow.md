# Phase 26.1 — Lender rejection workflow & pipeline exclusion

**Date:** 2026-05-28  
**Status:** Shipped (build + Convex prod + Vercel prod)

## Problem

Linking a lender to a pipeline file surfaces that file under the lender’s column in Pipeline Hub **Lender View**. Declining a deal previously required **detach**, which removed history and duplicate-guard visibility.

## Solution

Use the existing **`fileLenders`** junction (`relationshipType: "declined"`) plus optional **`rejectionReason`**. The lender remains on `pipeline.lenders[]` and in the file workspace; only the **hub lender-column projection** excludes that file↔lender edge.

## Data model

| Store | Field | Meaning |
|-------|--------|---------|
| `fileLenders` | `relationshipType: "declined"` | Rejected for this file |
| `fileLenders` | `rejectionReason` | Operator-entered reason (Phase 26.1) |
| `pipeline` | `lenders[]` | Unchanged — lender stays linked |
| `pipelineFileNotes` | `content` | Auto note on reject |

**Note:** Spec referenced `contactLenderLinks`; production uses **`fileLenders`** + `pipeline.lenders[]` (Track C CRM graph).

## Backend

### `convex/fileLenders.ts`

- **`listByFile`** — junction read model for workspace UI.
- **`rejectLenderLink`** — sets `declined`, stores `rejectionReason`, clears `selectedLenderId` when the rejected lender was chosen, inserts note:

  `[Rejection Notice] Lender: {company} - Reason: {reason}`

### Hub exclusion (per-lender only)

- **`convex/pipelineGraphPreviewLinks.ts`** — skips `relationshipType === "declined"` when building lender graph links.
- **`lib/pipeline/graphProjection.ts`** — same filter in client projection index.

Other lenders on the same file are unaffected.

### Sync guards

- **`convex/indexedGraphEdgeSync.ts`** — does not downgrade `declined` → `quoted`/`selected`; `syncFileLenderEdgesFromPipeline` preserves declined edges.

### Select guard

- **`convex/pipeline.ts` `selectLender`** — throws if edge is `declined`.

## Frontend

**`components/PipelineFileWorkspace.tsx`**

- Queries `api.fileLenders.listByFile`.
- **Rejected** (destructive) button next to **Select** opens `ActionSuiteModal` with reason textarea.
- **Confirm rejection** calls `api.fileLenders.rejectLenderLink`.
- Declined rows: **Rejected** badge, inline reason, disabled **Select**, no repeat reject button.

## Validation

From `lender-app/`:

```bash
npm run build
npm run convex:deploy:prod
npm run deploy:prod
```

Manual smoke: open a file → reject one lender with a reason → verify note in Notes → Pipeline Hub Lender View: file absent under that lender only; still visible on file and under other lenders.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_4XDBWca6XQbQ5bx3xKFmc89PiMyG`
- **Convex:** https://basic-anaconda-984.convex.cloud (`npm run convex:deploy:prod`)
