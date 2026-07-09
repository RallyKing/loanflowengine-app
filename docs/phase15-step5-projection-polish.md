# Phase 15 Step 5 — Projection UX Polish & Edge Mutability Repair

**Status:** Complete — awaiting review  
**Date:** 2026-05-21

## Summary

Step 5 repairs client/file edge mutations after the Phase 15 indexed graph backfill, adds mode-aware top-level projection search, and enforces strict projection hierarchy in the Pipeline Hub.

## Root cause — client removal failure

After Step 3 backfill, `fileClients` edges existed for many files (including clients propagated from `projectClients`) but loan client mutations in `pipelineMultiClientMutations.ts` only read/wrote `loanClients`.

**Failure modes:**

1. **Remove:** `removeLoanClientLink` looked up `loanClients` only → `"Client link not found"` when the client existed only on `fileClients`.
2. **Ghost links:** Remove succeeded on `loanClients` but left `fileClients` → hub `graphLinks` and projection badges still showed the removed client.
3. **Editor blind spot:** `resolveLoanLinkedClients` ignored `fileClients` → backfill-only links were invisible or unremovable in `LinkedClientsEditor`.

## Fix — dual-write edge sync (`indexedGraphEdgeSync.ts`)

New helpers keep indexed graph edges aligned with legacy junction mutations:

| Operation | `loanClients` | `fileClients` |
|-----------|---------------|---------------|
| `addLoanClientLink` | insert | upsert |
| `removeLoanClientLink` | delete if present | delete if present |
| `updateLoanClientLink` | patch | patch |
| `reorderLoanClientLinks` | patch sort | patch sort |
| `promoteLoanClientToPrimary` | primary sync | primary sync |
| `syncLoanClientsFromProject` | insert missing | upsert missing |
| `ensurePrimaryLoanClientLink` | primary sync | primary sync |

**Safety invariants preserved:**

- Never deletes the canonical `clients` record
- Never deletes/orphans the `pipeline` file row
- Never clears `pipeline.clientId` on remove (primary client still protected)
- ACL unchanged — `resourceShares` remains authoritative

`resolveLoanLinkedClients` now dual-reads `loanClients` + `fileClients` (loan junction wins on conflict) so the editor shows all removable links.

## Mode-aware projection search

Dedicated input above projection views (`data-testid="pipeline-projection-search"`):

- **Client Focus** — filters top-level client nodes only
- **Project Focus** — filters top-level project nodes only
- **Loan File Focus** — filters flat file rows (name + linked client/project labels)

Implemented client-side via `useMemo` on already-subscribed `listTablePreview` rows — **zero additional Convex reads/writes**.

Global hub search (`search` state) reverted to row `searchText` + capital stack haystack; it no longer applies projection-mode haystack filtering.

## Strict hierarchy enforcement

| Mode | Top level | Expanded |
|------|-----------|----------|
| Client Focus | Clients only | Projects + files (`PipelineHubHierarchyView`) |
| Project Focus | Projects only | Associated clients section + loan files |
| File Focus | Flat deduped files | No expansion; clickable client/project badges only |

File Focus uses `PipelineHubFileFocusBadges` — badges link to `/pipeline?hubMode=…&hubClient|hubProject=…`.

## Production proof

Automated (Joshua org `mx76bxqnc23q76cb99tvrffmy58644pf`):

```bash
cd lender-app
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npx tsx scripts/run-phase15-step5-projection-polish.ts
npm run deploy:prod
npm run auth:validate
```

Report: `migration-reports/phase15-step5-projection-polish.json`

### Manual verification (Joshua session)

- [ ] Remove secondary client from file → edge gone from hub badges; file + client records intact
- [ ] Add different client to same file → both junctions + `fileClients` synced
- [ ] Client mode search "Smith" → only matching clients at top level
- [ ] Project mode → projects only at top level; expand shows clients + files
- [ ] File mode → flat files with accurate clickable relationship badges

## Files changed

- `convex/indexedGraphEdgeSync.ts` (new)
- `convex/pipelineMultiClientMutations.ts`
- `convex/pipelineMultiClientLinks.ts`
- `convex/operator/indexedGraphProjectionPolishProofStep15_5.ts` (new)
- `lib/pipeline/graphProjection.ts`
- `components/pipeline/PipelineHubFileFocusBadges.tsx` (new)
- `components/pipeline/PipelineHubFileRow.tsx`
- `components/pipeline/PipelineHubProjectionView.tsx`
- `app/pipeline/PipelinePageClient.tsx`
- `scripts/run-phase15-step5-projection-polish.ts` (new)

## STOP

No further features (task views, external integrations) until user confirms the mutation bug is resolved in production.
