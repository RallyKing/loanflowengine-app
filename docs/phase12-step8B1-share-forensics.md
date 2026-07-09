# Phase 12.2 Step 8B.1 — Share-path forensics

**Date:** 2026-05-21  
**Status:** PASS  
**Evidence:** `migration-reports/phase12-step8B1-share-forensics.json`

## Root cause

| Path | Failing layer | Issue |
|------|---------------|-------|
| **Task share** | UI → ACL disconnect | `TaskDrawer` wrote legacy `task.sharedWithIds` via inline text. Step 8B ACL reads **`resourceShares` only** — no task share mutations existed, so shares never granted visibility. |
| **Pipeline share** | None (backend OK) | `PipelineFileSharingSection` → `pipelineFileShares.upsertShare` → dual-write `pipelineFileShares` + `resourceShares` already worked. Gap was **email-target resolution** for share-by-email flows. |
| **Email resolution** | None | `findAuthUserByCanonicalLogin` (NFKC → trim → lowercase) already resolves all case variants to the same auth userId. |

## Fixes applied

1. **`convex/shareTargetResolve.ts`** — canonical email/login → org member `userKey` resolver.
2. **`convex/taskShares.ts`** — `listForTask`, `upsertShare`, `removeShare` writing **`resourceShares`** (owner-only manage).
3. **`convex/pipelineFileShares.ts`** — uses `resolveShareTargetUserKey`; optional `targetLoginOrEmail` on upsert/remove; fixed missing `resourceAccess` imports.
4. **`components/TaskSharingSection.tsx`** — owner-only ACL sharing UI (mirrors pipeline section).
5. **`components/TaskDrawer.tsx`** — org tasks use `TaskSharingSection`; legacy `sharedWithIds` retained for non-org tasks.
6. **`convex/operator/shareForensicsStep8B1.ts`** — email variant audit + live share/revoke proof.
7. **`scripts/run-phase12-step8B1-share-forensics.ts`** — production forensics runner.

## End-to-end trace

### Task share (fixed)

```
TaskSharingSection (UI submit)
  → taskShares.upsertShare (mutation)
    → resolveShareTargetUserKey (email or userKey)
    → upsertResourceShare (ACL insert)
  → filterTaskRowsForMember / listForTask (query visibility refresh)
```

**Previously broken at:** UI layer (wrote `sharedWithIds`, ACL never consulted).

### Pipeline share (verified)

```
PipelineFileSharingSection (UI submit)
  → pipelineFileShares.upsertShare (mutation)
    → resolveShareTargetUserKey
    → pipelineFileShares insert/patch
    → upsertResourceShare (ACL insert)
  → filterPipelineRowsForMember / listForFile (query visibility refresh)
```

## Proof matrix

| Check | Result |
|-------|--------|
| `joshuaeballard@gmail.com` → `ts7d3keadq48gay3pa8k6gdwx9878p33` | PASS |
| `JoshuaEBallard@gmail.com` → same userId | PASS |
| `JOSHUAEBALLARD@GMAIL.COM` → same userId | PASS |
| Joshua shares 1 task (view) to email target | PASS — eballard 0→1 tasks |
| Joshua shares 1 file (edit) to email target | PASS — eballard 0→1 files |
| Task mutation permission = view (edit denied) | PASS |
| File mutation permission = edit (edit allowed) | PASS |
| `resourceShares` row written for task | PASS |
| `resourceShares` + `pipelineFileShares` for file | PASS |
| Revoke task — instant 1→0 | PASS |
| Revoke file — instant 1→0 | PASS |
| Joshua visibility unchanged after revoke | PASS (56 tasks, 11 files) |
| **Overall `runLiveSharePathProof`** | **PASS** |

### Shared resource IDs (production proof run)

- Task: `k1756kdab4397w64ty4m64xn8h85gb9z`
- File: `jx73q1xrywyg8mfmag0hmd95g185qm11`

## Affected files

- `lender-app/convex/shareTargetResolve.ts` (new)
- `lender-app/convex/taskShares.ts` (new)
- `lender-app/convex/pipelineFileShares.ts`
- `lender-app/convex/operator/shareForensicsStep8B1.ts` (new)
- `lender-app/components/TaskSharingSection.tsx` (new)
- `lender-app/components/TaskDrawer.tsx`
- `lender-app/scripts/run-phase12-step8B1-share-forensics.ts` (new)

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | PASS |
| `npm run build` | PASS |
| `npm run convex:deploy:prod` | PASS |
| `npm run deploy:prod` | PASS |
| `npm run auth:validate` | PASS |

## Deploy URLs

- **App:** https://dlcfunds.vercel.app
- **Convex:** https://basic-anaconda-984.convex.cloud
- **Deployment:** https://loanflowengine-2kgtwuodq-joshua-4539s-projects.vercel.app
