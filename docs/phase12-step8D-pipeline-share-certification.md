# Phase 12.2 Step 8D — Pipeline Share Forensics + Hard Certification

**Date:** 2026-05-21  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Vercel deployment:** `dpl_EUsRBVnTz7Xw1HDCXZxpU7JmnisM`  
**Evidence:** `migration-reports/phase12-step8D-pipeline-share-certification.json`

---

## Summary

Pipeline file sharing is **HARD CERTIFIED** on production. Root cause was a **split-brain share path**: ACL visibility reads `resourceShares`, but the UI list and a legacy drawer field wrote/read alternate stores. Repairs align list queries and remove the dead-end `sharedWithIds` editor without touching locked ACL/auth infrastructure.

**PIPELINE SHARING HARD CERTIFIED**  
**Phase 12.2 FULLY CLOSED**

---

## Root cause

| Failure mode | Finding |
|--------------|---------|
| UI mutation not firing | **Not the issue** — `PipelineFileSharingSection` correctly calls `pipelineFileShares.upsertShare` / `removeShare`. |
| Mutation succeeds, share row absent in UI | **Confirmed** — `listForFile` queried **`pipelineFileShares` only**, while `filterPipelineRowsForMember` reads **`resourceShares`**. Dual-write could succeed for ACL but owner UI could lag or miss rows if tables diverged. |
| Share row written, query filter ignores | **Not the issue** — `resourceAccess.buildShareIndexForUser` + `filterPipelineRowsForMember` correctly gate visibility. |
| Subscription cache stale | **Not the issue** — Convex reactive queries refresh on mutation completion; visibility counts updated immediately in live proof. |
| Revoke path drift | **Not the issue** — `removeShare` deletes both `pipelineFileShares` and `resourceShares`. |
| Email resolution mismatch | **Not the issue** — all variants resolve to `ts7d3keadq48gay3pa8k6gdwx9878p33`. |
| **Legacy drawer bypass** | **Confirmed** — `PeopleOnFileBlock` wrote `pipeline.sharedWithIds`, which **ACL never reads**. Operators using the drawer "Shared with" field saw no visibility change for recipients. |

---

## Exact repaired code paths

| File | Change |
|------|--------|
| `convex/pipelineFileShares.ts` → `listForFile` | Lists collaborators from **`resourceShares`** (ACL source of truth); merges display metadata from `pipelineFileShares` when present. |
| `components/pipeline/blocks/PeopleOnFileBlock.tsx` | Removed legacy **`sharedWithIds`** inline editor for org files; assignee-only + pointer to Team access section. |
| `components/PipelineFileWorkspace.tsx` | Updated drawer copy — sharing is owner-scoped via Team access section. |
| `components/PipelineFileSharingSection.tsx` | `onAdd` accepts **`targetLoginOrEmail`** for email-target shares; Add button enabled when email or member selected. |
| `convex/operator/pipelineShareCertificationStep8D.ts` | New production proof operator (matrices A–E + storage integrity). |
| `scripts/run-phase12-step8D-pipeline-share-certification.ts` | CLI runner → JSON evidence artifact. |

**Unchanged (per lockdown):** `resourceAccess.ts`, auth canonicalization, task sharing, impersonation, display normalization, write-budget modules.

---

## Share flow (post-repair)

```
PipelineFileSharingSection
  → useMutation(pipelineFileShares.upsertShare | removeShare)
    → resolveShareTargetUserKey (email or userKey)
    → pipelineFileShares insert/patch/delete (activity + legacy bridge)
    → upsertResourceShare / removeResourceShare
  → useQuery(pipelineFileShares.listForFile)  ← reads resourceShares
  → pipeline.getAll / listLight
    → filterPipelineRowsForMember ← reads resourceShares
```

---

## Before / after visibility counts

| Viewer | Before Step 8D proof | After proof cleanup |
|--------|---------------------:|--------------------:|
| **Eballard** shared files | 0 (baseline A) | **0** |
| **Joshua** owned visible files | 11 | **11** (zero drift) |

Proof file: `jx73q1xrywyg8mfmag0hmd95g185qm11`

---

## Live proof matrix (production)

| Step | Action | Eballard files | Access | Edit probe | Result |
|------|--------|---------------:|--------|------------|--------|
| **A** | Baseline | **0** | — | — | **PASS** |
| **B** | Joshua shares 1 file **view** | **1** | `view` | **denied** | **PASS** |
| **C** | Upgrade same share to **edit** | **1** | `edit` | **allowed** | **PASS** |
| **D** | Revoke share | **0** | — | — | **PASS** |
| **E** | Re-share via `  JoshuaEBallard@gmail.com  ` | **1** | `view` | — | **PASS** |

Email variants (all → `ts7d3keadq48gay3pa8k6gdwx9878p33`):

- `joshuaeballard@gmail.com`
- `JoshuaEBallard@gmail.com`
- `JOSHUAEBALLARD@GMAIL.COM`
- `  joshuaeballard@gmail.com  `

**Operator overall:** `pass: true`

---

## Storage integrity proof

Checked after each matrix step and at final cleanup:

| Check | Result |
|-------|--------|
| Duplicate `resourceShares` rows | **0** |
| Duplicate `pipelineFileShares` rows | **0** |
| Orphan legacy shares (no `resourceShares`) | **0** |
| Orphan resource shares (no legacy row) | **0** |
| Owner leakage (Joshua in share table) | **false** |
| Final legacy share count | **0** |
| Final resource share count | **0** |

---

## Joshua zero drift proof

| Metric | Before | After |
|--------|-------:|------:|
| Visible pipeline files | 11 | **11** |
| File id set unchanged | ✓ | ✓ |
| `joshuaZeroDrift.pass` | — | **`true`** |

---

## Validation commands

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** |
| `npm run deploy:prod` | **PASS** → https://dlcfunds.vercel.app |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |
| `npx tsx scripts/run-phase12-step8D-pipeline-share-certification.ts` | **`pass: true`** |

---

## Operator re-run

```bash
cd lender-app
npx tsx scripts/run-phase12-step8D-pipeline-share-certification.ts
```

Requires `DATA_MIGRATION_ADMIN_SECRET` in `.env.local`.

---

**Status:** Step 8D complete. Awaiting operator review.

**PIPELINE SHARING HARD CERTIFIED**  
**Phase 12.2 FULLY CLOSED**
