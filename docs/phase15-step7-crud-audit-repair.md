# Phase 15 Step 7 — Comprehensive Graph CRUD, Deletion & User Control Repair

**Status:** Complete — awaiting review  
**Date:** 2026-05-21

## Summary

Step 7 audits and repairs missing hierarchy CRUD controls for **Clients**, **Projects**, and **Loan Files**. It implements safe deletion with child-blocking rules, cascade graph edge cleanup, primary parent reassignment, and owner/admin-only ACL enforcement at the Convex mutation layer.

## Audit matrix (before → after)

| Entity | Operation | Before | After |
|--------|-----------|--------|-------|
| **Client** | Delete | Missing | `deleteClient` — blocked if projects exist |
| **Client** | Edit metadata | Create-only | `patchClient` + hub settings UI |
| **Client** | Reassign parent | N/A (root entity) | — |
| **Project** | Delete | Missing | `deleteProject` — blocked if loan files exist |
| **Project** | Edit metadata | Create-only / capital only | `patchProject` + hub settings UI |
| **Project** | Change primary client | Promote via junction only | `changeProjectClient` + UI picker |
| **Loan file** | Delete | Existed; edges orphaned | Extended cascade via `deleteIndexedGraphEdgesForFile` |
| **Loan file** | Change project | Missing | `changePipelineProject` + workspace UI |
| **Loan file** | Edit metadata | Rich patch paths | Unchanged (existing) |

## Safe deletion constraints

### Loan files
- `pipeline.remove` / `deletePipelineFile` calls `deletePipelineGraph`
- **New:** `deleteIndexedGraphEdgesForFile` removes `fileClients`, `fileProjects`, `fileLenders`, `fileReferralPartners`, `fileTeamMembers`, `fileTasks`, `loanClients`
- **New:** `resourceShares` for pipeline cleared
- Canonical lender/client/project/contact records **never** deleted

### Projects
- Blocked when `pipeline.by_projectId` count > 0
- Message: *"You must reassign or delete all associated Loan Files before deleting this Project."*
- Empty project: `deleteProjectGraphEdges` cascades `projectClients`, `projectLenders`, `projectReferralPartners`, `projectTeamMembers`, `projectTasks`, capital stack tables, `resourceShares`

### Clients
- Blocked when `projects.by_client` count > 0
- Message: *"You must reassign or delete all associated Projects before deleting this Client."*
- Empty client: `deleteClientGraphEdges` cascades junction rows + `resourceShares`

## Primary parent reassignment

| Control | Mutation | Graph sync |
|---------|----------|------------|
| Change Client (project) | `changeProjectClient` | Updates `projects.clientId` + `projectClients` primary link |
| Change Project (loan file) | `changePipelineProject` | Updates `pipeline.projectId` + `clientId`, `resyncPrimaryFileProjectEdgeFromPipeline`, `syncPrimaryFileClientEdge`, `ensurePrimaryLoanClientLink` |

## ACL & ownership

`assertCanDeleteOrReassignHierarchyEntity` (`resourceAccess.ts`):
- Permitted: **resource owner** (`ownerUserId`) OR **org admin/owner role** OR superuser impersonation
- **Denied:** shared editors with edit access but not ownership

Enforced in all delete/reassign mutations — not UI-only.

## UI surfaces

| Component | Location |
|-----------|------------|
| `ClientHierarchySettings` | Hub client expand (Client Focus hierarchy) |
| `ProjectHierarchySettings` | Hub project expand |
| `ChangeFileProjectControl` | Pipeline file workspace header |
| Existing file delete | `PipelineFileWorkspace` danger zone (unchanged path, improved backend cascade) |

All destructive actions use explicit confirmation copy describing consequences.

## Production proof

```bash
cd lender-app
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npx tsx scripts/run-phase15-step7-crud-audit-repair.ts
npm run deploy:prod
npm run auth:validate
```

Report: `migration-reports/phase15-step7-crud-audit-repair.json`

Automated proof creates dummy client/project/file, verifies blocked deletes, reassigns file to alternate project, deletes file (zero edges), then deletes project and client.

## Stop gate

**Do not begin Phase 16** until this report is reviewed. Every hierarchy entity must be safely editable, movable, and deletable by the owner before new domain logic ships.
