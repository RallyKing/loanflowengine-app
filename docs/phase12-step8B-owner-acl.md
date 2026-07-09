# Phase 12.2 Step 8B — Owner-Scoped ACL Migration

**Date:** 2026-05-21  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Evidence:** `migration-reports/phase12-step8B-owner-acl.json`

---

## Summary

Production Joshua canonical org (`mx76bxqnc23q76cb99tvrffmy58644pf`) now enforces **strict owner-scoped ACL** for tasks and pipeline files. All 56 tasks and 11 pipeline files were backfilled to Joshua (`ts719yfyv2b6020avvctpw0ns586exm6`). Live ACL proof passed: eballard sees zero by default, exactly one task + one file when shared, zero again after revoke.

---

## 1. Ownership backfill

| Metric | Before | After |
|--------|-------:|------:|
| Joshua org tasks | 56 | 56 |
| Joshua org pipeline files | 11 | 11 |
| Tasks owned by Joshua | 0 | **56** |
| Files owned by Joshua | 11 | **11** |
| `null` task `ownerUserId` | 56 | **0** |
| `null` file `ownerUserId` | 0 | **0** |
| Task owner drift | 0 | **0** |
| File owner drift | 0 | **0** |

**Operator:** `operator/ownerAclStep8B:backfillJoshuaOwnership` (56 tasks + 11 files patched)

---

## 2. Legacy share migration

| Metric | Value |
|--------|------:|
| Legacy `pipelineFileShares` on Joshua org | 0 |
| Migrated to `resourceShares` | 0 |
| Legacy share drift | **0** |
| Resource share integrity errors | **0** |

No legacy shares existed pre-migration.

---

## 3. Visibility matrix (live production)

| Viewer | Before share | After share | After revoke |
|--------|-------------:|------------:|-------------:|
| **Joshua** tasks | 56 | 56 | 56 |
| **Joshua** files | 11 | 11 | 11 |
| **eballard** tasks | 0 | **1** (view) | **0** |
| **eballard** files | 0 | **1** (edit) | **0** |

### Share/revoke proof

| Check | Result |
|-------|--------|
| Shared task `k1756kdab4397w64ty4m64xn8h85gb9z` → view | PASS |
| Shared file `jx73q1xrywyg8mfmag0hmd95g185qm11` → edit | PASS |
| eballard task access level | `view` |
| eballard file access level | `edit` |
| eballard task edit denied | **true** (PASS) |
| eballard file edit allowed | **true** (PASS) |
| Revoke → eballard 0/0 | PASS |
| Joshua zero drift post-proof | PASS |
| **`runLiveAclProof` overall** | **`pass: true`** |

---

## 4. Joshua zero drift proof (post-migration)

| Field | Value |
|-------|------:|
| `tasksOwnedByJoshua` | 56 |
| `filesOwnedByJoshua` | 11 |
| `nullTaskOwners` | 0 |
| `nullFileOwners` | 0 |
| `taskOwnerDrift` | 0 |
| `fileOwnerDrift` | 0 |
| Joshua visible tasks | 56 |
| Joshua visible files | 11 |

---

## 5. Resource share integrity

| Check | Value |
|-------|------:|
| `legacyShareDrift` | 0 |
| `resourceShareIntegrityErrors` | 0 |

Temporary proof shares were created and revoked during `runLiveAclProof`; no orphaned shares remain.

---

## 6. Validation commands

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | OK |
| `npm run build` | OK |
| `npm run convex:deploy:prod` | OK |
| `npm run deploy:prod` | OK |
| `npm run auth:validate` | ALL_CHECKS_PASSED |

---

**Status:** Step 8B complete. Awaiting next instruction.
