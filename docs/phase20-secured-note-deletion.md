# Phase 20 — Secured note deletion & RBAC

**Date:** 2026-05-28

## Goal

Allow intentional removal of pipeline file audit log entries (wrong attachment, typos) with **server-enforced** permissions and the global destructive confirm portal (Phase 18.9).

## Permission matrix (server-side)

| Actor | `canDelete` / `deleteNote` |
|-------|---------------------------|
| Note author | Yes (own notes, no time limit) |
| Org legacy `owner` / `admin` | Yes |
| Product role `admin` or `manager` (`organizationRoles.key`) | Yes |
| Standard member (non-author) | No — button omitted; mutation throws |

Resolution uses `organizationMembers` + `assignedRoleId` → `organizationRoles.key` (same patterns as `organizationRbac.ts`). Impersonation with org visibility grants delete for compliance operators.

Unauthorized attempts receive:

`Unauthorized: Insufficient permissions to delete this note.`

## Backend (`convex/pipelineFileNotes.ts`)

| Export | Behavior |
|--------|----------|
| `viewerCanDeletePipelineFileNote` | Shared helper for query + mutation |
| `getNotesByFileId` | Adds `canDelete: boolean` per row |
| `deleteNote` | Validates org + file read access; deletes storage blobs inline; deletes note row |

## Frontend

- `NoteThread.tsx` — trash control only when `note.canDelete`; uses `useOperationalConfirm()` + `deletePipelineNoteConfirm()` (portal host, z-index 65 destructive layer).
- `lib/ui/confirmDestructive.ts` — `deletePipelineNoteConfirm()` copy per spec.

## Out of scope

- No grace-period TTL on author deletes (future config).
- `pipeline.notes` legacy field unchanged.

## Verification

```bash
cd lender-app
npm run build
```

Manual: non-author cannot see delete; author/admin/manager can delete with global confirm; Convex Storage blobs removed with note.
