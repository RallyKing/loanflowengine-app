# Phase 24.5.5 — RBAC override & cache buster

**Date:** 2026-05-29  
**Scope:** Pipeline File Notes diagnostic override (temporary).

## Problem

After Phase 24.5.4 purged legacy copy, users still could not pin notes or add links in production. Two hypotheses:

1. **Vercel / browser cache** — stale JS bundle served despite deploy.
2. **RBAC lockout** — `ResourceAccessProvider.readOnly` or server `canPin` flags hiding controls.

## Actions taken

### 1. RBAC bypass (frontend)

| File | Change |
|------|--------|
| `lib/pipeline/phase2455NotesOverride.ts` | `PHASE_2455_NOTES_RBAC_OVERRIDE = true` |
| `NoteComposer.tsx` | Ignores `readOnly` when override active — Add file, Add link, Post note always enabled |
| `NoteThread.tsx` | Forces `canPin` / `canDelete` true in UI — ⋮ menu always shows Pin/Unpin |

**Note:** Convex mutations may still reject unauthorized users server-side. This phase proves **UI visibility** only.

### 2. Cache-busting banner

`FileNotesBlock.tsx` renders a red diagnostic banner with:

- Build tag: `24.5.5-OVERRIDE`
- `NEXT_PUBLIC_DLC_GIT_SHA` (deploy SHA)
- `NEXT_PUBLIC_DLC_BUILD_TIME` (deploy timestamp)
- Client `RENDER {ISO timestamp}` set on mount (proves fresh bundle execution)

`data-testid="pipeline-file-notes-phase-banner"`

### 3. Routing double-check

`PipelineFileWorkspace.tsx` `sid === "fileNotes"` maps **only** to `FileNotesBlock` — no alternate component.

## Expected production proof

Open any pipeline file → **File notes**:

1. Red **🚨 OVERRIDE ACTIVE 🚨** banner with SHA + DEPLOY + RENDER timestamps.
2. **Add link** and **Add file** buttons visible and clickable.
3. **⋮** menu on each note shows **Pin note** / **Unpin note**.

If banner is missing → still on cached bundle or wrong surface (hub quick-note cell, not drawer File notes).

## Revert

Set `PHASE_2455_NOTES_RBAC_OVERRIDE = false` in `phase2455NotesOverride.ts`, restore green banner, redeploy.

## Production

`npm run build` + `npm run deploy:prod` → https://lender-app-zeta.vercel.app
