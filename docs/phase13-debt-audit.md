# Phase 13 — Legacy Compatibility Debt Audit

**Date:** 2026-05-21  
**Baseline:** Phase 12.2 Steps 8B / 8B.1 / 8C complete  
**Scan scope:** `lender-app/` runtime code (excludes one-off migration reports and docs unless referenced)

---

## Scan categories

| Category | What we looked for |
|----------|-------------------|
| `ownerUserKey` | Dual-field ownership bridge vs dead assignment paths |
| `task.sharedWithIds` / `pipeline.sharedWithIds` | Legacy inline share lists bypassing `resourceShares` |
| Organization-name ownership display | Org names / slugs shown where canonical usernames required |
| Org-scoped visibility shortcuts | RBAC or query paths that bypass owner-scoped ACL |
| Legacy share mutation paths | UI or mutations writing legacy tables/fields instead of `resourceShares` |

---

## Classification summary

| Class | Count | Meaning |
|-------|------:|---------|
| **Safe compatibility shim** | **14** | Intentional bridge; required until data/UI cutover; no security bypass |
| **Deprecated but harmless** | **12** | Dead code paths, stale schema fields, migration-only, or personal-mode fallbacks |
| **Must remove in Phase 13 cleanup** | **8** | Active dual paths that can desync ACL or confuse operators |

---

## A. Safe compatibility shim (14)

| # | Location | Debt | Why safe |
|---|----------|------|----------|
| 1 | `convex/resourceAccess.ts` | `resolveRowOwnerUserId` falls back `ownerUserId` → `ownerUserKey` | Read bridge until `ownerUserKey` column dropped |
| 2 | `convex/resourceAccess.ts` | `ownerFieldsForInsert` dual-writes both owner fields | Keeps legacy readers working during transition |
| 3 | `convex/schema.ts` | `ownerUserKey` optional field on tasks/pipeline | Schema bridge synced with `ownerUserId` |
| 4 | `components/PipelineFileWorkspace.tsx` | `ownerUserId ?? ownerUserKey` prop | UI read bridge |
| 5 | `lib/fileRevenue.ts` | `ownerUserId \|\| ownerUserKey` | Analytics read bridge |
| 6 | `convex/resourceAccess.ts` | `mergeLegacyPipelineShares` + `resolveLegacyPipelineShareLevel` | Read-only merge from `pipelineFileShares` until table retired |
| 7 | `convex/pipelineFileShares.ts` | Dual-write `pipelineFileShares` + `resourceShares` on upsert/remove | ACL reads `resourceShares`; legacy table for activity/UI list |
| 8 | `convex/organizationAccess.ts` | Delegates all pipeline/task ACL to `resourceAccess` | No alternate visibility path |
| 9 | `lib/useOrgMemberDisplayLabel.ts` | `canonicalDisplayUsername ?? displayUsername` | Graceful fallback when auth row missing |
| 10 | `components/TaskSharingSection.tsx` | `canonicalDisplayUsername ?? displayUsername` | Same |
| 11 | `components/PipelineFileSharingSection.tsx` | Same display fallback | Same |
| 12 | `components/OrganizationSettingsPanel.tsx` | Same display fallback | Same |
| 13 | `components/TeamManagementPanel.tsx` | Same display fallback | Same |
| 14 | `convex/auth/signup.ts` + `cleanTenantBootstrap.ts` | Bootstrap `ownerUserKey` placeholder | Signup-only; not product ACL path |

---

## B. Deprecated but harmless (12)

| # | Location | Debt | Why harmless |
|---|----------|------|--------------|
| 1 | `convex/testingSeed.ts` | Writes `ownerUserKey` on demo rows | Test/demo only |
| 2 | `convex/pipeline.ts` | Demo file insert leaves `ownerUserKey` unset | Intentional demo delete semantics |
| 3 | `convex/schema.ts` | `sharedWithIds` on tasks/pipeline | No ACL reads this field post-8B; stale data only |
| 4 | `convex/schema.ts` | Comment references `files.view_all` on pipeline rows | Comment stale — ACL does not use it |
| 5 | `lib/orgRbac.ts` | `files.view_all` / `files.edit_all` permission strings | RBAC helpers only; **not wired into `resourceAccess` filters** |
| 6 | `components/TaskDrawer.tsx` | Legacy `sharedWithIds` inline editor | Only when **no org** (`personal` mode); org tasks use `TaskSharingSection` |
| 7 | `lib/export/tasksExport.ts` | Exports `sharedWithIds` column | Export metadata; not ACL |
| 8 | `lib/file/fileSectionMetrics.ts` | Counts rows with `sharedWithIds` | Metrics only |
| 9 | `lib/deal/canonicalDataModel.ts` | Documents `sharedWithIds` in model comment | Documentation |
| 10 | `convex/notificationRecipients.ts` | Reads `file.sharedWithIds` | **Low traffic**; should migrate but not ACL bypass |
| 11 | `convex/migrations/*` (8 modules) | `ownerUserKey` / `sharedWithIds` rewrite | Migration-only; not runtime |
| 12 | `convex/auth/operatorAudit.ts` | Checks `ownerUserKey` in audit | Operator diagnostics |

