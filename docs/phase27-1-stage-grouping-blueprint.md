# Phase 27.1 — Pipeline Hub stage grouping (read-only audit & blueprint)

**Date:** 2026-05-28  
**Status:** Audit complete — **no code shipped** (architecture only)

## Executive summary

The Pipeline Hub **“Table view”** is not a classic `<table>`; it is `effectiveView === "table"` in `PipelinePageClient.tsx`, which renders **`PipelineHubProjectionView`** over a **single flat subscription** to `api.pipeline.listTablePreview`. The **Loan File / flat list** path is `projectionMode === "file"`, which maps `fileFlatList` → **`PipelineHubFileRow`** (with **`PipelineFileRowHierarchyStack`** inside each row).

**Recommended approach:** group **client-side** in a `useMemo` immediately after `fileFlatList` is built, using the existing **`buildPipelineStageIndex`** / `useOrganizationPipelineStages` bundle to roll sub-stages up to parent stages. Render **non-empty** parent stage sections with a **sticky horizontal header** in `PipelineHubProjectionView` (file mode only for v1). Do **not** change `listTablePreview`, `PipelineFileRowHierarchyStack`, or Convex unless a later perf pass requires denormalized stage labels on rows.

---

## 1. Main table / list render loop

### Entry point

| Layer | File | Role |
|-------|------|------|
| Page shell | `lender-app/app/pipeline/PipelinePageClient.tsx` | Owns hub state, data subscription, filters, sort, projection trees |
| List shell | Same file, `effectiveView === "table"` block (~L2268–2550) | `data-testid="pipeline-hub-hierarchy-shell"`, filters, bulk select |
| Projection router | `lender-app/components/pipeline/PipelineHubProjectionView.tsx` | Switches UI by `projectionMode` |
| **Flat loan list** | `PipelineHubProjectionView`, `mode === "file"` (~L436–469) | `fileFlat.map` → **`PipelineHubFileRow`** |
| Row chrome | `lender-app/components/pipeline/PipelineHubFileRow.tsx` | `OperationalRowShell` + **`PipelineFileRowHierarchyStack`** |
| Legacy grid row | `lender-app/components/pipeline/PipelineTableRow.tsx` | Used only by **`PipelineHubVirtualizedTableRows`** (currently **unwired**; virtualization **disabled**) |

### View mode naming (important)

- **`view` / `effectiveView`:** `"table"` \| `"board"`. Narrow viewports force **`effectiveView === "table"`** (`useNarrowViewport`).
- **`projectionMode`:** `"client"` \| `"project"` \| `"file"` \| … — persisted via `loadHubProjectionMode()`. **Default is `"client"`** (`DEFAULT_HUB_PROJECTION_MODE` in `lib/pipeline/graphProjection.ts`), not `"file"`.
- **“Loan File View”** in product terms = **`projectionMode === "file"`** (label: “Loans” / `ListTree` icon in `hubProjectionUi.ts`).
- **“Table view”** in hub chrome = **`effectiveView === "table"`**, which can show **any** projection mode (client hierarchy, flat files, lender sections, etc.).

### Data source (not graph projection for the flat list)

```text
useQuery(api.pipeline.listTablePreview, listPreviewArgs)
  → rows (live) | cachedRows (offline) | optimisticRows (offline patches)
  → data: PipelineTablePreviewRow[]
  → filtered (useMemo: search, client/project filters, status/stage/momentum, sort)
  → fileFlatList (useMemo)
```

**`listTablePreview`** returns a **flat array** of enriched rows (`PipelineTablePreviewRow` in `lib/pipelineTablePreview.ts`). Hierarchy / lender / task trees are built **client-side** from `filtered` via `buildGraphProjectionIndex` and friends (`lib/pipeline/graphProjection.ts`) — consistent with Phase 13 “single subscription; hierarchy built client-side.”

### `fileFlatList` construction

In `PipelinePageClient.tsx` (~L829–838):

```ts
fileFlatList = filterFileFocusList(
  buildFileFlatList(filtered, { sort, stageIndex }).map((n) => n.row),
  projectionSearch,
);
```

- **`buildFileFlatList`:** dedupes by file id; if `sort` is `stageAsc` \| `stageDesc`, sorts by **`resolveRowStageWeight`** (parent `order * 1000 + sub.order`); else sorts by funding amount desc.
- **`filterFileFocusList`:** projection-local search on file name / hierarchy display fields.

**Render loop (file mode):** `PipelineHubProjectionView` — `fileFlat.map((row) => <PipelineHubFileRow … />)` inside `data-testid="pipeline-hub-projection-file"`.

### Other projections (out of scope for v1 grouping unless specified)

