# Phase 24.5 — Pinned pipeline file notes

## Schema (`pipelineFileNotes`)

| Field | Type | Purpose |
|-------|------|---------|
| `isPinned` | optional boolean | Pin state |
| `pinnedAt` | optional number | Sort key (desc among pinned) |
| `pinnedBy` | optional string | User key who pinned |

No cap on pinned count. No admin-only gate.

## Mutations

- `pipelineFileNotes.pinNote` — requires pipeline **edit** access (`assertCanMutatePipelineRow`).
- `pipelineFileNotes.unpinNote` — same gate; clears pin fields.

## Query ordering

`getNotesByFileId` returns notes sorted:

1. Pinned (`isPinned === true`), `pinnedAt` descending  
2. Others, `_creationTime` descending  

## UI (`NoteThread`)

- Overflow menu: **Pin note** / **Unpin note** (when `canPin`), **Delete note** (when `canDelete`).
- Sections: **Pinned Notes** (only if any pinned), then **All Notes** (or **Notes** when none pinned).

## Permissions

| Action | Gate |
|--------|------|
| Pin / unpin | File edit access |
| Delete | Existing note delete policy (author, admin, manager, impersonation) |
