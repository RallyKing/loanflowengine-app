# Phase 28.2 — Client-level notes aggregation & creation

**Date:** 2026-05-28  
**Status:** Shipped

## Summary

Hub **Client** projection now includes a collapsible **Client notes** subsection. Users can read a merged, chronologically sorted timeline of notes across all files under a client and compose new notes to a selected file without leaving the Hub.

## Backend

| Export | Module | Behavior |
|--------|--------|----------|
| `getNotesByPipelineFileIds` | `lender-app/convex/pipelineFileNotes.ts` | Accepts `pipelineFileIds[]` + `organizationId` + optional `memberUserKey`. Per-file `by_file` lookup with same ACL checks as `getNotesByFileId`. Merges rows, attaches `pipelineFileId`, `fileName`, `fileTitle`, global `sortNotesForDisplay` (pinned first, then `_creationTime` desc). Caps at 80 unique file IDs. |

Shared enrichment: `enrichPipelineFileNoteForViewer` (used by single-file and multi-file queries).

## Client utilities & hooks

| Path | Role |
|------|------|
| `lib/pipeline/collectClientHubFileOptions.ts` | `HubClientNode` → `{ fileId, fileTitle, projectTitle }[]` for dropdown |
| `lib/pipeline/hubClientNotesExpansion.ts` | `localStorage` key `hubClientNotesExpansion` |
| `hooks/useClientPipelineNotes.ts` | Wraps multi-file query; `"skip"` when `enabled: false` |

## UI

| Component | Role |
|-----------|------|
| `ClientNotesSubsection.tsx` | `HubCollapsibleSubsection` + composer + timeline |
| `ClientScopedNoteComposer.tsx` | File `<select>` + `NoteComposer` |
| `ClientNotesTimeline.tsx` | `NoteCard` with source file badge; pin/delete mutations |
| `NoteThread.tsx` | `NoteCard` exported; optional `sourceFileLabel` |

## Integration

`PipelineHubHierarchyView.tsx` → `ClientSection`: subsection renders when the client cluster is expanded, below the client `RowShell`, above the project list. Convex subscription runs only when the notes accordion is expanded.

## Validation

- `npm run build` (from `lender-app/`)
- `npm run convex:deploy:prod`
- `npm run deploy:prod`

## Architecture notes

- No schema migration: notes remain keyed by `pipelineFileId` only.
- No extra file-list query: file IDs come from the existing hub tree subscription.
- Scroll: subsection uses hub collapse grid; no new full-page scrollport.
