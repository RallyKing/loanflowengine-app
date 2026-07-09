# Phase 27.3 — Entity-specific stage grouping (read-only audit & blueprint)

**Date:** 2026-05-28  
**Status:** Audit complete — **no code shipped** (architecture only)  
**Prerequisite:** Phase 27.2 (`groupPipelineRowsByParentStage`, `PipelineHubParentStageHeader`) — `docs/phase26-6-table-stage-headers.md`  
**Hub flat-list audit:** `docs/phase27-1-stage-grouping-blueprint.md`

## Executive summary

Lender, Referral Partner, and Team Member hub projections all render through **one shared `EntitySection` component** in `PipelineHubProjectionView.tsx`. Each entity’s files live on `EntityFocusNode.loans[]` as **`HubLoanNode` wrappers** around full **`PipelineTablePreviewRow`** objects (same `listTablePreview` rows as Phase 27.2). The Phase 27.2 grouping utility is **directly compatible** — extract `loan.row[]`, call `groupPipelineRowsByParentStage`, render nested stage headers **inside** each entity card.

**Recommended approach:** Group **per entity at render time** inside `EntitySection` (not page-level `useMemo` over whole trees). Pass `stageIndex` from `PipelinePageClient` into `PipelineHubProjectionView`. Add a **`variant="nested"`** (or equivalent props) on `PipelineHubParentStageHeader` for inset styling, **non-sticky** behavior, and **entity-scoped DOM ids** to avoid duplicate `id` attributes and sticky bleed across entity cards.

---

## 1. Entity render loops

### Projection entry (`PipelineHubProjectionView.tsx`)

| Mode | `projectionMode` | Outer loop | Inner file loop | `data-testid` |
|------|------------------|------------|-----------------|---------------|
| **Lender** | `"lender"` | `lenderTree.map((n) => …)` | `EntitySection` → `node.loans.map` | `pipeline-hub-projection-lender` / `pipeline-hub-lender` |
| **Referral Partner** | `"referral"` | `referralTree.map((n) => …)` | same `EntitySection` | `pipeline-hub-projection-referral` / `pipeline-hub-referral` |
| **Team Member** | `"team"` | `teamTree.map((n) => …)` | same `EntitySection` | `pipeline-hub-projection-team` / `pipeline-hub-team` |

All three modes (~L508–559) are structurally identical:

```tsx
{lenderTree.map((n) => (
  <EntitySection
    key={n.entityId}
    node={n}
    icon={Landmark}
    expanded={entityExpanded[n.entityId] ?? false}
    onToggle={() => toggleEntity(n.entityId)}
    testId="pipeline-hub-lender"
    fileRowProps={enrichedFileRowProps}
  />
))}
```

(Referral uses `Handshake` + `pipeline-hub-referral`; Team uses `Users` + `pipeline-hub-team`.)

### Shared `EntitySection` (~L73–155)

**Entity header (unchanged):**

- Collapsible card: `rounded-lg border-2 border-border/70 bg-dlc-surface/80 shadow-dlc-1`
- Chevron + icon + **`node.label`** (`text-base font-semibold`)
- Meta: `{fileCount} linked files · {fmtHubFunding(sum)}`

**Nested file list (grouping target):**

```tsx
{showNested && (
  <div className="space-y-2 border-t-2 border-border/50 px-3 pb-3 pt-2">
    {node.loans.map((loan, idx) => (
      <PipelineHubFileRow
        key={loan.row._id}
        row={loan.row}
        stackIndex={idx}
        stackTotal={node.loans.length}
        parentPathLabel={`${node.label} › …`}
        …
      />
    ))}
  </div>
)}
```

**Current mapping:** flat `node.loans.map` — **no** stage sections.  
**Phase 27.3 change location:** replace the inner `node.loans.map` block only (single edit surface for all three entity views).

### Data aggregation upstream (`PipelinePageClient.tsx`)

Trees are built from the same **`filtered`** row set as Loans view:

```text
filtered
  → graphIndex = buildGraphProjectionIndex(filtered)
  → lenderFocusTree  = filterEntityFocusTree(buildLenderFocusTree(graphIndex, { sort, stageIndex }), projectionSearch)
  → referralFocusTree = filterReferralFocusTree(buildReferralFocusTree(…), projectionSearch) [+ filterEntityKey]
  → teamFocusTree    = filterEntityFocusTree(buildTeamFocusTree(…), projectionSearch)
```

