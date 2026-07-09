# Phase 14 Step 1 — Multi-client relationship foundation

**Status:** Foundation only (schema, backfill, query composition). No hierarchy UI or workflow changes.

## Goal

Extend the normalized hierarchy from **1 client → many projects → many loans** to support **many clients ↔ many projects ↔ many loans**, while keeping Phase 13 ACL and visibility guarantees.

## Schema (additive)

| Table | Purpose |
|-------|---------|
| `projectClients` | Secondary (and mirrored primary) links: `projectId`, `clientId`, `relationshipType`, `sortOrder` |
| `loanClients` | Secondary (and mirrored primary) links: `pipelineId`, `clientId`, `relationshipType`, `sortOrder` |

**Relationship types:** `primary`, `coborrower`, `guarantor`, `entity`, `sponsor`, `partner`, `other`.

**Unique constraint (application-enforced):** one row per `(parentId, clientId)` via `by_project_client` / `by_pipeline_client` indexes.

## Authoritative FKs (unchanged)

- `projects.clientId` — primary project client
- `pipeline.clientId` — primary loan client

Junction tables **extend** associations only; they do not replace or mutate FK authority.

## Backfill

Operator: `operator/pipelineMultiClientFoundationStep14_1`

1. `analyzeMultiClientFoundation` — drift detection; abort if pre-existing drift
2. `executeMultiClientFoundation` — idempotent `primary` rows for every project and every pipeline row with `clientId`
3. `runMultiClientFoundationProof` — Joshua org integrity, zero duplicates, visibility unchanged

Local runner: `lender-app/scripts/run-phase14-step1-multi-client-foundation.ts`

Report: `migration-reports/phase14-step1-multi-client-foundation.json`

## Query composition

| Module | Behavior |
|--------|----------|
| `pipelineHierarchyCompat` | `resolveFileHierarchy` adds `linkedClients`; expanded `loadProjectsForClient` / `loadPipelineFilesForClient` |
| `pipelineHierarchyQueries` | Project/file lists expose `linkedClients` |
| `pipelineHierarchyFilterQueries` | `listFilesInvolvingClient`, `listProjectsInvolvingClient`, `listSharedFilesInvolvingClient` |
| `globalSearchSync` / `globalSearch` | Search blob includes all linked client display names |

## ACL (frozen)

- File ownership and `resourceShares` unchanged
- Relationship links **do not** grant access
- Filter queries return only membership-visible rows

## Validation (shipping)

From `lender-app/`:

```bash
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npm run deploy:prod
npm run auth:validate
```

Optional production proof (requires `DATA_MIGRATION_ADMIN_SECRET`):

```bash
npx tsx scripts/run-phase14-step1-multi-client-foundation.ts
```

## Out of scope (Step 1)

- Hub/board hierarchy UI redesign
- Secondary client editing UI
- ACL inheritance changes
