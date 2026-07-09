# Phase 13.1A — Pipeline File Share UI Hard Fix

**Date:** 2026-05-21  
**Status:** **COMPLETE — awaiting operator review**  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Vercel deployment:** `dpl_EDRTXzkHgN3TxZACyGNQ4CAJLWxo`  
**Evidence:** `migration-reports/phase13-step1A-pipeline-share-ui-fix.json`

---

## Summary

Pipeline file sharing UI now matches task-style **owner-scoped ACL management**. Legacy drawer assignee/share-ID flows are removed; mutations write **`resourceShares` only** (no new `pipelineFileShares` rows). Pending email targets without auth accounts are stored in **`pipelineSharePendingInvites`**.

**Task sharing was not modified.**

---

## Changes

### Owner on create

Org-scoped pipeline inserts (`create`, `createFileWithDeal`, `createFileFromIntakeSheet`) require `preferencesAccountId` and always set:

- `ownerUserId` = authenticated creator  
- `ownerUserKey` = same (via `ownerFieldsForInsert`)

No org fallback owner; demo bundle insert remains intentionally ownerless.

### UI — Pipeline File Access

| Before | After |
|--------|-------|
| Utilities “Team access” + drawer “People & sharing” with assignee | Single drawer block **Pipeline File Access** |
| `PeopleOnFileBlock` assignee + legacy copy | `PipelineFileSharingSection` |
| `ownerUserId ?? ownerUserKey` fallback | Canonical owner from `listForFile` only |

**Section shows:**

- Owner (read-only canonical username)  
- Shared users: username, permission dropdown (view/edit), revoke  
- Pending invites (owner-only)  
- Add: searchable member list + email (NFKC canonicalized client-side; server uses `canonicalEmailKey`)  

### Backend (`convex/pipelineFileShares.ts`)

| API | Behavior |
|-----|----------|
| `listForFile` | `{ ownerUserId, ownerDisplayUsername, shares[], pendingInvites[] }` from `resourceShares` + pending table |
| `shareFile` | ACL upsert; pending invite if email has no auth user |
| `updateSharePermission` | `resourceShares` only |
| `revokeShare` | Active share or pending invite |
| `upsertShare` / `removeShare` | Thin legacy wrappers → new handlers (no `pipelineFileShares` writes) |

### Cleanup

- Deleted `components/pipeline/blocks/PeopleOnFileBlock.tsx`  
- Removed utilities shell duplicate sharing section (`sharing={null}`)  
- Updated `lib/pipelineBlockRegistry.ts` people block metadata  

---

## Live proof matrix (production)

Operator: `operator/pipelineShareUiFixStep13_1A:runPipelineShareUiFixProof`  
**`pass: true`**

| Step | Requirement | Result |
|------|-------------|--------|
| Baseline | Eballard + second user cannot see proof file | **PASS** |
| Share view | Eballard sees file with `view` | **PASS** |
| Dual share | Eballard view + second user `edit` simultaneously (2 `resourceShares` rows) | **PASS** |
| Upgrade | Eballard permission → `edit` | **PASS** |
| Revoke one | Eballard hidden; second user still `edit` | **PASS** |
| Revoke all | Both users hidden | **PASS** |
| Email resolve | `joshuaeballard@gmail.com` → Eballard userKey | **PASS** |

---

## Validation gates

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** |
| `npm run deploy:prod` | **PASS** |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |

---

## Manual UI smoke (recommended)

1. Open an org-owned pipeline file as Joshua → drawer **Pipeline File Access**  
2. Share Eballard **view**, add second member **edit** — both rows visible  
3. Change permission dropdown live (no refresh)  
4. Revoke one collaborator; confirm the other remains  
5. Share unknown email → pending invite row appears  

---

## Phase 12 regression

- `resourceAccess.ts` unchanged  
- Auth / impersonation / write-budget unchanged  
- Task sharing unchanged  

**STOP:** Do not proceed to Phase 13.2 until operator sign-off.