| Mode | Component | File rows |
|------|-----------|-----------|
| `client` | `PipelineHubHierarchyView` | `LoanStackRow` nested under client → project |
| `project` | `ProjectFocusSection` | `PipelineHubFileRow` per project section |
| `lender` / `referral` / `team` | `EntitySection` | `PipelineHubFileRow` under entity |
| `task` | Task focus sections | File context on task nodes |

Phase 27.1 objective (“table/list” + parent stage headers) maps cleanly to **`projectionMode === "file"`** first; nested hierarchy rows can adopt the same helper later.

### Virtualization & pagination

| Concern | Finding |
|---------|---------|
| Virtualizer | `PipelineHubVirtualizedLists.tsx` exists but **`PHASE_24_4N_VELOCITY_SCROLL_FIX.hubVirtualizationDisabled === true`**; component **not imported** anywhere. Hub list is **full DOM map**, not virtualized. |
| Row height | `densityRowHeightPx` (Phase 26.5, 3-line stack) only matters if virtualization is re-enabled with `measureElement`. |
| Pagination | **None** on hub list — all `filtered` rows render (subject to projection search empty state). |
| Scroll owner | `AppChrome` `<main>` (`#app-main-scroll`); hub shell sets `data-scroll-owner="pipeline-hub-list"` **without** nested `overflow-y` (see comment ~L2240). |

**Implication:** Stage **headers can be plain block elements** in the map loop; no virtualizer index math required for v1. If virtualization returns, use a **discriminated union** item list `{ type: 'header', stageId } | { type: 'file', row }` and variable `estimateSize`.

---

## 2. Stage data model audit

### Schema (`lender-app/convex/schema.ts`)

**Parent stages — `organizationPipelineStages`**

- `organizationId`, `name`, `slug`, `color`, `icon`, `order`, `isDefault`, `isArchived`, audit fields.
- Indexed by `by_organization_order`.

**Sub-stages — `organizationPipelineSubStages`**

- `parentStageId: Id<"organizationPipelineStages">` (required FK to parent).
- `name`, `slug`, `order`, `color`, `isArchived`, …
- Indexed `by_parent`, `by_parent_order`.

**File assignment — `pipeline` (via `PipelineListRow`)**

- `stageId?: Id<"organizationPipelineStages">` — parent stage.
- `subStageId?: Id<"organizationPipelineSubStages">` — optional nested stage.
- `status: string` — legacy + mirrored slug: `parentSlug` or `parentSlug::subSlug` (`syncPipelineStatusFromStage` in `convex/organizationPipelineStagesHelpers.ts`).

`listTablePreview` passes through `stageId` / `subStageId` from pipeline docs (`convex/pipeline.ts` list builders).

### Client stage bundle

**Query:** `api.organizationPipelineStages.listForOrganization`  
**Hook:** `useOrganizationPipelineStages()` → `buildPipelineStageIndex(bundle)`:

| Index field | Use |
|-------------|-----|
| `stageById` | Parent stage doc by id |
| `subById` | Sub-stage doc by id |
| `subsByParent` | Sub-stages per parent, ordered |
| `tree` | `{ stage, subStages[] }[]` active parents in funnel order |
| `activeStages` | Non-archived parents sorted by `order` |

Already used in `PipelinePageClient` as `const stageIndex = useOrganizationPipelineStages()` for filters, sort weights, and board columns.

### Resolving top-level parent stage for a file row

**Canonical helper to add (client):** `resolveParentStageId(row, index): Id<"organizationPipelineStages"> | null`

Proposed logic (align with board + sort):

1. If `row.stageId` and `index.stageById.has(row.stageId)` → **`row.stageId`**.
2. Else if `row.subStageId` → `index.subById.get(row.subStageId)?.parentStageId` (handles orphaned/mismatched `stageId` data).
3. Else legacy: `row.status.split("::")[0]` → `index.activeStages.find(s => s.slug === slug)?._id`.
4. Else **`null`** (unassigned).

**Parent label:** `index.stageById.get(parentId)?.name` (e.g. “Confirm Interest”, “Underwriting”).

**Sub-stage roll-up:** Files in any sub-stage under parent P appear in **P’s section** only; sub-stage name stays visible via existing **`PipelineStageSelector`** on the row (unchanged).

**Existing related helpers:**

- `resolveRowStageWeight` — sort key (parent order + sub order).
- `resolveRowStageKey` in `PipelineBoardView.tsx` — board column bucket (parent id string).
- `rowMatchesStageFilters` — stage/sub-stage filter chips.
- `formatPipelineStageCompactLabel(stage, sub)` — compact display string (not needed for section header).

### Board view precedent

