# Phase 19.5 — Audit log single source of truth (data unification)

**Date:** 2026-05-28

## Problem

Phase 19 introduced `pipelineFileNotes` for the drawer audit log while the pipeline table still edited legacy `pipeline.notes` via `patchPipeline`. That split-brain UX hid table edits from the drawer and vice versa.

## Solution

| Surface | Before | After |
|---------|--------|--------|
| Drawer `fileNotes` block | Audit log + legacy `patchField({ notes })` | Audit log only (`pipelineFileNotes`) |
| Table notes column | Inline `PipelineFileNotesField` → `patchPipeline.notes` | `PipelineTableNotesCell`: count + open drawer; optional quick-add → `createNote` |
| `listTablePreview` | `notesDisplay` from `pipeline.notes` | Adds `fileNotesCount` from `pipelineFileNotes` (legacy string kept for export/search) |

## Navigation

- `pipelineDealEditorHref(..., { focusBlock: "fileNotes" })` sets `?block=fileNotes`.
- `PipelineFileWorkspace` expands the File notes section and scrolls to `#pipeline-block-fileNotes`.

## Unchanged (by design)

- `pipeline.notes` column in Convex (historical data; migration later).
- `NoteComposer`, `NoteThread`, storage mutations.
- `pipeline.patch` still accepts `notes` for API/scripts — **no UI** writes it.

## Verification

```bash
cd lender-app
npm run convex:deploy:prod   # schema + functions
npm run build
```

Manual:

1. Table cell shows `Add note` / `N notes` from relational count.
2. Click cell → drawer opens on File notes block.
3. Quick note in table row appears in drawer feed.
4. Drawer post appears in table count after `listTablePreview` refresh.
