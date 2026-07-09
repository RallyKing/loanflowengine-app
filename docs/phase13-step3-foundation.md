# Phase 13.3 Step 2 — Hierarchical client/project/loan foundation

**Status:** Foundation shipped (additive schema + compat + queries/mutations; **no data backfill**, **no hub/board/workspace UI changes**)  
**Date:** 2026-05-21  
**Evidence:** `migration-reports/phase13-step3-foundation.json`

## Executive summary

Introduced normalized **Client → Project → Loan File** tables and nullable FKs on `pipeline`, while **preserving** legacy identity in `dealData.clientName` / `dealData.projectName`. All **12** production loan files in the canonical org continue to load with **legacy virtual** hierarchy resolution, **unchanged** visibility, ownership, and file-level ACL.

---

## 1. Schema (additive only)

### `clients`

| Field | Purpose |
|-------|---------|
| `organizationId` | Tenant scope |
| `ownerUserId` / `ownerUserKey` | Row owner (same pattern as pipeline) |
| `displayName` / `normalizedName` | Identity + dedupe key |
| `primaryContactName/Email/Phone`, `companyName` | Contact metadata |
| `inheritOrgSharingDefaults` | Hook for future org-wide share inheritance |
| `createdAt` / `updatedAt` | Audit |

**Indexes:** `by_organization`, `by_org_normalized`, `by_org_owner`

### `projects`

| Field | Purpose |
|-------|---------|
| `clientId` | Parent client FK |
| `organizationId` | Tenant scope |
| `ownerUserId` / `ownerUserKey` | Owner (inherits client ACL when unset at share layer) |
| `title` / `normalizedTitle` | Project identity |
| `purpose`, `status`, `targetFunding`, `completionPercent` | Project metadata |
| `createdAt` / `updatedAt` | Audit |

**Indexes:** `by_client`, `by_organization`, `by_org_client`, `by_org_owner`

### `pipeline` (loan file)

| Addition | Purpose |
|----------|---------|
| `clientId` (optional) | FK to `clients` |
| `projectId` (optional) | FK to `projects` |

**Indexes:** `by_clientId`, `by_projectId`, `by_org_client`, `by_org_project`

**Unchanged:** Full `dealData` intake shape including `clientName` / `projectName`.

### `resourceShares` / `resourceAccessDenials`

Extended `resourceType` union: `"client" | "project" | "task" | "pipeline"` — **no parallel ACL system**.

---

## 2. Ownership / ACL inheritance

Implemented in `convex/resourceAccess.ts`:

- **Client owner** → edit on client; inherited visibility for child projects/files when FKs are set.
- **Project share/owner** → file inherits when `pipeline.projectId` is set and file has no direct share override.
- **Legacy rows** (no `clientId`/`projectId`) → **file-level ACL only** (identical to pre-step behavior).

`filterPipelineRowsForMember` and `resolvePipelineAccessLevel` both apply hierarchy only when FKs exist.

---

## 3. Auto-link compatibility layer

`convex/pipelineHierarchyCompat.ts` + `lib/pipelineHierarchy.ts`:

1. If `projectId` → load project + client records.
2. Else if `clientId` only → record client + legacy virtual project from `dealData`.
3. Else → synthesize **legacy virtual** client/project from `dealData` strings (or `fileName` split).

Query: `pipelineHierarchyQueries.resolvePipelineFileHierarchy` (ACL-gated).

**No changes** to hub, board, or workspace layout components.

---

## 4. Mutation layer (transactional)

`convex/pipelineHierarchyMutations.ts`:

| Mutation | Behavior |
|----------|----------|
| `createLoanFileUnderProject` | File under existing project |
| `createProjectUnderClient` | Project + file under existing client |
| `createClientProjectAndLoanFile` | Client + project + file atomically |

Each write sets FKs **and** populates `dealData` client/project strings for downstream readers. Existing `pipeline.createFileWithDeal` is **unchanged**.

---

## 5. Query layer

`convex/pipelineHierarchyQueries.ts` (Convex subscription-friendly list shapes):

- `listClients`
- `listProjectsForClient`
- `listFilesForProject`
- `getClientRollup`
- `getProjectRollup`
- `resolvePipelineFileHierarchy`

---

## 6. Rollups

`convex/pipelineHierarchyRollups.ts`:

**Client:** `projectCount`, `loanCount`, `aggregateFunding`, `completionPercent` (from active non-archived files).

**Project:** `loanCount`, `stackFunding`, `activeStageMix` (by `stageId` or `status`), `completionPercent`.

---

## 7. Production safety proof

Operator: `operator/pipelineHierarchyFoundationStep13_3:runHierarchyFoundationProof`

Validates on canonical org (`mx76bxqnc23q76cb99tvrffmy58644pf`):

- 12 org files, 12 visible to Joshua
- 0 `clients` / 0 `projects` rows (no backfill)
- All files: no FKs, legacy hierarchy resolution, owner Joshua, access `edit`
- 12 distinct legacy identity keys

Script: `npx tsx scripts/run-phase13-step3-foundation-proof.ts`

---

## 8. Validation run

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | pass |
| `npm run build` | pass |
| `npm run convex:deploy:prod` | pass → `https://basic-anaconda-984.convex.cloud` |
| `npm run deploy:prod` | pass → `https://dlcfunds.vercel.app` |
| `npm run auth:validate` | pass (all checks) |
| `run-phase13-step3-foundation-proof.ts` | pass (`proof.pass: true`) |

---

## 9. Intentionally not done (STOP boundary)

- No production backfill into `clients` / `projects`
- No hub / pipeline board / workspace layout redesign
- No removal of `dealData` client/project string fields

---

## 10. Next steps (future phases)

1. Backfill script: dedupe `dealData` pairs → `clients` + `projects`, set FKs.
2. Hub navigation keyed by client/project with file drill-down.
3. Share UI for client/project resources via existing `resourceShares` mutations.
