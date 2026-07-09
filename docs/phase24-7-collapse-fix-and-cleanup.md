# Phase 24.7 — Workspace collapse fix & UI cleanup

**Date:** 2026-05-29  
**Production target:** `loanflowengine` (paperworkprocessing.com)

## Problems

1. **Collapse chevrons** on pipeline file workspace blocks appeared broken after Phase 24.5.3/24.5.5 hardwiring.
2. **Diagnostic UI** (red OVERRIDE banner, RBAC bypass) still present in production.

## Root causes (collapse)

| Issue | Effect |
|-------|--------|
| `setSectionExpanded` wrapped in `startTransition` | Delayed expand/collapse updates; felt unresponsive |
| `useEffect` forcing `setSectionExpanded("fileNotes", true)` on every file load | Re-opened File notes after user collapsed |
| `ensurePipelineFileNotesBlockActive()` | Forced `fileNotes` into `activeBlockIds` even when layout-hidden (blocked hide, not chevron) |
| Layout hydration race | Server layout could overwrite in-flight user toggles before hydration completed |
| Header extras vs chevron | Settings/badge clicks could interfere with header hit targets |

## Fixes

### Collapse / expand (`PipelineFileWorkspace.tsx`)

- Removed forced `setSectionExpanded("fileNotes", true)` on mount.
- File notes: **default open only when** `expanded.fileNotes` is unset (first open); respects saved `true`/`false`.
- Still **unhides** `fileNotes` if it was in `layout.hidden` (relational notes remain available).
- `setSectionExpanded` updates layout **synchronously** (no `startTransition`).
- `layoutExpandUserDirtyRef` preserves user expand/collapse during layout hydration merge.

### Active blocks (`pipelineActiveBlocks.ts`)

- Removed `ensurePipelineFileNotesBlockActive()` — layout `hidden` is honored again.

### Collapsible UI (`CollapsibleSection.tsx`, `pipelineWorkspaceCard.ts`)

- Chevron `toggle` uses `stopPropagation`.
- `headerRight` wrapped with `stopPropagation` so settings/badge clicks do not steal header toggles.
- Grid collapse uses `transition-[grid-template-rows]` + inner `opacity` transition (respects `motion-reduce`).

### Phase 24.5.5 cleanup

- Removed red **OVERRIDE ACTIVE** banner from `FileNotesBlock.tsx`.
- `PHASE_2455_NOTES_RBAC_OVERRIDE = false` — standard RBAC restored in `NoteComposer` / `NoteThread`.
- View-only users: no Add link / Pin actions; **pins and link chips remain visible** in `NoteThread`.

## Verification

1. Open a pipeline file on paperworkprocessing.com.
2. Collapse **File notes**, **Tasks**, **Deal workspace** — content animates closed; chevron rotates.
3. Expand again — content returns.
4. No red diagnostic banner in File notes.
5. View-only file: see pins/links; composer buttons hidden.

## Deploy

`npm run deploy:prod` from `lender-app/` → `loanflowengine`.
