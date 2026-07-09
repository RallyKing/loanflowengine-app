# Phase 24.5.4 — True legacy purge (text-match elimination)

**Date:** 2026-05-29  
**Scope:** Pipeline File Notes only.

## Rogue file identified

**Fingerprint (user screenshot):**

> Chronological audit log with signed-in authors and file attachments (Convex storage). The pipeline table links here — one source of truth.

**Source:** `lender-app/components/pipeline/notes/PipelineFileAuditLog.tsx` (Phase 19 intro paragraph).

That file was still rendering the legacy marketing copy **above** `NoteComposer` / `NoteThread`, while `FileNotesBlock` only wrapped it with the green banner. Any code path or deploy that mounted `PipelineFileAuditLog` without `FileNotesBlock` showed the old shell with no banner and (on stale bundles) no Add link.

## Actions taken

| Item | Action |
|------|--------|
| `PipelineFileAuditLog.tsx` | **Stripped** — removed all JSX; now re-exports `FileNotesBlock` only |
| `FileNotesBlock.tsx` | **Canonical UI** — banner + `NoteComposer` + `NoteThread` inlined (no middle wrapper) |
| Legacy intro paragraph | **Deleted** (the exact screenshot string) |
| `PipelineFileWorkspace.tsx` | Collapsible description updated (no “chronological audit log” copy) |

## Canonical render chain (after 24.5.4)

```
PipelineFileWorkspace (sid === "fileNotes")
  └── FileNotesBlock  ← only implementation
        ├── Phase 24.5.4 green banner
        ├── NoteComposer (Add file, Add link, Post note)
        └── NoteThread (pins, link chips, attachments)
              └── usePipelineFileNotes → getNotesByFileId
```

`PipelineFileAuditLog` must not render its own UI anymore.

## Visual proof

- `data-testid="pipeline-file-notes-phase-banner"`
- Text: **Phase 24.5.4: New Notes Component Active**

## Verification

1. Open pipeline file → **File notes** section.
2. Green **24.5.4** banner at top (not 24.5.3).
3. No “Chronological audit log with signed-in authors…” paragraph.
4. **Add link** and **Add file** visible (edit access).
5. Hard refresh if CDN cached an older bundle.

## Production

Deploy: `npm run build` + `npm run deploy:prod` → https://lender-app-zeta.vercel.app
