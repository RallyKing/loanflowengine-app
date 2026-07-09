# Phase 19 — Pipeline audit log: authenticated notes & file storage

**Date:** 2026-05-28

## Goal

Upgrade pipeline **file notes** from a single `pipeline.notes` string into an authenticated, time-stamped audit log with **native Convex file storage** attachments—without breaking existing pipeline row mutations.

## Architecture

| Layer | Artifact |
|-------|----------|
| Schema | `pipelineFileNotes` table (`convex/schema.ts`) |
| Backend | `convex/pipelineFileNotes.ts` |
| UI | `NoteComposer`, `NoteThread`, `PipelineFileAuditLog` |
| Integration | `FileNotesBlock` (drawer) + `PipelineFileWorkspace` |

### Data model (`pipelineFileNotes`)

- `organizationId`, `pipelineFileId`, `authorUserKey`, `content`
- Optional `attachments[]`: `{ storageId, fileName, mimeType, size }`
- Chronology via Convex `_creationTime` (no manual timestamp field)

### API

| Export | Role |
|--------|------|
| `generateUploadUrl` | `ctx.storage.generateUploadUrl()` after pipeline **edit** access check |
| `createNote` | Inserts note; validates storage metadata; author from `ctx.auth` / `memberUserKey` |
| `getNotesByFileId` | Descending feed; resolves author display name + `storage.getUrl` per attachment |

Access control reuses `assertCanReadPipelineRow` / `assertCanMutatePipelineRow` from `resourceAccess.ts`.

### Frontend

- **Drawer (`fileNotes` block):** `PipelineFileAuditLog` when `pipelineFileId` + `organizationId` are present.
- **Table compact cell:** unchanged legacy `PipelineFileNotesField` → `patchPipeline({ notes })`.
- Upload flow: `generateUploadUrl` → `POST` file (see `lib/uploadToConvexStorage.ts`) → stage pills → `createNote`.
- UX: `InlineFieldSync` + `OP_INLINE_SYNC_*` during upload/submit; feed wrapped in `OP_WORKSPACE_ISLAND`.

## What we did not change

- `pipeline.notes` field and `patchField` / table compact editing remain intact.
- No third-party storage (S3, Uploadthing, etc.).

## Verification

```bash
cd lender-app
npm run convex:codegen   # requires Convex project access; updates convex/_generated/api.d.ts
npm run convex:deploy:prod   # push schema + functions before manual PDF test
npm run build
```

If `convex codegen` fails with project access, run `npx convex dev` locally once to regenerate `api.d.ts`, or merge the `pipelineFileNotes` import/entry already added to `convex/_generated/api.d.ts`.

Manual certification (required for phase sign-off):

1. Open a pipeline file drawer → **File notes** section.
2. Attach a test **PDF** via paperclip → wait for staging pill → **Post note**.
3. Confirm entry shows author, formatted time, body, and clickable attachment chip.
4. In Convex dashboard → **Storage**, confirm uploaded blob exists.

## Files touched

- `convex/schema.ts`
- `convex/pipelineFileNotes.ts`
- `components/pipeline/notes/*`
- `components/pipeline/blocks/FileNotesBlock.tsx`
- `components/PipelineFileWorkspace.tsx`
