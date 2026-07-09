# Phase 33.1 — Tasks page optimization audit (read-only)

**Date:** 2026-05-28  
**Status:** Architectural blueprint only — **no code shipped**  
**Goal:** Reduce cognitive load on `/tasks` via description nesting, collapsed bulk chrome (filters/export), and prominent Q1–Q4 headers — without breaking filter reactivity, search, or matrix prefs.

---

## Executive summary

| Objective | Primary surface | Current state | Risk if done wrong |
|-----------|-----------------|---------------|-------------------|
| **Description nesting** | `TaskRow` in `app/tasks/page.tsx` | Per-row `expanded` local state; descriptions with text **ignore** collapse | Child rows never follow parent collapse; `showDescription` bypasses chevron |
| **Bulk compression** | `TasksPageInner` JSX blocks ~2257–2574 | Four always-open bordered panels; **no** `CollapsibleSection` | Conditional unmount wipes filter UI state; search buried inside filter panel |
| **Quadrant emphasis** | Matrix quadrant header ~2863–2904 | Left-aligned `text-sm font-semibold`; blurb right-truncated | Low — CSS-only if layout preserved |

**Canonical route:** `lender-app/app/tasks/page.tsx` (~3.5k lines). There is **no** separate `components/tasks/TasksPage.tsx` or `TaskCard.tsx` — `TaskRow`, `FragmentRow`, `FlatListSection`, and `DailyPlanSection` are all co-located in the page module.

**Layout shell:** `app/tasks/layout.tsx` (auth only). Scroll owner remains `AppChrome` `<main>` per project scroll rules.

---

## 1. Component architecture audit

### 1.1 Page entry & container

| Piece | Path | Role |
|-------|------|------|
| Route | `app/tasks/page.tsx` | Default export wraps `TasksPageInner` in `ConvexQueryBoundary` |
| Inner shell | `TasksPageInner` → `<div className="space-y-6">` | All page chrome + views |
| Orientation | `OperationalOrientationStrip` | Mode label “Tasks” |
| Deep link | `useSearchParams()` → `?task=` | Opens `TaskDrawer` |
| Data | `useQueries` → `api.tasks.getAll` | Single list; client-side filter/sort/group |

Supporting modules (read-only dependencies, **not** page layout owners):

- `components/TaskDrawer.tsx` — inspector overlay
- `components/TaskNotificationsBell.tsx` — header bell
- `components/OperationalRowShell.tsx` — desktop row grid inside `TaskRow`
- `lib/export/tasksExport.ts`, `lib/tasksPrint.ts` — export/print helpers
- `convex/tasks.ts` — mutations used by page (`patch`, `setQuadrant`, `reorderInQuadrant`, snooze/wake, etc.)

### 1.2 Task row hierarchy

```
TasksPageInner
├── [chrome] orientation, title, add-task form
├── [chrome] view strip | filter panel | print panel | export panel
├── [matrix only] matrix controls (focus, sort, density, expand/collapse Q)
└── view body
    ├── matrix → visibleQuadrants → <section> per Q
    │       └── <ul> → FragmentRow (parent) → TaskRow × (1 + N children)
    ├── today → DailyPlanSection + FlatListSection
    ├── week → FlatListSection
    └── longterm → FlatListSection
```

| Component | Lines (approx.) | Notes |
|-----------|-----------------|-------|
| `TaskRow` | 504–1217 | Single task `<li>`; mobile stack + `OperationalRowShell` desktop |
| `FragmentRow` | 3112–3213 | Parent `TaskRow` + mapped child `TaskRow`s (`isChild`) — **matrix only** |
| `FlatListSection` | 3408+ | Flat `TaskRow` list; **no** parent/child grouping |
| `DailyPlanSection` | 3261+ | Pinned plan + picker; `TaskRow` without children |

### 1.3 Description field vs `isExpanded` (critical gap)

**State:** Each `TaskRow` owns private React state:

```ts
const [expanded, setExpanded] = useState(false);
```

Chevron toggles `expanded` (or `errandRowOpen` for `errands_groceries`). **No prop** from parent; children do not receive `parentExpanded`.

**Visibility rule (non-errand):**

```ts
const showDescription =
  t.type === "errands_groceries"
    ? false
    : expanded || Boolean(t.description?.trim());
```

| `expanded` | Has description text | Description UI |
|------------|----------------------|----------------|
| `false` | no | Hidden |
| `false` | yes | **Still shown** (chevron does not collapse) |
| `true` | any | Shown |

