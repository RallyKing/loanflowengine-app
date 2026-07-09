# UI Audit — Row System Inventory (Phase 17.0)

**Mode:** READ-ONLY

## Purpose

Catalog every **list/table/card row** dialect, action layout, metadata density, and ownership display pattern to plan `RowShell` / `ActionSuite` consolidation in Phase 17.1+.

## Row systems matrix

| Domain | Primary component(s) | Layout model | Actions | Ownership / ACL | Truncation | Hover | Group |
|--------|---------------------|--------------|---------|-----------------|------------|-------|-------|
| **Pipeline table (desktop)** | `pipeline/PipelineTableRow.tsx` | 14-col table cells + inline editors | Inline + icons in cells | `ResourceOwnershipLine` | Per-column `truncate` / `min-w-` | Row highlight via table CSS | **Legacy core** |
| **Pipeline hub card row** | `pipeline/PipelineHubFileRow.tsx` | Flex card, stacked meta | Checkbox + open button | Ownership line + badges | Title `truncate` | `shadow-sm` border card | **Reusable candidate** |
| **Pipeline mobile card** | `pipeline/PipelineHubMobileFileCard.tsx` | Compact card | Touch-first | Badges | Truncate | Border | **Reusable candidate** |
| **Pipeline board card** | `pipeline/PipelineBoardView.tsx` | Kanban card | Open / stage | Status chips | Variable | Shadow-sm | One-off |
| **Hierarchy rows** | `pipeline/PipelineHubHierarchyView.tsx`, `HubHierarchyRowActions.tsx`, `HubHierarchyLoanRowActions.tsx` | Tree indent + row actions | `hubRowActionPrimitives` | Graph badges | Indent | Hover on row | **Partial ActionSuite** |
| **Client rows** | `pipeline/LinkedClientsEditor.tsx` (`ClientRowShell`) | Local shell wrapper | Edit/remove inline | Relationship chips | Name truncate | Muted hover | **Local RowShell** |
| **Task rows** | `app/tasks/page.tsx` (inline) | Table + grouped sections | Drawer open, bulk, snooze | Banner in drawer not row | Mixed | `hover:bg-muted` | **Dangerous divergence** |
| **Event list rows** | `events/EventsWorkspaceClient.tsx` | `divide-y` list items | Link + date | Role in subtitle | Title wrap | None | New — simple |
| **Event inbox rows** | Same | Ideas / invitations | Convert + trash | `isOwner` | — | — | New |
| **Shared workspace** | `shared/SharedResourceRow.tsx` | Flex row + badges | Upgrade/downgrade/revoke | `ResourceOwnershipBadge` + line | Title truncate | Border card | **Reusable candidate** |
| **Search hits** | `GlobalSearchPalette.tsx` | Grouped list | Navigate | Ownership badge on files | Truncate | Keyboard focus | One-off |
| **Lender table** | `LenderTable.tsx` | Data table | Drawer | — | — | Table hover | Legacy |
| **Referral / discover** | `DiscoverLenders.tsx` | Card list | CTA | — | — | — | One-off |
| **Contacts** | `app/contacts/page.tsx` | Large page tables/lists | Many inline | — | Heavy | — | Legacy |
| **Ledger rows** | `app/ledger/page.tsx` | Table | Inline actions | — | — | Sticky thead | Legacy |
| **Activity / operations** | `activity/page.tsx`, `operations/page.tsx` | Simple lists | Link | — | — | — | Low priority |
| **Browse / lenders workspace** | `browse/BrowsePageClient.tsx`, `LendersWorkspaceClient.tsx` | Filter + rows | Varies | — | — | — | Medium |

## Action layout inconsistencies

| Pattern | Where | Issue |
|---------|-------|-------|
| Icon-only `h-8 w-8` | `hubRowActionPrimitives` | Desktop-small; `max-md:h-11` upgrade exists — not universal |
| Text buttons right cluster | Events, shared | Consistent within module |
| Inline `<select>` in row | PipelineTableRow | Breaks mobile layout |
| `details` menu | PipelinePageClient create | Native disclosure — OK |
| Bulk checkbox left | Hub file row, table | Aligned |
| No actions until hover | Table vs card | Inconsistent discoverability |

## Metadata density variance

- **Dense:** `PipelineTableRow` (stage, funding, dates, notes block, momentum stars)
- **Medium:** `PipelineHubFileRow`, `SharedResourceRow`
- **Sparse:** Events list, activity feed

## Ownership display drift

| Display | Files |
|---------|-------|
| `ResourceOwnershipLine` | Pipeline table, hub file row, hierarchy |
| `ResourceOwnershipBadge` | Shared row, search, events (new) |
| `EventCollaboratorRoleBadge` | Events only — **parallel to ownership badges** |
| Plain text `ownerDisplayUsername` | Sharing panels |
| None | Lenders, contacts (varies) |

## Duplicate / forked implementations

1. **Pipeline table row vs hub card row** — same data (`PipelineTablePreviewRow`), different UX.
2. **SharedResourceRow vs EventSharing list items** — same collaborator semantics, different markup.
3. **ClientRowShell vs hub row** — local only.
4. **Tasks page inline rows** — not using hub primitives.

## Grouping for Phase 17

### Reusable candidates (extract / extend)

- `components/ui/hubRowActionPrimitives.tsx` → **ActionSuite** base
- `components/shared/SharedResourceRow.tsx` → **RowShell** + metadata slot
- `components/pipeline/PipelineHubFileRow.tsx` → hub list standard
- `components/pipeline/PipelineHubMobileFileCard.tsx` → responsive variant
- `components/ownership/ResourceOwnershipLine.tsx` + `ResourceOwnershipBadge.tsx` → metadata slot

### Legacy one-offs (migrate last)

- `PipelineTableRow.tsx` (highest risk — inline commit wiring)
- `app/tasks/page.tsx` row markup
- `app/contacts/page.tsx`
- `LenderTable.tsx`

### Dangerous divergence (address early in 17.1)

- **Pipeline table vs hub card** — users see different affordances for same entity
- **Task list vs TaskDrawer header** — disclosure mismatch
- **Role badges** — events vs pipeline share panels

## Missing action suites

- Event section rows — item actions on hover only (no row-level overflow menu)
- Board cards — no bulk/share from card
- Hierarchy client/project rows — actions split across `HubHierarchy*Actions`
