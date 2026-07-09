## Phase 15 Step 10 — Cascade Deletion & Advanced Entity Unlinking

### Goal
Replace Step 7 hard deletion blockers with an owner/admin **cascade delete** workflow, while keeping secondary entity unlinking smooth and protecting the FK primary client.

### Problem (Step 7)
`deleteClient` and `deleteProject` threw when nested children existed. That prevented orphans, but blocked legitimate cleanup when a user wanted to remove an entire branch of the hierarchy.

### Backend — recursive cascade (transactional)
All work runs inside a single Convex mutation (atomic transaction).

#### `forceCascade` flag
- `deleteProject({ forceCascade: true })`
- `deleteClient({ forceCascade: true })`
- Without `forceCascade` and with nested children, mutations throw (API guard — UI must opt in explicitly).

#### Project cascade (`cascadeDeleteProject`)
1. Query all `pipeline` rows with `projectId`.
2. For each file: `deletePipelineGraph` (existing file cleanup — graph edges, shares, tasks, etc.).
3. `deleteProjectGraphEdges` (project junction + capital stack + shares).
4. Delete the `projects` row.

#### Client cascade (`cascadeDeleteClient`)
1. Query all `projects` with `clientId`.
2. For each project:
   - Delete all nested loan files (`deletePipelineGraph`).
   - `deleteProjectGraphEdges` + delete project row.
3. Delete any remaining orphan files still keyed by `clientId` (`by_clientId` index).
4. `deleteClientGraphEdges` + delete `clients` row.

Implementation: `lender-app/convex/hierarchyEntityCleanup.ts` (`cascadeDeleteProject`, `cascadeDeleteClient`).

#### Status queries (counts for UI)
- `getProjectDeleteStatus`: returns `fileCount`, `hasNestedChildren`.
- `getClientDeleteStatus`: returns `projectCount`, `loanFileCount` (deduped across projects + direct FK), `hasNestedChildren`.
- `blocked` is always `false` when the user can delete — cascade is offered instead of a hard stop.

### UI — destructive confirmation
Components:
- `HierarchyCascadeDeleteConfirm` — requires typing **`DELETE`** before enabling confirm.
- `ProjectHierarchySettings` — when `fileCount > 0`, shows:
  > This Project contains [X] active Loan Files. Deleting it will permanently delete the project and all associated files.
- `ClientHierarchySettings` — when nested data exists, shows:
  > This Client contains [X] Projects and [Y] Loan Files. Deleting it will permanently wipe all associated data.

Empty parents (no nested children) use a simpler confirm (no typed word required).

### Secondary entity unlinking
Already enforced in Step 8 / existing mutations:
- **Primary client** (FK `pipeline.clientId`): cannot remove via trash — must use **Change Project**.
- **Secondary clients**: `removeLoanClientLink` deletes `loanClients` + `fileClients` edges.
- **Lenders**: file workspace attach/detach uses indexed edge sync (`removeFileLenderEdge`).
- Project secondary clients: `removeProjectClientLink` blocks FK primary only.

### ACL
Unchanged from Step 7: `assertCanDeleteOrReassignHierarchyEntity` — **owner or org admin only**. Users with edit-only share access cannot cascade-delete parents.

### Automated production proof
`operator/cascadeDeletionProofStep15_10:runCascadeDeletionProofStep15_10`:
- Verifies nested delete requires `forceCascade`.
- Project cascade removes project + file + zero graph edges.
- Client cascade removes client + project + file.
- Secondary client unlink removes junction edges.

Run: `npx tsx scripts/run-phase15-step10-cascade-deletion.ts` (requires `DATA_MIGRATION_ADMIN_SECRET`).

### Manual proof (Joshua session)
1. **Cascade 1:** Dummy Client → Project → File. Delete project from project settings, type `DELETE`, confirm. Project and file gone; no ghost edges.
2. **Cascade 2:** Another dummy hierarchy. Delete client from client settings, type `DELETE`, confirm. Client, project, and file all gone.
3. **Unlink:** Add secondary client to a file; remove via Linked Clients trash; edge gone, no error.

### Validation
- `npm run convex:codegen` — pass
- `npm run build` — pass
- `npm run convex:deploy:prod` — pass
- `npm run deploy:prod` — pass (`https://dlcfunds.vercel.app`)
- `npm run auth:validate` — ALL_CHECKS_PASSED

### Stop gate
Phase 15 Step 10 complete. **STOP** — do not begin Phase 16 until cascade UX is reviewed in production.
