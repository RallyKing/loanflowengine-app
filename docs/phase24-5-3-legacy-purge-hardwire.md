# Phase 24.5.3 — Legacy purge & File Notes hardwire

**Date:** 2026-05-29  
**Scope:** Pipeline File Notes only.

## Problem

Backend (`pipelineFileNotes`, `pipelineFileNoteLinks`) and UI (`FileNotesBlock` → `NoteThread` / `NoteComposer`) were implemented in Phase 24.5, but users could not see pins/links because:

1. **`fileNotes` drawer block could be hidden** in per-file layout (`layout.hidden`); `buildActiveBlocksForLayout` omitted it from `activeBlockIds`.
2. **`lazyMount`** on the File notes collapsible meant children did not mount until the section was expanded.
3. **Legacy orphan** `PipelineFileNotesField.tsx` (inline `pipeline.notes` editor) still existed in the repo but was **not** wired in the workspace — misleading for audits.

There was **no** alternate `FileNoteThread` or second notes renderer in `PipelineFileWorkspace`; routing was correct when the block was visible.

## Legacy purge

| File | Action |
|------|--------|
| `components/pipeline/blocks/PipelineFileNotesField.tsx` | **Deleted** — legacy `pipeline.notes` inline editor (unused; zero imports) |
| `pipeline.notes` on `pipeline` row | **Unchanged** — export/ledger only; not used in File notes drawer |

**Confirmed:** `PipelineFileWorkspace.tsx` already imported and rendered `FileNotesBlock` at `sid === "fileNotes"` (lines ~2962–2996). No legacy component swap was required in JSX — only visibility guarantees.

## Hardwire changes

### 1. Always include `fileNotes` in active blocks

`lib/pipelineActiveBlocks.ts`

- `ensurePipelineFileNotesBlockActive()` — appends `fileNotes` if layout hid it.
- `getActivePipelineBlockIdsForFile()` — always runs ensure on return.

### 2. Workspace layout & mount

`components/PipelineFileWorkspace.tsx`

- On file open: `unhideDrawerBlockInLayout(..., "fileNotes")` if hidden.
- On file open: `setSectionExpanded("fileNotes", true)` so notes mount immediately.
- Removed `lazyMount` from File notes `CollapsibleSection`.

### 3. Visual proof banner

`components/pipeline/blocks/FileNotesBlock.tsx`

```html
Phase 24.5.3: New Notes Component Active
```

Green bar at top of block; `data-testid="pipeline-file-notes-block"`.

### 4. Data pipe (unchanged, verified)

| Layer | Query / hook |
|-------|----------------|
| Hook | `usePipelineFileNotes` → `api.pipelineFileNotes.getNotesByFileId` |
| Normalizer | `normalizePipelineFileNotes` — `isPinned`, `links[]` |
| UI | `NoteThread`, `NoteComposer` |

No `api.pipelineFileNotes.list` — canonical query is **`getNotesByFileId`**.

### 5. Safety

- `NoteThread`: `note.links ?? []`, `note.attachments ?? []`
- `NoteComposer`: Add link/file only gated by `readOnly` (file edit share); view-only message added

## DOM test IDs

| ID | Purpose |
|----|---------|
| `pipeline-file-notes-block` | Hardwired block root |
| `pipeline-file-notes-composer` | Composer |
| `pipeline-file-notes-thread` | Thread |
| `pipeline-note-add-link` | Add link button |
| `pipeline-notes-section-pinned` | Pinned section |
| `pipeline-notes-section-all` | All Notes section |

## Verification checklist

- [ ] Open any pipeline file → **File notes** section expanded
- [ ] Green **Phase 24.5.3** banner visible
- [ ] **Add link** + **Add file** + pin menu (with edit access)
- [ ] Hard refresh → pin persists
- [ ] Layout settings previously hiding File notes → block still appears

## Production

Deploy after `npm run build` + `npm run deploy:prod` → https://lender-app-zeta.vercel.app
