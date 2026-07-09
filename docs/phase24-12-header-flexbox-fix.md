# Phase 24.12 — Pipeline header flexbox hard-fix

**Date:** 2026-05-28  
**Track:** B Stabilization  
**Problem:** Phase 24.5.3 added `min-w-0` on the desktop title column but left the triage highlight **stacked below** the file name inside the same flex child. Long task strings still set the column’s intrinsic `min-content` width, pushing the compact header row wider than the viewport and clipping the file title.

## Root cause

Flex items default to `min-width: auto`, which equals the longest unbreakable content width. Without:

1. `min-w-0` on the **triage** flex child,
2. `overflow-hidden` on ancestors, and
3. `truncate` on the task string in the **shared row**,

the triage block expands horizontally and wins the flex negotiation against the file title.

## Fix

### Shared tokens (`lib/pipeline/pipelineHeaderFlex.ts`)

| Token | Role |
|-------|------|
| `pipelineHeaderChromeRootClass` | `w-full max-w-full overflow-hidden` on chrome root |
| `pipelineHeaderCompactRowClass` | Desktop row: `overflow-hidden`, fixed height |
| `pipelineHeaderTitleClusterClass` | `flex-1 min-w-0` cluster for title + triage |
| `pipelineHeaderFileTitleSlotClass` | `shrink-0` + `max-w-[min(52%,16rem)]` + `overflow-hidden` — title stays anchored |
| `pipelineHeaderTriageSlotClass` | `min-w-0 flex-1` — triage may shrink |
| `pipelineHeaderTriageTaskTruncateClass` | `truncate` on task text (desktop inline) |

### `FileWorkspaceTriageHighlight`

- **`layout="inline"`** (desktop): badge `shrink-0` + task `min-w-0 flex-1 truncate` in one row beside the file title.
- **`layout="stacked"`** (mobile): triage below title inside `overflow-hidden` / `max-w-full` wrappers; task wraps with `break-words`.

### `PipelineFileWorkspace.tsx`

- **Desktop (`md+`):** title cluster is a single horizontal flex row (file slot + inline triage), not stacked.
- **Mobile:** title tier and triage slot each get `max-w-full overflow-hidden`.

## Verification

1. Open a file with an extremely long triage task name on desktop — file title remains visible; task shows ellipsis; full text in `title` tooltip on triage container.
2. Same file on mobile — title wraps on tier 1; triage on tier 2 without horizontal page scroll.
3. `npm run build`
4. `npx vercel deploy --prod --yes --project loanflowengine`

**Playwright:** `tests/mobile/pipeline-file-information-hierarchy.spec.ts` asserts triage task bounding box stays within viewport when present.

## Files changed

- `lender-app/lib/pipeline/pipelineHeaderFlex.ts` (new)
- `lender-app/components/pipeline/tasks/FileWorkspaceTriageHighlight.tsx`
- `lender-app/components/PipelineFileWorkspace.tsx`
- `lender-app/tests/mobile/pipeline-file-information-hierarchy.spec.ts`
