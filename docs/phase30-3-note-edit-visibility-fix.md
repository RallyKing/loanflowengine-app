# Phase 30.3 — Note edit visibility fix

## Symptom

Phase 30.2 shipped RBAC (`viewerCanEditPipelineFileNoteContent`), mutation (`updateNoteContent`), and UI (`NoteCard` Edit menu item), but Account Owner/Admin never saw **Edit note** in the ⋯ menu.

## Root cause

**Query projection wire disconnected:** `enrichPipelineFileNoteForViewer` computed `canEditContent` but did **not** include it on the returned object. Queries spread that object to the client, so `canEditContent` was always `undefined` and the frontend normalize step treated it as `false`.

RBAC and `NoteCard` conditionals were correct; the field never left Convex.

## Fix

- `lender-app/convex/pipelineFileNotes.ts` — add `canEditContent` to the enrich return payload.
- `lender-app/lib/pipeline/normalizePipelineFileNotes.ts` — read `r.canEditContent` directly (Convex-inferred type now includes the field).

## Deploy

1. `npm run convex:deploy:prod` (from `lender-app/`)
2. `npm run deploy:prod`

## Verify

Signed-in org owner or admin on a pipeline file notes block: ⋯ menu shows **Edit note**; save updates body via `updateNoteContent`.