Passed into projection view as:

```tsx
<PipelineHubProjectionView
  mode={projectionMode}
  lenderTree={lenderFocusTree}
  referralTree={referralFocusTree}
  teamTree={teamFocusTree}
  fileFlatGrouped={fileFlatGrouped}
  …
/>
```

### How entities get their file lists (`lib/pipeline/graphProjection.ts`)

| Builder | Index source | Node shape |
|---------|--------------|------------|
| `buildLenderFocusTree` | `index.lenderToFileIds` + `lenderLabels` | `EntityFocusNode` |
| `buildReferralFocusTree` | Rebuilt `referralToFileIds` from graph `referrals` (role-gated) | `EntityFocusNode` + role metadata |
| `buildTeamFocusTree` | `index.teamToFileIds` + `teamLabels` | `EntityFocusNode` |

Shared helper `buildEntityFocusNodes`:

- For each `entityId`, `loans = fileNodesForIds(index, fileIds, opts)`
- `fileNodesForIds` pushes `{ row, fundingPriority }` from `index.rowById` (full preview rows)
- Sorts loans: **stage sort** → `compareRowsByStage`; else **funding desc**
- Sorts **entities**: stage sort → `groupMostAdvancedStageWeight(loans)`; else label alpha

**Referral search nuance:** `filterReferralFocusTree` can shrink `node.loans` to matching files only while keeping the partner header — grouping must run on **that post-filter** `node.loans` array (render-time grouping handles this automatically).

---

## 2. Data compatibility with `groupPipelineRowsByParentStage`

### Row type

`HubLoanNode.row` is **`PipelineTablePreviewRow`**, which extends `PipelineListRow` with:

- `stageId?: Id<"organizationPipelineStages">`
- `subStageId?: Id<"organizationPipelineSubStages">`
- `status: string` (legacy / mirrored slug)

Same fields `resolveParentStageId` reads in Phase 27.2. **No Convex or `listTablePreview` changes required.**

### Adapter (one line)

```ts
const rows = node.loans.map((loan) => loan.row);
const grouped = groupPipelineRowsByParentStage(rows, stageIndex);
```

### Stage index availability

`PipelinePageClient` already holds:

```ts
const stageIndex = useOrganizationPipelineStages();
```

`stageIndex` is passed into tree builders for sort but **not** into `PipelineHubProjectionView` today. Phase 27.3 must **thread `stageIndex`** (or a slim `{ stageById, subById, activeStages }` pick) into `EntitySection`.

### Ordering guarantees

| Sort mode | Entity-level loan order (pre-group) | Within-stage order after group |
|-----------|-------------------------------------|--------------------------------|
| `stageAsc` / `stageDesc` | `compareRowsByStage` on full `node.loans` | Stable partition — order preserved inside each bucket |
| Other (e.g. `loanDesc`) | Funding desc | Stable partition — funding order preserved per stage bucket |

Empty parent stages: utility **omits** them — correct inside each entity independently (Lender A may show “Underwriting (3)” while Lender B skips empty “Lead”).

### `stageIndex` loading

When `stageIndex.tree` is empty / bundle loading, mirror Loans view: render flat `node.loans` fallback or skeleton — avoid calling group with incomplete index.

---

## 3. Layout & styling constraints

### Visual hierarchy (target)

```text
[ Entity card — Lender A — text-base semibold, border-2, bg-dlc-surface ]
  ├─ [ Stage header — UNDERWRITING (2) — xs uppercase, muted band ]
  │    ├─ PipelineHubFileRow (3-line hierarchy stack)
  │    └─ PipelineHubFileRow
  └─ [ Stage header — CONFIRM INTEREST (1) ]
       └─ PipelineHubFileRow
```

Entity header must remain the **dominant** tier; stage headers are **secondary** inside the card.

### Wrapper constraints (`EntitySection`)

| Element | Classes | Implication for stage headers |
|---------|---------|-------------------------------|
| Entity card | `rounded-lg border-2 … px-3` on header row only | Nested list uses `px-3 pb-3 pt-2` — headers are **inset**, not full viewport width |
| Nested panel | `border-t-2 border-border/50` | First stage header should use **`border-t-0`** or divider only **between** stage groups to avoid double border with panel top |
| Spacing | `space-y-2` between rows | Use `gap-2` between stage **sections**; `gap-2` between rows within section (match Phase 27.2 / 26.5) |