**Conclusion for Phase 33.1:** Descriptions do **not** fully follow row collapse today. The chevron is misleading when body text exists. Parent and child rows do **not** share one `isExpanded` — they are independent instances.

**Errands:** Separate `errandRowOpen` / `errandDetailExpanded` / `errandCollapsedStores`; description block skipped (`showDescription` false). Nesting work is standard tasks + optional subtask policy.

**Subtasks:** `FragmentRow` always renders all visible children; there is **no** “collapse parent hides children” behavior. Subtask descriptions use their own `expanded` state.

**Recommended implementation direction (blueprint):**

1. Change `showDescription` to depend only on `expanded` (and optionally auto-set `expanded` when user focuses empty description — product choice).
2. Lift collapse to `FragmentRow`: `parentExpanded` + `setParentExpanded`; pass `forceDescriptionHidden={!parentExpanded}` to child `TaskRow`s (new optional prop), or hide entire child `<li>` list when parent collapsed (stronger nesting).
3. Persisting parent expanded in `localStorage` is optional; not required for 33.1.

### 1.4 Top-level filtering / export blocks

All live as **sibling** `<div className="rounded-lg border … p-3">` sections inside `TasksPageInner` (not a shared toolbar component).

| Block | `aria-label` / label | Approx. lines | Contents |
|-------|----------------------|---------------|----------|
| View mode | `View mode` | 2257–2291 | Today / Week / Long-term / Matrix toggles + helper copy |
| Filters | `Filter tasks` | 2294–2426 | Type chips, category/assignee selects, **search input**, due today, overdue, snooze cycle, show completed |
| Print selection | `Select tasks for print or copy` | 2428–2510 | Selection count, select all visible, print/copy/share |
| Export | `Export tasks` | 2512–2574 | TSV/CSV/JSON (filtered set) |
| Matrix controls | `Matrix controls` | 2725–2822 | Focus Q, **Sort (Smart…)**, **Density**, expand/collapse all quadrants |

**Collapsible today:** None on the tasks page. `components/CollapsibleSection.tsx` exists (used heavily in pipeline drawer, lenders workspace) but is **not imported** by `app/tasks/page.tsx`.

**Matrix controls placement:** Rendered only when `view === "matrix" && filteredRows.length > 0` — **below** filter/print/export, **above** quadrant grid. Not inside the filter panel.

### 1.5 Quadrant (Q1–Q4) section headers

Rendered inside matrix `visibleQuadrants.map` (~2831–3055).

**Header structure:**

- Outer: `<section>` with rounded border + shadow
- Header row: `<div className="flex w-full items-stretch border-b … bg-muted/50">`
- Collapse control: `<button>` toggles `collapsedQs` via `toggleQuadrantCollapsed` (persisted in `matrixPrefs`)
- Title: `<h2 className="shrink-0 text-sm font-semibold">Q{q}</h2>`
- Count: `<span className="text-xs font-medium text-muted-foreground">({total})</span>`
- Blurb: `<p className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{QUADRANT_BLURB[q]}</p>`
- Color dot: `QUADRANT_BAR[q]` (Tailwind `bg-red-500`, `bg-emerald-500`, etc.)

**Body:** `{!collapsed && (<ul id={q-${q}-list}>…)}` — **conditional unmount** of task list when quadrant collapsed (differs from “hide with CSS”).

**Constants:** `QUADRANT_BLURB`, `QUADRANT_BAR` at top of `page.tsx` (~99–111).

---

## 2. Style & state management audit

### 2.1 Filter / view / selection state (must survive collapse)

| State | Hook | Persisted? | Used by |
|-------|------|------------|---------|
| `typeFilter` | `useState` | No | `applyTaskFilters` → `filteredRows` |
| `categoryFilter` | `useState` | No | same |
| `assigneeFilter` | `useState` | No | same |
| `searchQuery` | `useState` | No | same |
| `dueTodayOnly` | `useState` | No | same |
| `overdueOnly` | `useState` | No | same |
| `snoozeFilter` | `useState` | No | same |
| `showDone` | `useState` | No | same |
| `view` | `useState` | No | Which body renders |
| `selectedIds` | `useState` | No | Print/export selection |
| `matrixPrefs` | `useState` + `localStorage` key `tasks.matrix.prefs.v1` | Yes | sort, density, quadrantFocus, collapsedQs |