`PipelineBoardView` already groups by **parent stage only** (`byStage` useMemo): columns = `stageTree`, rows assigned via `resolveRowStageKey`. Sub-stages do not get separate columns. Empty columns still render “Empty” placeholder — **hub table grouping should differ:** **omit header when zero files** (per product requirement).

### Stage config loading gate

Grouping UI should wait for `stageIndex.tree` (or treat `bundle === undefined` as loading). If `stageTree.length === 0`, show existing empty config message pattern from board (“No pipeline stages configured…”).

---

## 3. Grouping insertion point (server vs client)

### Recommendation: **client-side** (`useMemo` in `PipelinePageClient` or pure lib + memo in projection view)

| Criterion | Client-side | Server-side (`listTablePreview`) |
|-----------|-------------|----------------------------------|
| Stage names / order | Already on client via `listForOrganization` | Would need join + ordering duplicated |
| Filters / search / sort | Already applied in `filtered` / `fileFlatList` | Would duplicate filter logic or split query args |
| Offline / optimistic rows | `optimisticRows` patches list in memory | Convex query won’t see offline patches until sync |
| Subscription model | Matches Phase 13 single `listTablePreview` | Second shape or nested array breaks consumers |
| Empty parent suppression | Trivial after bucket pass | Same, but harder to keep in sync with UI filters |

**Do not group inside `buildFileFlatList`** without also updating `filterFileFocusList` order semantics — prefer:

```text
filtered → buildFileFlatList → filterFileFocusList → groupByParentStage → render
```

### Proposed data shape

```ts
type PipelineHubParentStageGroup = {
  parentStageId: Id<"organizationPipelineStages">;
  parentStage: Doc<"organizationPipelineStages">;
  rows: PipelineTablePreviewRow[];
};

type PipelineHubUnassignedGroup = {
  parentStageId: null;
  label: "Unassigned"; // product decision
  rows: PipelineTablePreviewRow[];
};

// Ordered sections for render:
type PipelineHubStageGroupedFileList = {
  groups: PipelineHubParentStageGroup[];
  unassigned?: PipelineHubUnassignedGroup;
};
```

### Ordering rules

1. **Section order:** `stageIndex.activeStages` (or `tree`) by `order` — same funnel as board columns.
2. **Rows within section:**
   - If `sort` is `stageAsc` \| `stageDesc`: preserve order from `fileFlatList` (already sub-stage ordered within parent).
   - Else: preserve `fileFlatList` relative order inside each bucket (stable partition).
3. **Empty parents:** **Skip** section entirely (no header, no wrapper).
4. **Unassigned:** Optional trailing section if any row resolves `parentStageId === null` — recommend **yes** with muted header so legacy-status files are not dropped silently.

### Interaction with sort & filters

| Feature | Impact |
|---------|--------|
| `stageFilter` / `subStageFilter` | Applied in `filtered` before flat list — groups only contain visible rows |
| `sort: stageAsc` | Flat list globally sorted by weight; grouping partitions without reordering across parents |
| `sort: loanDesc` | Flat list by amount; grouping clusters by parent while keeping amount order within parent |
| `projectionSearch` | Applied before grouping — empty groups impossible if row filtered out |
| Bulk “Select visible” | Uses `filtered.length` — unchanged |

### Risk: `PipelineFileRowHierarchyStack`

Grouping is **orthogonal** — only inserts headers between `PipelineHubFileRow` siblings. **Do not** wrap row content or change row props. `parentPathLabel` on file rows is redundant with hierarchy stack but harmless.

### Risk: scroll / sticky chrome

Hub orientation strip sticky is **conditionally disabled** (`PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.purgeHubSticky`). Stage headers should use:

- `sticky` + `top-0` or offset tied to measured hub chrome when sticky is on.
- `z-index` below modals, above row content; semantic `<section aria-labelledby=…>`.
- `bg-background/95 backdrop-blur` + border-b per DLC surface tokens.

Verify on mobile native document scroll (`data-native-document-scroll`) per `docs/governance/runtime-workspace-scroll-authority.md` — **no nested scrollport** on the list shell.

---

## 4. Implementation blueprint (files & layout)

### Files to add

| File | Purpose |
|------|---------|
| `lender-app/lib/pipeline/groupPipelineRowsByParentStage.ts` | Pure `resolveParentStageId`, `groupPipelineRowsByParentStage(rows, stageIndex, options)` |
| `lender-app/components/pipeline/PipelineHubParentStageHeader.tsx` | Horizontal header: color dot, `stage.name`, optional count, `data-testid` |

### Files to modify (v1)

