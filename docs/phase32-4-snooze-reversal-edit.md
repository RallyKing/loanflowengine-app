# Phase 32.4 — Snooze reversal & attempt note editing

**Date:** 2026-06-04  
**Status:** Shipped

## Features

### 1. Wake up task (un-snooze)

**Mutation:** `tasks.wakeUpTask`

- Clears `snoozedUntil` on the task.
- Inserts a **standard** pipeline file note: `Task manually reactivated: {taskTitle}` (with `linkedTaskId` / `linkedTaskTitle` when file-linked).
- Appends org activity feed entry (`task_wake`).
- Requires task mutate ACL; file note is best-effort if pipeline write fails.

**UI**

- **Task drawer:** **Wake up task** button when `snoozedUntil > now` (plus Snooze menu “wake” uses same mutation).
- **File task row:** **Wake up** button when snoozed (`FileTaskTriageFeedRow`).

Legacy `tasks.wake` remains (clears snooze only, no file note).

### 2. Edit attempt notes (admin/owner)

**Backend**

- `updateNoteContent` no longer rejects `noteKind === "attempt"`.
- Attempt (and standard) body edits require `viewerCanEditPipelineFileNoteContent` (org owner/admin, global admin, impersonation).
- `enrichPipelineFileNoteForViewer` sets `canEditContent` from that same gate for **attempt** notes so the ⋯ **Edit note** menu appears for admins.

**UI**

- `NoteThread` / `NoteCard` unchanged — already gates on `note.canEditContent`.

## Deploy

- `npm run build` — passed (2026-05-28)
- `npm run convex:deploy:prod` — https://basic-anaconda-984.convex.cloud
- Vercel production `dpl_7Yukxhf2YcVPLRRwGZ84VTmkyebu`

Production: https://dlcfunds.vercel.app

## Smoke

1. Snooze a labeled task → **Wake up** → hub color returns; file timeline shows reactivation note.
2. As org owner, open attempt note ⋯ → **Edit note** → save revised text.
