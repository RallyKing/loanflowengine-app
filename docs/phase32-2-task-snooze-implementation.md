# Phase 32.2 — Task attempt / snooze implementation

**Date:** 2026-06-04  
**Status:** Shipped (Convex + Vercel production)

## Summary

Users can log a **follow-up attempt** on a file-linked task: write a note, pick a snooze preset, and suppress hub triage bubbling until wake-up. Attempt notes appear on the file timeline; the attempt counter opens a full audit history.

## Schema

### `tasks`

- `attemptCount` (optional number, default 0 in logic)
- `lastAttemptAt` (optional Unix ms)
- Reuses existing `snoozedUntil` for wake-up (no `snoozeUntil` alias)

### `pipelineFileNotes`

- `noteKind`: `"standard"` | `"attempt"` (legacy rows → standard)
- `linkedTaskId`: optional `Id<"tasks">`
- `attemptNumber`: optional number
- Index: `by_linked_task` on `linkedTaskId`

### `organizationSettings`

- `taskSnoozeDefaults`: `{ timezone, nextMorningHour, nextMorningMinute }`  
  Default: `America/Chicago`, 08:00

## Backend

| API | Role |
|-----|------|
| `tasks.recordTaskAttempt` | Atomic: increment count, set `snoozedUntil`, insert attempt note, activity feed |
| `pipelineFileNotes.getTaskAttemptNotes` | Audit log query (`noteKind === "attempt"`) |
| `organizationSettings.getTaskSnoozeDefaults` | Read org morning preset |
| `organizationSettings.updateTaskSnoozeDefaults` | Admin save |

### Highlight suppression

- `lib/pipeline/triageHighlightParticipation.ts` — skip bubble when `snoozedUntil > nowBucket`
- `lib/taskHighlightEngine.ts` — `isTaskHighlightActive` / hub visibility respect snooze on client rows

Shared preset math: `lib/taskSnoozePresets.ts` (`next_morning`, `3_days`, `5_days`, `1_week`).

## UI

| Surface | Changes |
|---------|---------|
| `FileTaskTriageFeedRow` | True age (`createdAt`), ⚡ attempt badge, Attempt / Snooze button |
| `FileTasksBlock` | Hosts `TaskAttemptSnoozeSheet` + `TaskAttemptAuditDialog` |
| `TaskDrawer` | Same affordances in Schedule section |
| `NoteThread` / `NoteCard` | “Task attempt #N” banner on attempt notes |
| Settings | `OrganizationTaskSnoozeDefaultsPanel` |

Modals use `OperationalOverlayShell` with `align="center"` (MODAL layer) so they do not cover persistent bottom navigation.

## Deploy

1. `npm run build` — passed  
2. `npm run convex:deploy:prod`  
3. `npx vercel deploy --prod --yes --project loanflowengine`

Production: https://dlcfunds.vercel.app (`dpl_DfrDT63BaSdFNDWQUd3VsKTzv86g`)  
Convex: https://basic-anaconda-984.convex.cloud (index `pipelineFileNotes.by_linked_task`)

## Smoke

1. Open a labeled task on a pipeline file → **Attempt / Snooze** → note + preset → save.  
2. Hub file/project/client triage color clears until wake time.  
3. File notes show **Task attempt** badge; timeline includes body text.  
4. Click ⚡ counter → audit dialog lists attempts chronologically.  
5. Settings → Task attempt snooze → change timezone/hour → Next morning preview updates.
