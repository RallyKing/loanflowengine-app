# Phase 32.3 — Task attempt note enrichment

**Date:** 2026-06-04  
**Status:** Shipped

## Problem

Attempt notes in file and client timelines showed only **Task attempt #N**, without which task was followed up.

## Solution

### Backend

- **Schema:** `pipelineFileNotes.linkedTaskTitle` — denormalized `tasks.title` at attempt time.
- **`tasks.recordTaskAttempt`:** Sets `linkedTaskTitle` from `t.title` when inserting the note.
- **`enrichPipelineFileNoteForViewer`:** Returns `taskName` on all note queries (`getNotesByFileId`, `getNotesByPipelineFileIds`, `getTaskAttemptNotes`). Uses stored title, or live task lookup for legacy rows missing `linkedTaskTitle`.

User attempt body text in `content` is unchanged (only the badge/header is enriched).

### Frontend

- **`lib/pipeline/taskAttemptNoteLabel.ts`:** `formatTaskAttemptNoteLabel(n, taskName)` → `Task attempt #N: {title}`.
- **`NoteThread.tsx`:** Attempt banner uses formatted label with truncate + `title` tooltip.
- **`TaskAttemptAuditDialog.tsx`:** Same label in audit rows.
- **Types / normalize:** `taskName` on `PipelineFileNoteView`.

## Deploy

- `npm run build` — passed
- `npm run convex:deploy:prod` — schema field `linkedTaskTitle`
- `npx vercel deploy --prod --yes --project loanflowengine`

Production: https://dlcfunds.vercel.app (`dpl_FnLKcpGsvtxXFVfXDnUHWhigg2pa`)

## Verify

Log a new attempt on a titled task → timeline badge reads e.g. **Task attempt #2: Follow up on bank statements**. Older attempts without `linkedTaskTitle` still resolve title via `linkedTaskId` on read.