**Reactivity chain:** Convex `tasks` → `allRows` → `filteredRows` (memo) → view-specific memos (`byQuadrant`, `todayRows`, etc.) → `TaskRow` props. Collapsing UI must **not** stop queries or clear filter state.

### 2.2 Safe collapse vs destructive unmount

| Pattern | Preserves filter state? | Notes |
|---------|-------------------------|-------|
| `CollapsibleSection` + `animated` + default `lazyMount={false}` | **Yes** | Children stay mounted; `pointer-events-none` when closed |
| `CollapsibleSection` + `animated={false}` + `open={false}` | **No** | Renders `null` — remount on open |
| `CollapsibleSection` + `lazyMount` | **Yes** after first open | First collapse never mounted until opened once |
| Current quadrant `{!collapsed && <ul>}` | N/A (task list) | Remounts `TaskRow`s; loses per-row `expanded` |

**Recommendation for bulk toolbar:** Wrap filter + print + export (+ optionally view strip) in `CollapsibleSection` with `animated`, `defaultOpen={false}`, **`lazyMount={false}`**. Do **not** use `lazyMount` for filter blocks unless product accepts reset-on-first-expand.

### 2.3 Search bar independence

- **State:** `searchQuery` is its own `useState("")` — logically independent from `matrixPrefs`.
- **UI placement:** Today the search `<Input>` sits **inside** the “Filter tasks” panel (second row with category/assignee). Collapsing that entire panel would hide search unless restructured.

**Blueprint:** Extract search (and optionally view toggles) into an **always-visible** row above the collapsible “Filters & tools” section — mirror lenders workspace comment (“search text synced from the bar when Quick search is selected”).

### 2.4 Smart sort & density when bulk UI collapsed

| Control | Location | Persistence |
|---------|----------|-------------|
| Sort (`sortMode`, default `"smart"`) | Matrix controls panel only | `matrixPrefs` / localStorage |
| Density (`comfortable` \| `compact`) | Matrix controls panel only | same |
| Quadrant focus / collapse all | Matrix controls panel only | same |

If matrix controls stay **outside** the collapsed bulk block, they remain visible in matrix view even when filters/export are collapsed — **simplest** approach.

**Alternative (screenshot parity):** Add a slim **“Quick settings”** sticky row (search + sort + density + “Filters” chevron) always visible on matrix view; move full filter/export into collapsed body.

**Non-matrix views:** Sort/density controls are **not rendered** today (only matrix). Collapsing bulk UI does not remove sort/density on Today/Week/Long-term because those controls are absent — no regression.

---

## 3. Safety & dependency analysis

### 3.1 Data binding & mutations

- Row edits call `updateTask` → `api.tasks.patch` with optimistic local `allRows` patch in callback (~1887).
- Collapsing chrome does not affect Convex subscriptions (`useQueries` unchanged).
- Export handlers read `filteredRows` from closure — remain valid while state preserved.

### 3.2 Selection & export

- `selectedIds` survives toolbar collapse if panels stay mounted.
- `selectAllVisible` uses `filteredRows` — still correct.
- Print flow opens new window via `lib/tasksPrint` — no dependency on panel visibility.

### 3.3 Matrix drag-and-drop

- DnD state: `draggingId`, `dragOverQ`, `reorderHoverId` in `TasksPageInner`.
- Collapsing quadrant unmounts rows — aborts in-flight drag if user collapses Q mid-drag (edge case; acceptable).

### 3.4 Mobile & scroll

- Filter panel uses horizontal scroll on small breakpoints (`sm:max-md:overflow-x-auto`).
- Any new collapsible must preserve touch targets (~40px) per Material rules.
- Single scroll owner: `AppChrome` `<main>` — do not add nested full-page scrollports on toolbar.

### 3.5 Tests & smoke touchpoints

| File | Why |
|------|-----|
| `tests/e2e/tasks-drawer.spec.ts` | `/tasks` load + drawer |
| `tests/e2e/smoke.spec.ts` | Route `/tasks` heading |
| `tests/mobile/**` | Shell scroll + route smoke |
| `tests/e2e/surface-scroll.spec.ts` | Scroll owner on `/tasks` |

Add governance mobile check after UI change per `docs/mobile-testing-rules.md`.

---

## 4. Implementation blueprint

### 4.1 Files to modify (implementation phase)

