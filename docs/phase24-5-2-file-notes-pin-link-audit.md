# Phase 24.5.2 — Pipeline File Notes pin & link audit

**Date:** 2026-05-28  
**Scope:** Pipeline File Notes only (`fileNotes` drawer block). No tasks, triage, or hub highlighting.

---

## Architecture (render path)

```
PipelineFileWorkspace (fileNotes collapsible section)
  └── FileNotesBlock          components/pipeline/blocks/FileNotesBlock.tsx
        └── PipelineFileAuditLog   components/pipeline/notes/PipelineFileAuditLog.tsx
              ├── NoteComposer     components/pipeline/notes/NoteComposer.tsx
              └── NoteThread       components/pipeline/notes/NoteThread.tsx
                    └── usePipelineFileNotes   hooks/usePipelineFileNotes.ts
                          └── getNotesByFileId   convex/pipelineFileNotes.ts
```

**Entry:** Expand **File notes** in the file workspace (`#pipeline-block-fileNotes`).  
**Not in scope:** `PipelineTableNotesCell` (quick note only), legacy `PipelineFileNotesField` (`pipeline.notes` string).

---

## Layer-by-layer trace

### 1. Schema — `lender-app/convex/schema.ts`

| Table | Lines | Pin fields | Link fields |
|-------|-------|------------|-------------|
| `pipelineFileNotes` | 3384–3405 | `isPinned?`, `pinnedAt?`, `pinnedBy?` | `attachments[]` (files only) |
| `pipelineFileNoteLinks` | 3407–3417 | — | `noteId`, `url`, `title?` (UI **label**), `createdAt`, `createdBy` |

**Note row shape (DB):**

```ts
{
  organizationId, pipelineFileId, authorUserKey, content,
  attachments?: { storageId, fileName, mimeType, size }[],
  isPinned?: boolean, pinnedAt?: number, pinnedBy?: string
}
```

**Link row shape (DB):** `{ noteId, organizationId, url, title?, createdAt, createdBy }`  
(`title` is the stored label; API also returns `label` alias.)

---

### 2. Convex — `lender-app/convex/pipelineFileNotes.ts`

| Export | Lines | Purpose |
|--------|-------|---------|
| `sortNotesForDisplay` | 217–231 | Pinned first, `pinnedAt` desc; then unpinned, `_creationTime` desc |
| `pinNote` | 345–366 | Sets `isPinned: true`, `pinnedAt`, `pinnedBy` |
| `unpinNote` | 368–389 | Clears pin fields |
| `createNote` | 291–343 | Optional `attachments[]`, `links[]` → inserts note + link rows |
| `addNoteLink` / `removeNoteLink` | 392–443 | Post-hoc link CRUD |
| `getNotesByFileId` | 445–519 | **Query** — sorted notes + joined links + permissions |
| `generateUploadUrl` | 278–289 | File attachments (unchanged) |
| `deleteNote` | 521–552 | Deletes storage + link rows + note |

**Query return shape (per note):** lines 503–516

```ts
{
  _id, _creationTime, content, authorUserKey, authorDisplayName,
  attachments: { storageId, fileName, mimeType, size, url }[],
  links: { _id, url, title?, label?, displayLabel }[],
  isPinned: boolean,
  pinnedAt?: number,
  canDelete: boolean,
  canPin: boolean  // file edit access
}
```

---

### 3. Hook — `lender-app/hooks/usePipelineFileNotes.ts`

| Lines | Behavior |
|-------|----------|
| 44–48 | `useQuery(api.pipelineFileNotes.getNotesByFileId, { pipelineFileId, organizationId, memberUserKey })` |
| 50 | `normalizePipelineFileNotes(raw)` |
| 52–60 | `pinnedNotes` / `unpinnedNotes` filters on `isPinned` |
| 62–71 | Dev-only `window.__DLC_PIPELINE_FILE_NOTES_DEBUG__` |

---

### 4. Types / normalizer

| File | Lines | Role |
|------|-------|------|
| `lib/pipeline/pipelineFileNotesTypes.ts` | 1–43 | `PipelineFileNoteView`, `PipelineFileNoteLinkView` (`url`, `label`, `displayLabel`) |
| `lib/pipeline/normalizePipelineFileNotes.ts` | 1–81 | Guarantees `links: []`, `isPinned: boolean` for React |

---

### 5. `FileNotesBlock` — lines 21–41

Props: `pipelineFileId`, `organizationId`, `memberUserKey`, `blockSettings.rows` → passes through to `PipelineFileAuditLog`.

