# Phase 15 Step 3 — Indexed Graph Normalization + Production Backfill Execute

**Status:** Step 3 complete — production backfill executed, integrity certified, dual-read preserved.  
**STOP:** No Step 4 projection-mode UI. No hub layout or filtering UI changes.

---

## Objective

Populate all 10 Phase 15 edge tables from canonical production data, collapse stickiness-equivalent duplicates, and prove zero ACL / ownership / visibility drift before any projection UI work.

---

## Execution modules

| Module | Role |
|--------|------|
| `convex/indexedGraphBackfill.ts` | Backfill engine, stickiness ambiguity guard, collapse, integrity scan, compat resolver proof |
| `convex/operator/indexedGraphBackfillStep15_3.ts` | Admin mutations: `executeBackfillStep15_3`, `runProofStep15_3`, `executeAndProveStep15_3` |
| `scripts/run-phase15-step3-backfill-execute.ts` | Production report generator |
| `lib/indexedGraphStickiness.ts` | Client/referral/lender/team/task stickiness keys |
| `convex/indexedGraphCompat.ts` | Dual-read resolvers (unchanged contract) |

---

## Backfill source priority (per edge type)

### File-scoped

| Table | Sources (in order) |
|-------|-------------------|
| `fileClients` | `pipeline.clientId` FK → `loanClients` → `projectClients` (via file `projectId`) |
| `fileProjects` | `pipeline.projectId` FK |
| `fileLenders` | `pipeline.lenders[]` (`selected` when matches `selectedLenderId`, else `quoted`) |
| `fileReferralPartners` | `contactFileLinks` where `relationshipType === "referral"` |
| `fileTeamMembers` | `assigneeId` → `sharedWithIds` → `pipelineFileShares` → `resourceShares` (pipeline) |
| `fileTasks` | `tasks.relatedFileId` |

### Project-scoped (aggregated from file edges)

| Table | Sources |
|-------|---------|
| `projectLenders` | Union of `fileLenders` across project files |
| `projectReferralPartners` | Union of `fileReferralPartners` across project files |
| `projectTeamMembers` | Union of `fileTeamMembers` across project files |
| `projectTasks` | Union of `fileTasks` across project files |

**Idempotency:** Every insert checks `by_file_entity` / `by_project_entity` first — never duplicates edges.

**Ambiguity:** Email/phone stickiness collisions on clients or referral contacts abort the run (no guessing).

**Collapse:** Post-insert, `fileClients` edges on the same file with equivalent client stickiness keys collapse to the surviving primary/lowest-`sortOrder` edge.

---

## Production execute — Joshua org

**Organization:** `mx76bxqnc23q76cb99tvrffmy58644pf`  
**Executed:** 2026-05-25 via `executeAndProveStep15_3` on Convex prod  
**Report:** `migration-reports/phase15-step3-backfill-execute.json`

### Rows inserted (net new)

| Table | Inserted | Skipped (already present) |
|-------|----------|---------------------------|
| `fileClients` | 30 | 38 |
| `fileProjects` | 20 | 0 |
| `fileLenders` | 7 | 0 |
| `fileReferralPartners` | 13 | 0 |
| `fileTeamMembers` | 2 | 0 |
| `fileTasks` | 1 | 0 |
| `projectLenders` | 7 | 0 |
| `projectReferralPartners` | 13 | 0 |
| `projectTeamMembers` | 2 | 0 |
| `projectTasks` | 1 | 0 |

**Total net inserts:** 96 edge rows  
**Duplicates collapsed:** 0 (no stickiness-equivalent client collisions on same file)  
**Ambiguities skipped:** 0

The 38 `fileClients` skips are expected: `loanClients` junction rows mirror FK primaries already inserted from `pipeline.clientId`.

---

## Integrity scan (post-backfill)

| Check | Result |
|-------|--------|
| Orphan edges | 0 |
| Duplicate normalized edges | 0 |
| Files missing client edge (where FK set) | 0 |
| Files missing project edge (where FK set) | 0 |
| Invalid task links | 0 |
| **Integrity pass** | **true** |

Post-backfill analyze: `totalEstimatedInserts: 0`, all edge tables fully mirrored.

---

## Zero-drift proofs

### Joshua visibility (`ts719yfyv2b6020avvctpw0ns586exm6`)

| Metric | Before | After |
|--------|--------|-------|
| Visible files | 20 | 20 |
| File ID set | unchanged (20 canonical IDs) | identical |

**Drift:** false

### eballard visibility (`ts7d3keadq48gay3pa8k6gdwx9878p33`)

| Metric | Before | After |
|--------|--------|-------|
| Visible files | 0 | 0 |

**Drift:** false  
**Resolver proof (eballard viewer):** pass

### resourceShares

| Type | Before | After |
|------|--------|-------|
| pipeline | 2 | 2 |
| task | 1 | 1 |
| total | 3 | 3 |

**Drift:** false

---

## Compat resolver proof (Joshua viewer)

All six resolvers sampled on Joshua org entities:

- `resolveFilesForClient` — deduped, stable `sortOrder`, ACL-filtered
- `resolveFilesForProject` — deduped, stable ordering
- `resolveFilesForLender` — deduped (sampled org lenders)
- `resolveFilesForReferralPartner` — (sampled referral contacts)
- `resolveFilesForTeamMember` — deduped
- `resolveFilesForTask` — deduped

**Resolver proof pass:** true (all samples: `unique: true`, `ordered: true`)

Dual-read preserved: legacy FKs, `loanClients`, `projectClients`, arrays, and scalars remain authoritative alongside new junction rows.

---

## Validation run

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | pass |
| `npm run build` | pass |
| `npm run convex:deploy:prod` | deployed to `basic-anaconda-984.convex.cloud` |
| Backfill execute (prod) | pass |
| `npm run deploy:prod` | https://dlcfunds.vercel.app |
| `npm run auth:validate` | ALL_CHECKS_PASSED |

---

## What was NOT changed

- Hub layout / board grouping UI
- Filtering UI / projection mode
- ACL or `resourceShares` mutation paths
- Legacy FK or Phase 14 junction tables

Step 4 may switch read paths to indexed graph resolvers for projection-only hub modes once stakeholders sign off on this certification.

---

## Re-run (idempotent)

```bash
# From lender-app/
npx tsx scripts/run-phase15-step3-backfill-execute.ts
```

Safe to re-run: existing edges skip via unique indexes; collapse is no-op when no stickiness duplicates exist.
