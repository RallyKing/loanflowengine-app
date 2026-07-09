# UI Audit — Header & Disclosure Systems (Phase 17.0)

**Mode:** READ-ONLY

## Surfaces audited

| Surface | Path | Header structure | Issues | Progressive disclosure candidate |
|---------|------|------------------|--------|--------------------------------|
| **Pipeline hub** | `app/pipeline/PipelinePageClient.tsx` | Search, sort, filters, view mode, bulk, create menu in bordered card | **Oversized** — 2–3 rows on mobile; sort hidden behind scroll-collapse | Move filters to sheet (partial); collapse sort/view to icon rail |
| **Pipeline file workspace** | `components/PipelineFileWorkspaceShell.tsx` | Sticky blurred bar + file title + stage + share entry | High vertical use; many badges | Collapse secondary meta into disclosure |
| **Pipeline file blocks** | `components/PipelineFileWorkspace.tsx` | Per-block headers via drawer registry | Duplicated collapse affordances | `CollapsibleSection` standard |
| **Task drawer** | `components/TaskDrawer.tsx` | `RecordInspectorHeader` + many inline fields | **Very tall** header before scroll body | Move sharing, errand, recurrence to tabs/disclosure |
| **Lender drawer** | `components/LenderDrawer.tsx` | Same inspector pattern | Dense contact fields | Same |
| **Event detail** | `components/events/EventDetailClient.tsx` | Sticky: back link, badges, title input, collaborators, actions | Improved in 3A; still duplicates share in drawer | Collaborator chips → share drawer only |
| **Events list** | `components/events/EventsWorkspaceClient.tsx` | Page title + tabs | OK | — |
| **Tasks page** | `app/tasks/page.tsx` | Filters + view toggles + bulk bar | Crowded on mobile | Overflow menu |
| **Shared page** | `app/shared/page.tsx` | Tab header + filters | OK | — |
| **Lenders workspace** | `app/lenders/LendersWorkspaceClient.tsx` | Sticky filter card | OK | — |
| **Ledger** | `app/ledger/page.tsx` | Sticky toolbar + table | OK | — |
| **Hierarchy breadcrumb** | `components/pipeline/PipelineHierarchyBreadcrumb.tsx` | Used in task drawer + file contexts | Can wrap on mobile | Truncate middle segments |
| **Board header** | `pipeline/PipelineBoardView.tsx` | Column headers per stage | Horizontal scroll | — |
| **Intake / deal** | `components/intake/IntakeEditor.tsx` | Section tabs + sticky subheaders | Heavy | `ProgressiveDisclosureCard` (exists, underused) |
| **App chrome** | `components/AppChrome.tsx` + `MasterHeaderShell` | Global nav, search, notifications | Competes with page sticky | Document z-order |
| **Mobile headers** | `MobileTopNav`, `MobileBottomNav` | Route title + actions | Safe-area gaps | — |

## Duplicated controls

| Control | Appears in | Recommendation |
|---------|------------|----------------|
| Share | File workspace, event detail header + drawer, task drawer | Single entry → inspector/sheet |
| Archive / delete | Event header | OK owner-gated |
| Search | Hub vs global palette | Different scopes — label clearly |
| Stage selector | Hub row + file header | Acceptable if synced |
| Filter | Hub toolbar + mobile filter sheet | Prefer sheet on `md` down |

## Wasted vertical space patterns

1. **Double chrome** — AppChrome header + page sticky header + workspace sticky (file route).
2. **Non-collapsible metadata** — Task drawer assignee, dates, sharing blocks always expanded.
3. **Large padding** — `p-3`/`py-4` stacks on pipeline hub card header.
4. **Banner + sticky** — `ResourceAccessBanner` + sticky title (events, tasks).

## Disclosure primitives available

| Primitive | Path | Usage today |
|-----------|------|-------------|
| `CollapsibleSection` | `components/CollapsibleSection.tsx` | Task drawer, pipeline blocks |
| `ProgressiveDisclosureCard` | `components/m3/ProgressiveDisclosureCard.tsx` | Rare — token-aligned |
| Native `<details>` | Pipeline hub create | One-off |
| Drawer / sheet | RecordInspector, Vaul | Primary mobile pattern |

## Recommended compression sequence (17.1 planning)

1. **Task drawer** — collapse secondary sections by default
2. **Pipeline file shell** — one-line title + overflow meta
3. **Pipeline hub** — icon toolbar on `max-md`
4. **Event detail** — dedupe collaborator display
5. **Intake** — adopt `ProgressiveDisclosureCard` for secondary analysis

## Controls → overflow menu candidates

- Hub: sort, density, export, archived toggle
- Tasks: view mode, filter chips
- File workspace: duplicate, template, print (when enabled)