| Priority | File | Changes |
|----------|------|---------|
| **P0** | `lender-app/app/tasks/page.tsx` | Toolbar collapse, description nesting, Q header typography |
| **P0** | `docs/phase33-1-tasks-page-implementation.md` | Ship doc (create when coding) |
| **P1** | `lender-app/components/CollapsibleSection.tsx` | Only if tasks need new variant/props (unlikely) |
| **P2** | Extract `TasksToolbar.tsx` / `TasksQuadrantHeader.tsx` | Optional refactor to shrink page file — not required for 33.1 |

**No backend changes** anticipated for UI-only phase.

### 4.2 Default collapsed top UI — proposed plan

1. **Always visible (above fold):**
   - Page title + notifications (unchanged)
   - Add-task form (unchanged — primary action)
   - **Search** `Input` bound to `searchQuery`
   - **View mode** buttons (Today / Week / Long-term / Matrix) — user switches views without expanding filters
   - Collapsed trigger: “Filters & export” chevron with badge hint (e.g. active filter count)

2. **Inside `CollapsibleSection` (`defaultOpen={false}`, `animated`, `lazyMount={false}`):**
   - Type / category / assignee / due today / overdue / snooze / show completed
   - Print selection strip
   - Export strip

3. **Matrix view — keep outside collapsed block (recommended):**
   - Matrix controls: Focus Q, Sort, Density, Expand/Collapse all Q
   - Rationale: matches screenshot controls; zero extra “quick bar” work

4. **Optional persistence:** `tasks.toolbar.prefs.v1` with `{ bulkOpen: boolean }` in localStorage (mirror `MATRIX_PREFS_KEY`).

### 4.3 Q1–Q4 title styling — proposed Tailwind

Current:

```html
<h2 className="shrink-0 text-sm font-semibold">Q{q}</h2>
```

Target (bold, centered, prominent — adjust after visual QA):

```html
<div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center">
  <h2 className="text-dlc-title-sm font-bold tracking-tight text-foreground">
    Q{q}
  </h2>
  <p className="text-dlc-label-sm font-medium text-muted-foreground">
    {QUADRANT_BLURB[q]}
  </p>
</div>
```

- Move blurb **under** title (centered) instead of `ml-auto truncate` single line.
- Keep color dot + count on sides or above title row for scanability.
- Preserve `aria-expanded`, `aria-controls`, and collapse button hit area.
- Use DLC tokens per `.cursor/rules/material-design-rules.mdc` (`text-dlc-*`, not ad-hoc px).

### 4.4 Description nesting — proposed plan

| Step | Action |
|------|--------|
| 1 | Set `showDescription` to `expanded` only (non-errand). Remove `|| Boolean(t.description?.trim())` auto-show. |
| 2 | Optional UX: if task has description, default `expanded` to `true` on first mount only (one-time), then user collapse sticks. |
| 3 | In `FragmentRow`, add `subtasksOpen` state; parent chevron sets both parent `expanded` and `subtasksOpen`. |
| 4 | When `!subtasksOpen`, do not render child `TaskRow`s (or render collapsed with hidden descriptions). |
| 5 | Align chevron `aria-expanded` with actual visibility. |

**Confirmation statement (current vs target):**

- **Today:** Task descriptions and parent row **do not** share one `isExpanded`; children are independent; populated descriptions ignore parent chevron.
- **Target:** Parent row chevron governs parent description **and** (product decision) visible subtasks; each row still may have its own chevron for subtask description when subtasks are shown.

### 4.5 Verification checklist (post-implementation)

- [ ] Collapse bulk UI → change category filter → expand → filter still applied
- [ ] Search works while bulk collapsed
- [ ] Matrix: Smart sort + Density usable (outside collapsed block or quick bar)
- [ ] Parent collapse hides parent description; child descriptions hidden when parent collapsed
- [ ] Q headers: bold, centered, readable on mobile
- [ ] `npm run qa:governance` + mobile spot check on `/tasks`
- [ ] `npm run deploy:prod` when shipping UI

---

## 5. Related references

- Prior task UX audits: `docs/phase32-1-task-snooze-audit.md`, `docs/phase32-2-task-snooze-implementation.md`
- Scroll: `docs/scroll-architecture-rules.md`, `AppChrome` single-main-scroll
- UI governance: `docs/ui-ux-rules.md`, `docs/material-design-system.md`
- E2E: `lender-app/tests/e2e/tasks-drawer.spec.ts`

---

**Audit constraint honored:** No application code modified in Phase 33.1; this document is the deliverable for implementation planning.