### Phase 27.2 header risks inside entities

| Risk | Loans view (27.2) | Entity nested (27.3) |
|------|-------------------|----------------------|
| **`sticky top-0`** | Sticks to `#app-main-scroll` while scrolling page | Multiple stickies per page → headers from Entity A can **overlap** Entity B content; sticky **inside** `px-3` does not span card edges |
| **Duplicate DOM `id`** | One `pipeline-hub-stage-{stageId}` per page | Same stage in Lender A + Lender B → **invalid duplicate ids** |
| **`aria-level={2}`** | Page-level section | Should be **`aria-level={3}`** under entity title |
| **Background bleed** | Full-bleed slate bar | Inset bar must not break `rounded-lg` corners — use **`rounded-md`** + `bg-muted/30` or `bg-slate-50/80` **inside** padding |

**Recommendation:** Add `PipelineHubParentStageHeader` props:

```ts
variant?: "page" | "nested";  // default "page"
entityId?: string;            // required when nested — scopes id + data-testid
sticky?: boolean;             // default true for page, false for nested
```

Nested styles (proposed):

- `sticky={false}`
- `className`: `rounded-md border border-border/60 bg-muted/25 py-1.5 px-2` (no full-bleed `-mx`)
- `id={`pipeline-hub-stage-${entityId}-${stageId}`}`
- `aria-level={3}`
- `data-testid="pipeline-hub-entity-stage-header"`

### `PipelineHubFileRow` stack badges

Today: `stackIndex={idx}`, `stackTotal={node.loans.length}` across **all** entity files.

After grouping, a flat index across groups is **misleading** (badge “2 of 5” with a stage header between 1 and 2).

**Options (pick one in implementation):**

| Option | Behavior |
|--------|----------|
| **A (recommended)** | Disable stack rail: `stackTotal={1}` always in entity nested rows |
| **B** | Per stage group: `stackIndex` / `stackTotal` relative to `group.rows.length` only |
| **C** | Keep entity-wide stack (confusing with headers) — **not recommended** |

### `parentPathLabel`

Still prefixed with `node.label` (entity name). Hierarchy stack (26.5) already shows client/project — keep prop for parity; no change required.

### Scroll architecture

- No new scrollports — same as 27.1/27.2 (`AppChrome` `<main>` owner).
- Nested non-sticky headers avoid scroll jank documented in `phase24-4N` / hub sticky audits.

---

## 4. Implementation blueprint

### Files to modify

| File | Change |
|------|--------|
| **`components/pipeline/PipelineHubProjectionView.tsx`** | Pass `stageIndex` into `EntitySection`; replace flat `node.loans.map` with grouped sections + shared `renderEntityFileRow` helper (mirror file-mode `renderFileRow`) |
| **`components/pipeline/PipelineHubParentStageHeader.tsx`** | Add `variant`, `entityId`, scoped `id`, nested styling, optional `sticky` override; mirror on `PipelineHubUnassignedStageHeader` |
| **`app/pipeline/PipelinePageClient.tsx`** | Add prop `stageIndex={stageIndex}` to `PipelineHubProjectionView` |

### Files **not** required (v1)

| File | Reason |
|------|--------|
| `lib/pipeline/groupPipelineRowsByParentStage.ts` | Reuse as-is; optional tiny `groupHubLoansByParentStage(loans: HubLoanNode[], index)` sugar |
| `lib/pipeline/graphProjection.ts` | Entity trees already sorted; grouping is stable partition |
| `convex/*` | Row fields already present |
| `PipelineFileRowHierarchyStack.tsx` | Unchanged |
| `PipelineHubFileRow.tsx` | Props only (`stackTotal` / `stackIndex`) from parent |

### Optional extract (if `EntitySection` grows)

| File | Purpose |
|------|---------|
| `components/pipeline/PipelineHubEntityGroupedLoans.tsx` | `({ node, stageIndex, entityId, fileRowProps })` — keeps `EntitySection` readable |

### Precise grouping insertion point

**Do not** pre-group entire `lenderTree` / `referralTree` / `teamTree` in `PipelinePageClient` (would require extending `EntityFocusNode` and invalidating on every `stageIndex` reference change).

**Do** group inside `EntitySection` when `showNested`:

