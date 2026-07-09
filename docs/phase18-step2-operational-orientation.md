# Phase 18.2 — Operational Orientation + Cognitive Flow

**Status:** COMPLETE  
**Scope:** UX cognition stabilization only — no schema, ACL, graph backend, hierarchy logic, automation, or AI.

## Objectives delivered

| Step | Deliverable | Status |
|------|-------------|--------|
| 1 | `OperationalOrientationStrip` | **COMPLETE** |
| 2 | `ProjectionModeSwitcher` + hub continuity | **COMPLETE** |
| 3 | `OperationalFilterDrawer` (hub progressive disclosure) | **COMPLETE** |
| 4 | Hierarchy visual rhythm (`hierarchyRhythm.ts` + hub views) | **COMPLETE** |
| 5 | `WorkspaceContextAnchor` (pipeline file workspace) | **COMPLETE** |
| 6 | Operational flow continuity (tokenized transitions, calmer bands) | **PARTIAL** — hub + rows; no route-level animation framework |
| 7 | Mobile hierarchy comprehension (`parentPathLabel`, rhythm rails) | **COMPLETE** |
| 8 | `CollaboratorSharePresentation` (files, tasks, events) | **COMPLETE** |
| 9 | Operational calm pass (orientation replaces chip scatter) | **PARTIAL** — primary surfaces; legacy islands unchanged |
| 10 | Certification doc + migration report | **COMPLETE** |

## New primitives

- **`components/ui/OperationalOrientationStrip.tsx`** — sticky scope/mode/crumbs/filters/search summary; horizontal scroll on narrow viewports.
- **`components/ui/ProjectionModeSwitcher.tsx`** — segmented perspectives with counts and descriptions; session-persisted mode via existing hub state.
- **`components/ui/OperationalFilterDrawer.tsx`** — desktop expandable panel + mobile bottom sheet hook; active filter pills + quick clear.
- **`components/ui/WorkspaceContextAnchor.tsx`** — workspace identity, back link, embedded orientation strip.
- **`components/ui/CollaboratorSharePresentation.tsx`** — unified sharing panel chrome (`CollaboratorListRow`, `CollaboratorPendingChip`).
- **`lib/ui/hierarchyRhythm.ts`** — client/project/loan nesting rails and expansion motion classes.
- **`lib/pipeline/hubProjectionUi.ts`** — projection option labels, descriptions, counts for switcher.

## Surfaces updated

| Surface | Changes |
|---------|---------|
| `PipelinePageClient` | Projection switcher, orientation strip, filter drawer, hub filter pills/crumbs, projection URL continuity |
| `PipelineHubProjectionView` | Deprecated inline switcher re-export; `fileRowParentPath` for mobile path |
| `PipelineHubHierarchyView` / `PipelineHubFileRow` | Hierarchy rhythm rails; `parentPathLabel` on mobile |
| `PipelineFileWorkspace` | `WorkspaceContextAnchor` in header disclosure |
| `PipelineFileSharingSection` | `CollaboratorSharePresentation` |
| `TaskSharingSection` | `CollaboratorSharePresentation` |
| `EventSharingPanel` | `CollaboratorSharePresentation` |
| `EventsWorkspaceClient` | Orientation strip |
| `app/tasks/page.tsx` | Orientation strip |
| `app/shared/page.tsx` | Orientation strip |

## Intentionally unchanged (per charter)

- Convex schema, ACL, sharing mutations, graph projection backend
- `PipelineTableRow` / contacts / intake visual islands
- Event detail header shell (existing disclosure; sharing panel chrome only)
- Board column logic (orientation strip covers board + table)

## Certification criteria

| Criterion | Result |
|-----------|--------|
| Projection continuity improved | Mode switch preserves hub/projection search; clears entity filter only when mode changes |
| Hierarchy comprehension improved | Rhythm rails + mobile parent path on hub rows |
| Orientation preserved across routes | Strip on pipeline, tasks, events, shared |
| Filters progressively disclosed | Hub advanced filters in `OperationalFilterDrawer` |
| Mobile hierarchy cognition improved | Compressed path + scrollable orientation strip |
| Sharing presentation unified | File, task, event panels share `CollaboratorSharePresentation` |
| Workspace context stabilized | Pipeline file `WorkspaceContextAnchor` |
| Operational calm improved | Fewer competing chips; neutral orientation band |

## Validation

From `lender-app/`:

- `npm run convex:codegen`
- `npm run build`
- `npm run convex:deploy:prod`
- `npm run deploy:prod`

## Operator smoke (recommended)

1. **Pipeline hub** — switch projections; confirm search persists; orientation strip shows mode + active filters; open filter drawer on mobile/desktop.
2. **Hierarchy** — expand client → project → loan; rails and parent path visible on mobile file rows.
3. **File workspace** — anchor shows entity + back to hub; scroll unchanged on `[data-pipeline-workspace-scroll]`.
4. **Tasks / Events / Shared** — orientation strip matches scope; no layout regressions on scroll.
5. **Sharing** — file, task drawer, event drawer use consistent titles, owner line, and list chrome.

**STOP** — Phase 18.3 not started.