| File | Change |
|------|--------|
| `lender-app/app/pipeline/PipelinePageClient.tsx` | `fileFlatGrouped = useMemo(() => group…(fileFlatList, stageIndex, { sort }), [fileFlatList, stageIndex, sort])`; pass to projection view |
| `lender-app/components/pipeline/PipelineHubProjectionView.tsx` | `mode === "file"`: nested loop `groups.map` → header + `rows.map(PipelineHubFileRow)` |
| `docs/phase27-2-stage-grouping-implementation.md` | (Future) execution record after build/deploy |

### Files explicitly **not** required for v1

| File | Reason |
|------|--------|
| `convex/pipeline.ts` (`listTablePreview`) | Client grouping sufficient |
| `convex/schema.ts` | Model already supports parent/sub |
| `PipelineFileRowHierarchyStack.tsx` | Row body unchanged |
| `PipelineTableRow.tsx` | Not on hub hot path |
| `PipelineHubVirtualizedLists.tsx` | Disabled |
| `lib/platform-framework/density.ts` | Unless header height triggers clip |

### Optional phase 2

| File | Change |
|------|--------|
| `PipelineHubHierarchyView.tsx` (`LoanStackRow`) | Stage headers inside expanded project stacks |
| `PipelineHubProjectionView.tsx` (`EntitySection` loans) | Group lender/referral file stacks by parent stage |
| E2E `lender-app/e2e/…` | Assert headers visible without hover; empty stage absent |

### React layout structure (file mode)

```tsx
<div data-testid="pipeline-hub-projection-file" className="space-y-4">
  {grouped.groups.map((g) => (
    <section key={g.parentStageId} aria-labelledby={`hub-stage-${g.parentStageId}`}>
      <PipelineHubParentStageHeader
        id={`hub-stage-${g.parentStageId}`}
        stage={g.parentStage}
        fileCount={g.rows.length}
      />
      <div className="space-y-2">
        {g.rows.map((row) => (
          <PipelineHubFileRow key={row._id} row={row} … />
        ))}
      </div>
    </section>
  ))}
  {grouped.unassigned?.rows.length ? (
    <section>…Unassigned header + rows…</section>
  ) : null}
</div>
```

**Header behavior:**

- Full-width bar, parent `color` accent (match `PipelineBoardView` `BoardColumn` header pattern).
- `sticky top-0` (or CSS variable offset) within **`#app-main-scroll`**.
- Include file count badge; optional sub-stage count omitted at header (sub-stage remains on row selector).

### Testing checklist (implementation phase)

1. `projectionMode === "file"`, `sort === stageAsc"` — sections in funnel order; files with sub-stages under correct parent.
2. Parent with zero visible files after filters — **no header**.
3. Sub-stage-only legacy row (`subStageId` set, `stageId` stale) — still rolls up via `sub.parentStageId`.
4. `PipelineFileRowHierarchyStack` still shows title · client, project, lender without hover.
5. Mobile narrow + desktop: scroll one owner, headers don’t create inner scroll.
6. Bulk select / open file / stage change — no regression.
7. Offline optimistic patch updates group membership on next `optimisticRows` / live `rows` tick.

### Validation commands (implementation phase)

From `lender-app/`:

```bash
npm run build
npm run qa:governance
npm run deploy:prod
```

---

## 5. Data mapping reference (sub-stage → parent)

```text
File row (listTablePreview)
  stageId ──────────────► organizationPipelineStages._id  (parent)
  subStageId ───────────► organizationPipelineSubStages._id
                              └─ parentStageId ──► parent stage
  status ───────────────► legacy slug or "parent::sub" mirror

Display header label = parent.name
Row-level detail       = formatPipelineStageCompactLabel(parent, sub)  [unchanged]
Sort weight            = parent.order * 1000 + sub.order             [unchanged]
Board column key       = resolveRowStageKey → parent id              [unchanged]
New group key          = resolveParentStageId → parent id            [new]
```

---

## 6. Open product decisions (confirm before implementation)

1. **Scope:** File flat list only (`projectionMode === "file"`) vs all hub projections that render `PipelineHubFileRow`.
2. **Unassigned bucket:** Show trailing “Unassigned” section vs hide rows / force migration.
3. **Default projection:** Users on `client` mode won’t see grouping until they switch to “Loans” — consider URL default or post-filter hint.
4. **Sticky offset:** Measure hub filter band height when orientation strip sticky is re-enabled.

---

## Related docs

- `docs/phase26-5-table-title-convention.md` — row hierarchy stack (do not break)
- `docs/phase26-3-pipeline-table-hierarchy.md` — table column data (server fields)
- `docs/scroll-architecture-rules.md` / `docs/governance/runtime-workspace-scroll-authority.md` — scroll/sticky
- `lender-app/lib/debug/phase24-4N-velocity-scroll-fix.ts` — virtualization off
