# Phase 24.5.3 — Mobile information hierarchy report (Pipeline File Workspace)

**Date:** 2026-05-28  
**Status:** Complete (code + regression spec)  
**Type:** Mobile-only information-priority correction — not a visual redesign.

## Objective

Ensure **text wins over action buttons** on mobile inside the Pipeline File Workspace: file titles, client names, project names, and task titles remain readable at all lengths.

## Changes summary

### Tiered mobile layouts

1. **File header** — `md:hidden` mobile block: Tier 1 full-width file name + triage highlight; Tier 2 back, badges, stage, actions (`data-testid` tiers).
2. **Task rows** — Tier 1 full-width task title; Tier 2 checkbox, meta, delete. Desktop row layout preserved via `md:flex-row` + hidden duplicate title button.
3. **Hierarchy** — `OperationalOrientationStrip` / `WorkspaceContextAnchor`: wrapped crumbs and full-width `modeLabel` on mobile.

### Desktop flex boundaries (Step 4)

Desktop header title column: `min-w-0 flex-1 basis-0 overflow-hidden`. File name keeps `truncate`; triage highlight task line uses `md:truncate` so long task names do not push the file title off-screen.

### Shared tokens

`lib/pipeline/mobileInformationHierarchy.ts` centralizes mobile wrap vs desktop truncate classes.

## Files modified

| File | Change |
|------|--------|
| `lib/pipeline/mobileInformationHierarchy.ts` | New tokens |
| `components/PipelineFileWorkspace.tsx` | Mobile/desktop header split; desktop flex fix |
| `components/pipeline/tasks/FileTaskTriageFeedRow.tsx` | Mobile two-tier task row |
| `components/pipeline/tasks/FileWorkspaceTriageHighlight.tsx` | Mobile wrap on task title |
| `components/pipeline/tasks/HubTriageHighlightChrome.tsx` | Mobile wrap on badge label |
| `components/ui/OperationalOrientationStrip.tsx` | Mobile wrap crumbs + entity label |
| `components/ui/WorkspaceContextAnchor.tsx` | Mobile wrap back label |
| `components/pipeline/PipelineHierarchyBreadcrumb.tsx` | Mobile crumb wrap + test id |
| `components/pipeline/LinkedClientsEditor.tsx` | Client name wrap |
| `components/pipeline/ClientRelationshipBadge.tsx` | Client name wrap |
| `components/pipeline/blocks/FileContactsBlock.tsx` | Contact name wrap |
| `components/pipeline/notes/NoteThread.tsx` | Author name wrap |
| `tests/mobile/pipeline-file-information-hierarchy.spec.ts` | Regression coverage |

## Viewport test matrix (Step 6)

Validated via Playwright at:

| Width | Portrait | Landscape |
|-------|----------|-----------|
| 320 | ✓ | ✓ |
| 360 | ✓ | ✓ |
| 375 | ✓ | ✓ |
| 390 | ✓ | ✓ |
| 414 | ✓ | ✓ |
| 430 | ✓ | ✓ |

**Manual** (per `docs/mobile-testing-rules.md`): iPhone Safari, Android Chrome, tablet — long names, multiple labels/badges, expanded tasks and notes.

## Regression protection (Step 7)

`tests/mobile/pipeline-file-information-hierarchy.spec.ts` asserts on Mobile Chrome / Mobile Safari projects:

- File title tier visible and in viewport
- Entity label + hierarchy crumbs (when header expanded)
- First task title visible when tasks exist
- No horizontal overflow on document or `pipeline-drawer-scroll`

**Run:**

```bash
cd lender-app
npm run build
npx playwright test tests/mobile/pipeline-file-information-hierarchy.spec.ts --project "Mobile Chrome" --project "Mobile Safari"
```

Requires `APP_AUTH_*` or E2E sandbox creds; optional `E2E_PIPELINE_SCROLL_FILE_ID` for stable file route.

## QA / deploy

- `npm run build` — required before ship
- `npm run qa:governance` — includes full `tests/mobile` suite
- `npm run deploy:prod` — user-facing UI change

## Related docs

- Audit: `docs/phase24-5-3-mobile-layout-audit.md`
- Machine report: `migration-reports/phase24-5-3-mobile-information-hierarchy.json`
- Prior hub/tasks work: `docs/phase24-3A-mobile-information-hierarchy.md`
