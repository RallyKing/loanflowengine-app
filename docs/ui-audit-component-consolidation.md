# UI Audit — Component Reuse & Consolidation (Phase 17.0)

**Mode:** READ-ONLY

## Candidate systems vs current state

| Candidate | Exists today? | Location | Duplicate implementations | Migration ease | Impact |
|-----------|---------------|----------|---------------------------|----------------|--------|
| **ActionSuite** | Partial | `ui/hubRowActionPrimitives.tsx` (`HubIconButton`, `HubModalShell`) | Per-row action clusters in table, tasks, events | **Medium** | High on pipeline hub |
| **RowShell** | Partial | `LinkedClientsEditor` `ClientRowShell`; hub file row | Table row, shared row, events list | **Medium** | High |
| **HierarchyRow** | Partial | `PipelineHubHierarchyView` + `HubHierarchy*Actions` | Tree in contacts?, breadcrumb only elsewhere | Hard | Medium |
| **MetadataLine** | Yes | `ownership/ResourceOwnershipLine.tsx` | Inline text in sharing panels | **Easy** | Medium |
| **DisclosureHeader** | Partial | `CollapsibleSection`, `ProgressiveDisclosureCard`, `RecordInspectorHeader` | Native details, custom sticky headers | Medium | High |
| **ResponsiveToolbar** | No | — | `PipelinePageClient` toolbar, tasks filters | Hard | High |
| **OverlayShell** | Partial | `PortalOverlayPanel`, `hubRowActionPrimitives.HubModalShell` | 10+ `fixed inset-0` modals | **Medium** | Critical |
| **WorkspaceHeader** | No | — | Pipeline file shell, event sticky, hub card header | Hard | High |
| **PermissionBanner** | Yes | `ResourceAccessBanner.tsx` | Ad-hoc view-only tooltips | **Easy** | Medium |
| **StickySectionHeader** | No | — | Sticky bars in ledger, lenders, events, file shell | Medium | Medium |

## Duplicate implementation map

### Sharing UX (3 dialects)

| Implementation | Path |
|----------------|------|
| Pipeline file | `PipelineFileSharingSection.tsx` |
| Events | `EventSharingPanel.tsx` |
| Tasks | `TaskSharingSection.tsx` (in drawer) |

**Easiest path:** Extract `CollaboratorShareForm` + `CollaboratorList` presentational; keep Convex mutations in parents.

### Inspector / drawer (1 core, many consumers)

| Consumer | Path |
|----------|------|
| Core | `RecordInspectorShell.tsx` |
| Task | `TaskDrawer.tsx` |
| Lender | `LenderDrawer.tsx` |
| Confirm | `m3/ConfirmActionSheet.tsx` |

**Easiest path:** Fix z-index + tokens on shell only.

### Modal / dialog (4+ patterns)

| Pattern | Files |
|---------|-------|
| HubModalShell | `hubRowActionPrimitives.tsx` |
| Raw fixed inset | Dashboard, AttachmentPreview, ShareManager, NewPipelineFileDialog |
| Portal dropdown | SnoozeMenu, Notifications |

**Easiest path:** Route new modals through `HubModalShell` or `OverlayShell` wrapper.

### Role / ownership badges (3)

| Component | Path |
|-----------|------|
| `ResourceOwnershipBadge` | `ownership/ResourceOwnershipBadge.tsx` |
| `EventCollaboratorRoleBadge` | `events/EventCollaboratorRoleBadge.tsx` |
| Inline share role text | Legacy sharing panels |

**Easiest path:** Unify role enum styling in `lib/resourceCollaboratorUi.ts` + one badge component.

## Highest-impact consolidation opportunities

1. **`RecordInspectorShell` + overlay registry** — fixes task/lender/confirm + z-index for all inspectors
2. **`hubRowActionPrimitives` → `ActionSuite`** — export size variants; adopt in hierarchy + events
3. **`SharedResourceRow` + `PipelineHubFileRow` → `RowShell`** — slots: leading, title, meta, actions
4. **Sharing panels** — single list + form layout
5. **`ProgressiveDisclosureCard`** — replace ad-hoc collapses in task drawer

## Lowest-risk first migrations

1. `EventCollaboratorRoleBadge` → shared role badge token map
2. `ResourceAccessBanner` adoption on any page missing it
3. New modals only via `HubModalShell`
4. Events list rows → `RowShell` (small surface)

## Do-not-consolidate-yet

- `PipelineTableRow.tsx` — inline commit graph; 17.2+ after virtualization stable
- `PipelineFileWorkspace.tsx` — orchestrator; split before visual refactor
- Intake field system — separate program

## Proposed package layout (17.x planning only)

```
components/ui/
  ActionSuite.tsx      # from hubRowActionPrimitives
  RowShell.tsx
  OverlayShell.tsx     # modal + scrim + layer
  WorkspaceHeader.tsx
components/ownership/  # keep MetadataLine, Badge
components/m3/         # ProgressiveDisclosureCard, ConfirmActionSheet
```
