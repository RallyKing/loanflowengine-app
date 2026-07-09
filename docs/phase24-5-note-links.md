# Phase 24.5 — Pipeline file note links

## Table `pipelineFileNoteLinks`

| Field | Type |
|-------|------|
| `noteId` | `Id<"pipelineFileNotes">` |
| `organizationId` | `Id<"organizations">` |
| `url` | string (normalized http/https) |
| `title` | optional string |
| `createdAt` | number |
| `createdBy` | string |

Indexes: `by_note`, `by_org_note`.

## Mutations

- `addNoteLink` — file edit; validates URL via `normalizeAndValidateNoteLinkUrl`.
- `removeNoteLink` — file edit.
- `createNote` — optional `links[]` batch on create.

## URL validation (`lib/pipeline/noteLinkUrl.ts`)

- Trim input; reject empty and `javascript:`.
- Prepend `https://` when host-like without scheme.
- Accept only `http:` / `https:` after `URL` parse.

## UI

**Composer:** **Add file** + **Add link** (title optional, URL required). Links staged beside attachments; submitted with `createNote({ links })`.

**Thread:** Renders under note body with file chips:

- `🔗 {title}` when title set  
- `🔗 {url}` otherwise  

Links open in new tab with `rel="noopener noreferrer"`.

## Cleanup

Deleting a note removes all `pipelineFileNoteLinks` for that note.
