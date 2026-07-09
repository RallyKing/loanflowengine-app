# Phase 15 Step 8 — Primary Entity Integrity & Reassignment Deduplication

**Status:** Complete — awaiting review  
**Date:** 2026-05-25

## Summary

Step 8 fixes a critical hierarchy integrity bug: some loan files accumulated multiple “primary” client edges after reassignment. This made the base hierarchy ambiguous (a file effectively had two “fathers”).

This step:

1. Repairs the reassignment / inheritance mutation paths so they **swap** the primary client cleanly without leaving ghost primaries.
2. Enforces a strict 1:1 rule: a file’s primary client is the `pipeline.clientId` FK, and graph edges must reflect that.
3. Blocks the UI from promoting a primary client on project-linked files (primary is set via Change Project).
4. Adds and runs a production cleanup operator to demote or delete duplicate primaries.

## Root cause

`changePipelineProject` (Phase 15 Step 7) updated `pipeline.clientId` to the new project’s client, then called `ensurePrimaryLoanClientLink` / `syncPrimaryFileClientEdge`. Those helpers **insert or patch the new primary**, but they do not remove or demote any existing primary rows that remain in `loanClients` / `fileClients`.

Result: after moves, the file could retain an old `loanClients` row still marked `primary` (or a `fileClients` edge marked `primary`), creating multiple primary edges.

Additionally, the file UI allowed “Primary” promotion via `promoteLoanClientToPrimary`, letting users create conflicting primaries on project-linked files.

## Fix — strict single-primary enforcement

### Backend: `enforceSinglePrimaryLoanFileClient`

Added to `lender-app/convex/indexedGraphEdgeSync.ts`.

Guarantees for org-scoped files:

- Exactly one primary client: `pipeline.clientId`
- If a reassignment changes the FK primary, the **previous FK primary** edge is removed (not demoted).
- Any other stray “primary” rows are demoted to `coborrower`.
- Ensures both `loanClients` and `fileClients` contain the FK primary marked as `primary`.

### Reassignment fixes

Updated:

- `convex/hierarchyCrudMutations.ts` → `changePipelineProject` now calls `enforceSinglePrimaryLoanFileClient` with `previousPrimaryClientId`.
- `convex/pipelineMultiClientMutations.ts` → `syncLoanClientsFromProject` also calls `enforceSinglePrimaryLoanFileClient` after patching `pipeline.clientId`.

### UI + API hard stop on manual primary promotion

- `convex/pipelineMultiClientMutations.ts` → `promoteLoanClientToPrimary` now throws for project-linked files: primary must be changed via Change Project.
- `components/pipeline/LinkedClientsEditor.tsx` hides the “Primary” promote control for project-linked files and shows “Primary is set by project”.

Primary client removal was already blocked at the mutation layer (`Cannot remove the primary loan client.`); this step ensures users cannot change primary outside the reassignment flow.

## Production cleanup operator

Added: `lender-app/convex/operator/fixDuplicatePrimaryClients.ts`

Behavior:

- Scans org-scoped pipeline files
- Treats `pipeline.clientId` as the authoritative primary
- Removes duplicate primary rows for the FK client
- Demotes any non-FK primary rows in `loanClients` and `fileClients` to `coborrower`
- Ensures the FK primary exists as `primary` in both tables

Script: `lender-app/scripts/run-phase15-step8-primary-integrity.ts`

Report: `migration-reports/phase15-step8-primary-integrity.json`

## Validation

```bash
cd lender-app
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npx tsx scripts/run-phase15-step8-primary-integrity.ts
npm run deploy:prod
npm run auth:validate
```

## Stop gate

**Do not begin Phase 16** until this report is reviewed. Primary parent integrity must be flawless.

