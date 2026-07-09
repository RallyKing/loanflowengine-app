# Phase 13.3 Step 3 — Production hierarchy backfill

**Status:** Complete (prod data migrated; **no UI changes**)  
**Date:** 2026-05-21  
**Evidence:** `migration-reports/phase13-step3-backfill.json`

## Executive summary

All **12** production pipeline rows in the canonical org were backfilled from legacy `dealData.clientName` / `dealData.projectName` into normalized **`clients`** (12) and **`projects`** (12), with **`pipeline.clientId`** and **`pipeline.projectId`** set. No other pipeline fields were modified. Joshua visibility and per-file access levels are **unchanged** (12 visible, all `edit`). Zero owner collisions; zero `resourceShares` drift.

---

## 1. Analyze + dedupe

**Operator:** `operator/pipelineHierarchyBackfillStep13_3:analyzeBackfill`

Normalization (`lib/pipelineHierarchyNormalize.ts`):

- NFKC Unicode normalize
- Trim + collapse whitespace
- Case-insensitive canonical key

**Prod scan:** 12 pipeline rows total (all org-scoped to `mx76bxqnc23q76cb99tvrffmy58644pf`).

| Metric | Value |
|--------|-------|
| Legacy candidates | 12 |
| Distinct canonical clients | 12 |
| Distinct canonical projects | 12 |
| Owner collision groups | 0 |
| Executable groups | 12 |

Grouping report is embedded in `migration-reports/phase13-step3-backfill.json` under `analyze.analyze.projectGroups`.

---

## 2. Parent record creation

**Operator:** `operator/pipelineHierarchyBackfillStep13_3:executeBackfill`

| Action | Count |
|--------|-------|
| Clients created | 12 |
| Projects created | 12 |
| Display casing | First row in each group (`clientDisplayName`, `projectDisplayTitle`) |

Ownership: client and project `ownerUserId` = sole file owner in each project group.

---

## 3. File linking

Only patches applied per file:

- `pipeline.clientId`
- `pipeline.projectId`

**Linked:** 12 files. **`dealData` untouched.**

---

## 4. Ownership collisions

| Check | Result |
|-------|--------|
| Owner collision groups | 0 |
| Skipped (collision) | 0 |
| Skipped (existing client owner mismatch) | 0 |

---

## 5. ACL / Joshua zero-drift

Captured in execute transaction (`joshuaBefore` vs `joshuaAfter`):

| Metric | Before | After |
|--------|--------|-------|
| Visible file IDs | 12 (same set) | 12 (same set) |
| Per-file access | all `edit` | all `edit` |

`resourceShares` total: **3** → **3** (unchanged)  
Pipeline `resourceShares`: **2** → **2** (unchanged)

Execute aborts the transaction if Joshua visibility or share counts drift.

---

## 6. Rollup / integrity validation

**Operator:** `operator/pipelineHierarchyBackfillStep13_3:runBackfillProof` — **pass**

| Check | Result |
|-------|--------|
| All org files linked (null FKs) | pass |
| 12 clients / 12 projects | pass |
| Zero orphan clients | pass |
| Zero orphan projects | pass |
| Rollups have ≥1 loan per parent | pass |
| Hierarchy resolution | `foreign_keys` for all 12 |

---

## 7. Before / after matrix

| Metric | Before | After |
|--------|--------|-------|
| Legacy unlinked files | 12 | 0 |
| Linked files (both FKs) | 0 | 12 |
| Clients | 0 | 12 |
| Projects | 0 | 12 |
| resourceShares | 3 | 3 |
| Joshua visible files | 12 | 12 |

---

## 8. Validation commands

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | pass |
| `npm run build` | pass |
| `npm run convex:deploy:prod` | pass |
| `npm run deploy:prod` | pass → https://dlcfunds.vercel.app |
| `npm run auth:validate` | pass |
| `npx tsx scripts/run-phase13-step3-backfill.ts` | pass |

---

## 9. Code map

| Module | Role |
|--------|------|
| `lib/pipelineHierarchyNormalize.ts` | NFKC canonical keys |
| `convex/pipelineHierarchyBackfill.ts` | Analyze, execute, integrity |
| `convex/operator/pipelineHierarchyBackfillStep13_3.ts` | Admin mutations |
| `scripts/run-phase13-step3-backfill.ts` | Prod analyze → execute → proof → JSON |

---

## 10. STOP boundary (not done)

- No hub redesign
- No pipeline board redesign
- No workspace layout changes

**Step 4** will add UI grouping on top of this data layer.

---

## Re-run (idempotent)

Execute skips rows that already have both FKs. Re-running analyze on prod should show `alreadyLinkedFiles: 12`, `legacyCandidateFiles: 0`.