---

## C. Must remove in Phase 13 cleanup (8)

| # | Location | Debt | Risk if kept |
|---|----------|------|--------------|
| 1 | `convex/tasks.ts` | Accepts/persists `sharedWithIds` on create/update/list | Dual share model; desync from `resourceShares` |
| 2 | `convex/pipeline.ts` | Accepts/persists `sharedWithIds` on patch/create | Same |
| 3 | `components/pipeline/blocks/PeopleOnFileBlock.tsx` | Inline `sharedWithIds` editor on file workspace | User-facing legacy path bypassing `PipelineFileSharingSection` |
| 4 | `convex/notificationRecipients.ts` | Notify loop over `sharedWithIds` | Misses `resourceShares` recipients / wrong notify set |
| 5 | `convex/legacyAssignToOwner.ts` | Operator mutation assigning `ownerUserKey` only | Bypasses canonical `ownerUserId` ownership model |
| 6 | `convex/pipelineFileShares.ts` `listForFile` | Lists `pipelineFileShares` table as source of truth | Should list `resourceShares` once dual-write cutover complete |
| 7 | `convex/resourceAccess.ts` | Legacy pipeline share merge functions | Remove after `pipelineFileShares` table drained |
| 8 | `convex/schema.ts` | Drop `ownerUserKey`, `sharedWithIds`, `pipelineFileShares` table | Final schema cleanup after migrations + UI cutover |

---

## Category detail

### `ownerUserKey` (17 files total repo-wide)

**Runtime convex (non-migration):** 10 files  
**UI/lib runtime:** 2 files (`PipelineFileWorkspace`, `fileRevenue`)  
**Must-remove operator:** 1 (`legacyAssignToOwner.ts`)  
**Migration-only:** 8 files  

No org-wide visibility bypass found — all task/pipeline visibility flows through `resourceAccess`.

### `sharedWithIds` (14 files total repo-wide)

**Active mutation paths:** `tasks.ts`, `pipeline.ts`  
**Active UI paths:** `PeopleOnFileBlock.tsx`, `TaskDrawer.tsx` (personal-only)  
**ACL engine:** Does **not** read `sharedWithIds` (confirmed post-8B.1)

### Organization-name ownership display fallbacks

**Product screens audited:** tasks, pipeline sharing, activity, settings/team — use `canonicalDisplayUsername` / `useOrgMemberDisplayLabel`.

**Remaining org-name surfaces (intentional, not user-ownership labels):**
- Session chrome / tenant switcher (`organizationName` in session)
- Impersonation banner (`targetOrganizationName`)
- Client portal `workspaceName`
- Signup org name field
- Communications templates (`organization?.name`)

No product screen shows org name **as a user/owner/assignee label** after Step 8C.

### Org-scoped visibility shortcuts

| Pattern | Status |
|---------|--------|
| `files.view_all` bypassing owner ACL | **Not present** in `resourceAccess` filters |
| `filterPipelineRowsForMember` / `filterTaskRowsForMember` | Owner + `resourceShares` only (+ impersonation grant) |
| Unscoped rows (`organizationId` unset) | Legacy shim returns full access in mutators — migration debt, not Joshua org |
| Impersonation org visibility grant | **Intentional** superuser feature (locked) |

### Legacy share mutation paths

| Path | Writes `resourceShares`? | Status |
|------|--------------------------|--------|
| `taskShares.upsert` / `remove` | Yes | **Canonical** |
| `pipelineFileShares.upsertShare` / `removeShare` | Yes (dual-write) | **Canonical** with legacy table bridge |
| `tasks.ts` `sharedWithIds` patch | No | **Must remove** |
| `pipeline.ts` `sharedWithIds` patch | No | **Must remove** |
| `PeopleOnFileBlock` → `sharedWithIds` | No | **Must remove** |
| `TaskDrawer` legacy inline (no org) | No | Deprecate or gate behind personal workspace flag |

---

## Recommended Phase 13 cleanup order

1. Replace `PeopleOnFileBlock` sharing with `PipelineFileSharingSection` (or embed share section in people block).
2. Stop accepting `sharedWithIds` in `tasks.ts` / `pipeline.ts` mutations; migrate any remaining row data to `resourceShares`.
3. Point `notificationRecipients.ts` at `resourceShares` for pipeline notify targets.
4. Switch `pipelineFileShares.listForFile` to read `resourceShares`; stop dual-write; drain `pipelineFileShares` table.
5. Remove legacy merge in `resourceAccess.ts`.
6. Drop `ownerUserKey`, `sharedWithIds`, `pipelineFileShares` from schema after operator verification.
7. Delete `legacyAssignToOwner.ts` and related scripts.

---

## Evidence references

- `docs/phase12-step8B-owner-acl.md`
- `docs/phase12-step8B1-share-forensics.md`
- `docs/phase12-step8C-display-normalization.md`
- `docs/phase13-lockdown-baseline.md`