```tsx
// EntitySection — when expanded
const rows = useMemo(
  () => node.loans.map((l) => l.row),
  [node.loans],
);
const grouped = useMemo(
  () => groupPipelineRowsByParentStage(rows, stageIndex),
  [rows, stageIndex],
);
```

For many entities, `useMemo` per section is acceptable (typical entity count ≪ file count). Alternatively call pure `groupPipelineRowsByParentStage` inline — cost is O(files per entity).

**Alternative (acceptable):** single helper render function without `useMemo` — grouping is cheap for ≤20 files per entity.

### Proposed React structure

```tsx
function EntitySection({ node, stageIndex, … }: {
  node: EntityFocusNode;
  stageIndex: PipelineStageIndex;
  …
}) {
  …
  {showNested && (
    <div className="flex flex-col gap-3 border-t-2 border-border/50 px-3 pb-3 pt-2">
      {groupPipelineRowsByParentStage(
        node.loans.map((l) => l.row),
        stageIndex,
      ).groups.map((group) => (
        <section
          key={`${node.entityId}-${group.parentStageId}`}
          className="flex flex-col gap-2"
          aria-labelledby={`pipeline-hub-stage-${node.entityId}-${group.parentStageId}`}
        >
          <PipelineHubParentStageHeader
            variant="nested"
            entityId={node.entityId}
            id={`pipeline-hub-stage-${node.entityId}-${group.parentStageId}`}
            stage={group.parentStage}
            fileCount={group.rows.length}
            sticky={false}
          />
          <div className="flex flex-col gap-2">
            {group.rows.map((row) => renderEntityFileRow(row, …))}
          </div>
        </section>
      ))}
      {unassigned section with PipelineHubUnassignedStageHeader variant="nested" …}
    </div>
  )}
}
```

`renderEntityFileRow` = current `PipelineHubFileRow` prop block (bulk, stage selector, hierarchy stack unchanged).

### `PipelineHubProjectionView` prop addition

```tsx
export function PipelineHubProjectionView({
  …
  stageIndex: PipelineStageIndex;
}) {
  …
  <EntitySection … stageIndex={stageIndex} … />
}
```

### Testing checklist (implementation phase)

1. **Lender** projection — expand two lenders with files in same parent stage → **independent** stage sections per lender.
2. **Referral** — partner with sub-staged files rolls up under parent header only.
3. **Team** — same; verify member label unchanged.
4. Empty parent stage never shows a header inside an entity card.
5. **Unassigned** tail only when entity has orphan rows.
6. Referral projection search filters loans — grouping reflects filtered subset; counts match visible rows.
7. No duplicate `id` in DOM (inspect `pipeline-hub-stage-{entityId}-{stageId}`).
8. Mobile scroll: no inner scrollport; nested headers do not stick over entity titles.
9. `PipelineFileRowHierarchyStack` still visible without hover.

### Validation commands (implementation phase)

From `lender-app/`:

```bash
npm run build
npm run qa:governance
npm run deploy:prod
```

Document in `docs/phase27-4-entity-stage-headers.md` (or extend `phase26-6` track doc).

---

## 5. Out of scope (Phase 27.3)

| Surface | Reason |
|---------|--------|
| **Loans / file** projection | Shipped in 27.2 (`fileFlatGrouped`) |
| **Client / project** hierarchy | Different components (`PipelineHubHierarchyView`, `ProjectFocusSection`) — separate phase |
| **Task** projection | Task nodes, not `EntitySection` file lists |
| Server-side grouping | Client index already loaded |

---

## 6. Summary table

| Question | Answer |
|----------|--------|
| Where to group? | **`EntitySection`** inner panel, per `node.loans` |
| Utility compatible? | **Yes** — `loan.row` has `stageId` / `subStageId` / `status` |
| How many render sites? | **One** (`EntitySection`) covers Lender + Referral + Team |
| Page-level `useMemo`? | **No** — per-entity grouping at render |
| Header component? | Reuse with **`nested`** variant + scoped ids + **no sticky** |
| Main layout risk? | Duplicate ids, sticky bleed, double top border, stack badge semantics |

---

## Related docs

- `docs/phase27-1-stage-grouping-blueprint.md` — hub list / scroll / virtualizer
- `docs/phase26-6-table-stage-headers.md` — Phase 27.2 shipped behavior
- `docs/governance/runtime-workspace-scroll-authority.md` — scroll ownership