---

### 6. `PipelineFileAuditLog` — lines 16–47

Renders **New note** (`NoteComposer`) + **History** (`NoteThread`).

---

### 7. `NoteComposer` — lines 54–442

| Feature | Lines | Details |
|---------|-------|---------|
| File attach | 89–153, 240–274, 395–407 | Unchanged upload flow |
| Stage links | 163–179, 276–302 | Multiple links before post |
| Remove staged link | 158–161, 289–297 | X button per chip |
| `createNote` + `links` | 181–207 | `{ url, title? }[]` |
| UI | 408–422 | **Add link** button `data-testid="pipeline-note-add-link"` |

---

### 8. `NoteThread` — lines 69–414

| Feature | Lines | Details |
|---------|-------|---------|
| Link chips | 112–131 | `<a href target="_blank" rel="noopener noreferrer">` |
| File chips | 79–110 | Same tab behavior as before |
| Pin banner | 163–169 | Amber “Pinned note” + `data-testid="pipeline-note-pinned-banner-*"` |
| Pin menu | 215–226 | Pin / Unpin in overflow |
| Sections | 390–403 | **Pinned Notes** (if any), **All Notes** (unpinned) |
| Test IDs | 386–388, 275, 118 | See checklist below |

---

## Answers A–F

| ID | Question | Answer |
|----|----------|--------|
| **A** | Is pinning already supported in Convex? | **Yes** — schema 3400–3402; `pinNote` / `unpinNote` 345–389; no pin count limit. |
| **B** | Is pinning already returned to React? | **Yes** — `getNotesByFileId` returns `isPinned`, `pinnedAt` (511–512); hook normalizes to boolean. |
| **C** | Is the UI rendering pinned notes correctly? | **Yes** — sections, amber banner, `pinnedAt` sort server-side + client split; persists via DB (refresh keeps pin). |
| **D** | Are links already stored? | **Yes** — `pipelineFileNoteLinks` table; `createNote` batch insert 331–338. |
| **E** | Are links already rendered? | **Yes** — `NoteAttachments` maps `note.links` to chips (112–131). |
| **F** | Do links open in a new tab? | **Yes** — `target="_blank"` + `rel="noopener noreferrer"` on link anchors (116–117). |

**Conclusion:** No missing backend feature. Phase 24.5.2 adds `label` API alias, fixes unpinned section title to always **All Notes**, and documents verification.

---

## Implementation details (24.5.2 delta)

1. Query links include `label` (alias of stored `title`).
2. Normalizer maps `label` / `title` → `PipelineFileNoteLinkView.label`.
3. Composer field copy: “Label (optional)”.
4. Unpinned section title always **All Notes** when that section is shown.

---

## DOM test IDs

| Test ID | Element |
|---------|---------|
| `pipeline-file-notes-composer` | Composer root |
| `pipeline-note-add-file` | Add file |
| `pipeline-note-add-link` | Add link |
| `pipeline-note-link-form` | URL/label form |
| `pipeline-note-staged-links` | Pre-post link chips |
| `pipeline-note-post` | Post note |
| `pipeline-file-notes-thread` | Thread root |
| `pipeline-notes-section-pinned` | Pinned Notes section |
| `pipeline-notes-section-all` | All Notes section |
| `pipeline-note-row-{noteId}` | Note row (`data-pinned=true/false`) |
| `pipeline-note-pinned-banner-{noteId}` | Pinned banner |
| `pipeline-note-attachments-{noteId}` | Attachments + links list |
| `pipeline-note-link-{linkId}` | Clickable link chip |

**DevTools (local):** `window.__DLC_PIPELINE_FILE_NOTES_DEBUG__.raw` / `.normalized`

---

## Verification checklist

- [ ] Open file workspace → **File notes** → expand section
- [ ] **Add file** — upload still works; chip appears under posted note
- [ ] **Add link** twice — two staged chips; remove one with X; post — both links render
- [ ] Click link chip — opens new tab
- [ ] Pin two notes — **Pinned Notes** section, newest pin first; refresh — still pinned
- [ ] Unpin one — moves to **All Notes**
- [ ] View-only share: sees pins/links; overflow may hide Pin (requires file edit)

---

## Production

- **Build:** pass (2026-05-29)
- **Convex:** https://basic-anaconda-984.convex.cloud
- **Vercel:** `dpl_J54E8jfKVrfwu2aRATQemKwaKMmR`
- **Alias:** https://lender-app-zeta.vercel.app
