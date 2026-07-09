# Phase 15 Step 2 — Additive Graph Schema Foundation

**Status:** Step 2 complete — schema + compat layer + dry-run analyze only.  
**No production writes. No deploy. No UI changes. No backfill execute.**

---

## Objective

Add first-class many-to-many indexed graph edge tables so one canonical `pipeline._id` can surface under all operational filter modes via projection only (Step 4+).

---

## Schema inventory (10 new tables)

| Table | File / project side | Entity | Unique pair index |
|-------|---------------------|--------|-------------------|
| `fileClients` | `fileId` | `clientId` | `by_file_entity` |
| `fileProjects` | `fileId` | `projectId` | `by_file_entity` |
| `fileLenders` | `fileId` | `lenderId` | `by_file_entity` |
| `fileReferralPartners` | `fileId` | `contactId` | `by_file_entity` |
| `fileTeamMembers` | `fileId` | `userKey` | `by_file_entity` |
| `fileTasks` | `fileId` | `taskId` | `by_file_entity` |
| `projectLenders` | `projectId` | `lenderId` | `by_project_entity` |
| `projectReferralPartners` | `projectId` | `contactId` | `by_project_entity` |
| `projectTeamMembers` | `projectId` | `userKey` | `by_project_entity` |
| `projectTasks` | `projectId` | `taskId` | `by_project_entity` |

**Shared fields:** `organizationId`, `relationshipType`, `sortOrder`, `createdBy`, `createdAt`, `updatedAt`

**Lookup indexes (all tables):** `by_file` or `by_project`, `by_entity`, org-scoped `by_org_entity`

**Preserved (dual-read):** Phase 14 `projectClients` / `loanClients`, scalar FKs `pipeline.clientId` / `pipeline.projectId`, `pipeline.lenders[]`, `contactFileLinks`, `tasks.relatedFileId`, `assigneeId` / `sharedWithIds`.

---

## Index inventory

See `migration-reports/phase15-step2-graph-foundation.json` → `indexInventory`.

File-scoped tables use: `by_file`, `by_entity`, `by_file_entity`, `by_org_entity`.  
Project-scoped tables use: `by_project`, `by_entity`, `by_project_entity`, `by_org_entity`.

---

## Compatibility resolution layer

**Module:** `convex/indexedGraphCompat.ts`

| Resolver | Legacy sources (dual-read) | New junction |
|----------|---------------------------|--------------|
| `resolveFilesForClient` | FK, `loanClients`, expanded client loader | `fileClients` |
| `resolveFilesForProject` | `pipeline.projectId` | `fileProjects` |
| `resolveFilesForLender` | `pipeline.lenders[]`, `selectedLenderId` | `fileLenders`, `projectLenders` → project files |
| `resolveFilesForReferralPartner` | `contactFileLinks` | `fileReferralPartners` |
| `resolveFilesForTeamMember` | `assigneeId`, `sharedWithIds`, `pipelineFileShares` | `fileTeamMembers` |
| `resolveFilesForTask` | `tasks.relatedFileId` | `fileTasks` |

**ACL contract:** Every resolver ends with `filterPipelineRowsForMember`. Edges never grant visibility.  
**Projection contract:** `mergeCandidates` + `assertUniqueFileRefs` — one canonical file id per result set.

---

## Entity stickiness (dedupe prep)

**Module:** `lib/indexedGraphStickiness.ts`

| Entity | Normalization |
|--------|---------------|
| Clients / referral partners | lowercase trim email → phone digits (≥7) → normalized display name |
| Lenders | existing `companyKey` + `emailKey` / `contactKey` composite |
| Team members | canonical `userKey` only |
| Tasks | canonical `taskId` only |

Step 3 will wire create/link mutations; Step 2 defines keys + unique pair indexes only.

---

## Dry-run analyze operator

**Module:** `convex/operator/indexedGraphAnalyzeStep15_2.ts`  
**Core:** `convex/indexedGraphAnalyze.ts`

- `analyzeGraphFoundation` — admin-gated mutation, **read-only**, `writes: 0`
- `analyzeGraphFoundationQuery` — org-scoped query
- `proveCompatUniqueness` — samples resolvers; asserts no duplicate file projections

**Runner:** `lender-app/scripts/run-phase15-step2-graph-foundation.ts`

---

## Collision analysis (Joshua org — prod read-only sample)

Source: `prod_inline_readonly` (legacy tables only; new edge tables empty until Step 3 backfill + prod schema deploy).

| Edge table | Existing junction | Implicit (legacy) | Est. inserts (Step 3) |
|------------|-------------------|-------------------|------------------------|
| `fileClients` | 19 (`loanClients`) | 20 FK | 39 |
| `fileProjects` | 0 | 20 FK | 20 |
| `fileLenders` | 0 | 7 array refs | 7 |
| `fileReferralPartners` | 0 | 0 referral CRM links | 0 |
| `fileTeamMembers` | 0 | 0 assignee/shared | 0 |
| `fileTasks` | 0 | 1 `relatedFileId` | 1 |
| Project-scoped tables | 0 | — | 0 (Step 3+ scope) |

**Total estimated inserts (Joshua org):** **67**  
**Global counts:** 20 files, 19 loan-client links, 7 lender array refs, 56 tasks

---

## Dedupe risk score

**Score: 1 / 5** (low) for Joshua org sample — no client normalizedName collisions, no contact email collisions, no duplicate junction pairs in `loanClients`.

Post-backfill risk rises if client create paths remain unguarded (see Phase 15 Step 1 audit).

---

## Compatibility proof

- `indexedGraphCompat` implements dual-read merge + ACL filter + dedupe.
- `assertUniqueFileRefs` helper validates projection uniqueness.
- Full `proveCompatUniqueness` runs after Step 3 deploy when operator is on target deployment.

---

## Validation (Step 2 gate)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | ✅ Pass |
| `npm run build` | ✅ Pass |
| `convex deploy` / `deploy:prod` | ⏭ Skipped (Step 2) |
| Production writes | ⏭ None |

---

## Deliverables

- `docs/phase15-step2-graph-foundation.md` (this file)
- `migration-reports/phase15-step2-graph-foundation.json`

---

## STOP — awaiting operator review before Step 3

Step 3: backfill + normalization execute (mirror legacy → junction rows, entity dedupe merges).
