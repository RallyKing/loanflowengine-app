# Phase 30.2 — Admin note editing implementation

**Date:** 2026-05-28  
**Status:** Shipped  
**Follows:** `docs/phase30-1-note-edit-audit.md`

## Summary

Organization **owners** and **administrators** (plus global admins and impersonation) can edit existing pipeline file note body text inline. Standard users and **managers** cannot edit; authors cannot edit their own notes unless they hold admin/owner elevation.

## Backend (`convex/pipelineFileNotes.ts`)

| Export | Purpose |
|--------|---------|
| `viewerCanEditPipelineFileNoteContent` | RBAC gate — global admin, impersonation, `owner`/`admin` membership, assigned RBAC `admin` only |
| `updateNoteContent` | `noteId` + `content` + org args; read file + role check; `patch` content |
| `enrichPipelineFileNoteForViewer` | Adds `canEditContent` on every note row |

**Not allowed:** note author alone, `manager` role, users without org elevation.

## Frontend

| File | Change |
|------|--------|
| `pipelineFileNotesTypes.ts` | `canEditContent: boolean` |
| `normalizePipelineFileNotes.ts` | Hydration default `false` |
| `NoteThread.tsx` | `NoteCard` — `isEditing`, `draft`, Edit menu, textarea + Save/Cancel; `NoteThreadInner` wires `updateNoteContent` |
| `ClientNotesTimeline.tsx` | Same mutation + `NoteCardActionHandlers` |

## Validation

- `npm run build` (from `lender-app/`)
- `npm run convex:deploy:prod` — backend mutation
- `npm run deploy:prod` — https://dlcfunds.vercel.app (`dpl_EJpq9sauY8b1mUtMQAQFwGUjKfXL`)

## Manual check

1. As org **owner** or **admin**: open file notes or Client Notes — **Edit note** in ⋯ menu.
2. Inline edit → Save — text persists after refresh.
3. As standard user / **manager**: no Edit menu; direct mutation returns unauthorized.
