# Phase 24.5.1 — Frontend hydration & UI mapping audit

**Date:** 2026-05-28  
**Issue:** Pins and link chips not visible despite deployed Convex mutations.

## Root cause

There is **no** `FileNoteThread.tsx`. The live path is:

```
FileNotesBlock → PipelineFileAuditLog → NoteThread + NoteComposer
```

`getNotesByFileId` already returns `isPinned`, `pinnedAt`, `links`, and `canPin`. The gap was **frontend mapping discipline**: components inferred types from `useQuery` without a normalizer, pin affordances were subtle, and there was no dev hook to inspect the Convex payload.

## Fixes (24.5.1)

| Layer | File | Change |
|-------|------|--------|
| Types | `lib/pipeline/pipelineFileNotesTypes.ts` | `PipelineFileNoteView`, `PipelineFileNoteLinkView`, Convex `FunctionReturnType` row |
| Normalize | `lib/pipeline/normalizePipelineFileNotes.ts` | Always sets `links: []`, `isPinned: boolean` |
| Query hook | `hooks/usePipelineFileNotes.ts` | Single `useQuery(getNotesByFileId)` + split pinned/unpinned |
| Thread UI | `components/pipeline/notes/NoteThread.tsx` | Amber pin banner, link chips, `data-testid`s |
| Composer | `components/pipeline/notes/NoteComposer.tsx` | Typed `links` on `createNote`, staged link chips |

## Verify in DevTools

1. Open a file workspace → expand **File notes**.
2. In dev builds, console:

   ```js
   window.__DLC_PIPELINE_FILE_NOTES_DEBUG__
   ```

   - `raw[0].isPinned` / `raw[0].links` — server payload  
   - `normalized[0].isPinned` / `normalized[0].links` — UI mapping  

3. Network: Convex WebSocket messages for `pipelineFileNotes:getNotesByFileId` should include `links` and `isPinned`.

4. DOM: `[data-testid="pipeline-note-pinned-banner-…"]`, `[data-testid="pipeline-note-link-…"]`.

## Decision tree

| Symptom | Layer |
|---------|--------|
| JSON lacks `isPinned` / `links` | Query/backend (re-deploy Convex) |
| JSON has fields, DOM empty | React mapping (this phase) |
| Pin menu missing | `canPin` false (file read-only share) — pins from others still render |
