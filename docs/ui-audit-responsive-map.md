# UI Audit — Responsive & Breakpoint Map (Phase 17.0)

**Mode:** READ-ONLY  
**Viewport contract:** `app/layout.tsx` — `device-width`, `initialScale: 1`, `maximumScale: 5`, `viewportFit: cover`, `interactiveWidget: resizes-content`

## Breakpoint baseline

Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px. Pipeline mobile Vaul uses **`md` (768px)** as desktop pass-through threshold (`PipelineWorkspaceMobileVaulFrame`).

## Surface-by-surface audit

### Global chrome

| Surface | Path | Findings | CSS / pattern | Failure modes |
|---------|------|----------|---------------|---------------|
| **App header** | `components/AppChrome.tsx`, `layout/MasterHeaderShell.tsx` | Sticky compression via `useMasterScrollCompression`; SaaS sidebar toggle | `backdrop-blur`, flex-wrap | Icon squeeze < `sm`; impersonation banners stack |
| **Mobile bottom nav** | `components/MobileBottomNav.tsx` | `fixed` bottom + overflow sheet `max-h-[70dvh]` | `safe-area` partial | Sheet under inspector z conflict |
| **Mobile top nav** | `components/layout/MobileTopNav.tsx` | Complements bottom nav | `min-w-0` | Collision with page titles on narrow |
| **Sidebar** | `components/SaasSidebar.tsx`, `UnifiedSidebarRail.tsx` | `overflow-x-hidden` on nav | Fixed width rail | Tablet: `xl` breakpoint for responsive nav sheet |
| **Responsive nav** | `components/navigation/ResponsiveNavProvider.tsx` | Full-screen sheet `xl:` desktop side | `fixed inset-0` | Duplicate nav entry points |

### Pipeline hub

| Surface | Path | Findings | Risk |
|---------|------|----------|------|
| **Hub page** | `app/pipeline/PipelinePageClient.tsx` | Dense toolbar: search + sort + filters + view toggles; `max-w-[11rem]` on sort select; `mobileScrollCollapseGridClass` | **High** — header wraps awkwardly 640–768px |
| **Virtualized table** | `components/pipeline/PipelineHubVirtualizedLists.tsx` | Scroll on `AppChrome` main — correct | Horizontal scroll on wide tables |
| **Table row** | `components/pipeline/PipelineTableRow.tsx` | **12+** `min-w-` / grid columns; inline editors | **Critical** — horizontal overflow, zoom on iOS if inputs < 16px |
| **Hub file row** | `components/pipeline/PipelineHubFileRow.tsx` | Card layout `flex-wrap` | Lower risk |
| **Board view** | `components/pipeline/PipelineBoardView.tsx` | Horizontal board columns | Overflow-x on mobile |
| **Hierarchy view** | `components/pipeline/PipelineHubHierarchyView.tsx` | Tree + indent | Text squeeze on labels |
| **Mobile file card** | `components/pipeline/PipelineHubMobileFileCard.tsx` | Alternate row for narrow | Good pattern — keep |
| **Filter sheet** | `components/pipeline/PipelineHubMobileFilterSheet.tsx` | `md:hidden` only | OK |

### Pipeline file workspace

| Surface | Path | Findings | Risk |
|---------|------|----------|------|
| **Workspace shell** | `components/PipelineFileWorkspaceShell.tsx` | Delegated scroll `[data-pipeline-workspace-scroll]`; sticky header `z-[calc(var(--pipeline-file-sticky-z,20)+2)]` | Sticky + Vaul snap interaction |
| **Workspace body** | `components/PipelineFileWorkspace.tsx` | Large monolith; nested `max-h-[min(50vh,22rem)]` scroll regions | **Nested scroll traps** in block panels |
| **Mobile ops rail** | `components/pipeline/PipelineMobileWorkspaceOpsRail.tsx` | `min-h-[44px]` touch targets | OK |
| **Vaul frame** | `components/PipelineWorkspaceMobileVaulFrame.tsx` | Snap fractions of main | CLS on snap change |

### Tasks

| Surface | Path | Findings | Risk |
|---------|------|----------|------|
| **Tasks page** | `app/tasks/page.tsx` | **16** overflow/min-width hits; nested `max-h-[70vh]` list | Filter drawer + table density |
| **Task drawer** | `components/TaskDrawer.tsx` | `RecordInspectorShell` + many sections | Vertical space; full-screen toggle |

### Events

| Surface | Path | Findings | Risk |
|---------|------|----------|------|
| **Events list** | `components/events/EventsWorkspaceClient.tsx` | `max-w-4xl`, `sm:flex-row` actions | OK post-3A |
| **Event detail** | `components/events/EventDetailClient.tsx` | Sticky header `-mx-3`; share `fixed` `max-w-md` | Share drawer full-width mobile OK; sticky vs banner |

### Shared / lenders / ledger

| Surface | Path | Findings |
|---------|------|----------|
| **Shared workspace** | `app/shared/page.tsx` | Card rows, `dlc-surface` usage |
| **Lenders** | `app/lenders/LendersWorkspaceClient.tsx` | Sticky filter `z-10` |
| **Ledger** | `app/ledger/page.tsx` | Sticky toolbar `z-[2]` + thead `z-[1]` |

### Search & drawers

| Surface | Path | Findings |
|---------|------|----------|
| **Global search** | `components/GlobalSearchPalette.tsx` | Centered panel, `min-h-0` scroll body |
| **Record inspector** | `components/RecordInspectorShell.tsx` | Mobile bottom sheet / desktop right; `useVisualViewportMaxHeightStyle` |
| **Intake** | `components/intake/IntakeEditor.tsx` | **14** overflow hits; absolute dropdown `w-60 max-w-[calc(100dvw-2rem)]` |

## Hardcoded width hotspots

- `PipelinePageClient.tsx` — `max-w-[11rem]` sort select
- `PipelineTableRow.tsx` — column min-widths for 14-column table
- `RecordInspectorShell.tsx` — width 360–720px persisted
- `GlobalSearchPalette` — panel width from anchor
- `hubRowActionPrimitives` — `max-w-md` modals

## Horizontal scroll & zoom triggers

| Trigger | Location | Mitigation (17.1) |
|---------|----------|-------------------|
| Wide data table | Pipeline hub table mode | Sticky column + horizontal scroll container with shadow cues |
| `text-xs` inputs | Inline editors in table | Min 16px font on mobile inputs |
| Negative margin sticky | Event detail header | Prefer padding over `-mx` on sticky |
| `overflow-x-clip` on main | AppChrome | Verify pipeline table doesn't force clip |

## Sticky positioning map

| Component | Sticky rule | Competes with |
|-----------|-------------|---------------|
| AppChrome main scroll | N/A (scroll owner) | — |
| Pipeline hub header | `relative z-10` inner card | Main scroll |
| Pipeline file shell header | `sticky top-0` + CSS var z | Workspace scroll port |
| Event detail header | `sticky top-0 z-10` + HEADER token | AppChrome |
| Ledger / lenders | `sticky top-0` | Page scroll |
| Intake share view | `sticky top-0 z-30` | **Legacy z** |

## Screenshots

Not captured in this automated pass. Manual Phase 17.0 QA should photograph: pipeline table @375px, file workspace + inspector, events share drawer, command palette + help open.

## Severity summary

| Severity | Count (est.) | Top routes |
|----------|--------------|------------|
| Critical | 4 | `/pipeline`, `/pipeline/[fileId]`, `/tasks` |
| High | 8 | Hub header, table row, intake, board |
| Medium | 12+ | Events, shared, settings |
| Low | Remaining | Static pages |
