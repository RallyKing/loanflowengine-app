# Phase 37.3.F.7 — Sub-Tab B (Calculators & Tools) Components Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — no code changes  
**Goal:** Map the five legacy analysis calculators (DTI, Loan Comparison, Weighted Interest, Payoff, Day Counter), their persistence surfaces, layout profiles, and migration readiness before mounting them in Tab 3 Sub-Tab B.

**Prerequisite docs:** `docs/phase37-3-subtab-a-audit.md`, `docs/phase37-sandbox-compliance-audit.md`, Phase 37.3.F Sub-Tab A completion (F.5 layout gear + F.6 scenarios composite).

**Canonical legacy host:** `DealAnalysisWorkspace` inside IntakeEditor deal tab `analysis`  
**Tab 3 target shell:** `DealWorkspaceTab.tsx` → `DealWorkspaceCalculatorsFrame` (placeholders today)  
**Circuit breaker prep:** `fileWorkspaceLegacyVisibility.ts` (`LEGACY_DEAL_WORKSPACE_CALCULATOR_SECTION_IDS`, `isLegacyDealWorkspaceCalculatorHidden` — gated on `HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK`, still `false`)

---

## 1. Executive summary

| Calculator | Export / entry | Legacy host | Primary persistence keys | Readiness |
|------------|----------------|-------------|--------------------------|-----------|
| DTI Calculator | `DtiSection` | `DealAnalysisWorkspace` → `DtiSection` | `dtiInstances` (+ legacy `dti`) | **5 / 5** |
| Loan Comparison | `ComparisonSection` | same | `comparisonInstances` (+ legacy `comparison`) | **5 / 5** |
| Weighted Interest | `WeightedInterestSection` | same (currently **hidden** by Phase 37.3.G flag) | `weightedInterestInstances` (+ legacy `weightedInterest` rows) | **3 / 5** |
| Payoff Calculator | `PayoffSection` | same | `payoffInstances` (+ legacy `payoff`) | **4 / 5** |
| Day Counter | `DayCounterSection` | same | `dayCounterInstances` (+ legacy `dayCounter`) | **5 / 5** |

**Recommended migration order:** DTI → Day Counter → Loan Comparison → Payoff → Weighted Interest (policy decision last).

**Highest complexity:** **Weighted Interest** — distinct from Tab 2 `BusinessDebtSection` but shares the `weightedInterest` legacy row array; currently suppressed in analysis workspace by `HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS`.

**Lowest risk:** **Day Counter** — compact grids, no cross-tab imports, no AI assist, pure instance + `update` pattern.

**Layout gear recommendation:** Reuse existing file-scoped **`dealAnalysisLayout`** (`intakeSheets.dealAnalysisLayout`) rather than extending `dealWorkspaceTab3Layout`. It already models order, hidden, and expanded for exactly these five section ids. Sub-Tab A gear can stay on `dealWorkspaceTab3Layout`; Sub-Tab B gear should read/write `dealAnalysisLayout.hidden` (and optionally `expanded`) via `useDealWorkspaceEditor().update`.

---

## 2. Component location map

### 2.1 Orchestrator (legacy shell)

| File | Lines | Role |
|------|-------|------|
| `lender-app/components/intake/DealAnalysisWorkspace.tsx` | 1–351 | Renders all five tools inside deal tab `analysis`; owns `dealAnalysisLayout` read/write, per-tool collapsibles, inner `AnalysisLayoutSettings` panel |
| `lender-app/components/intake/IntakeEditor.tsx` | 127–128, 585–591 | `case "analysis": return <DealAnalysisWorkspace {...props} dealFileKey={String(fileId)} />` |
| `lender-app/components/intake/IntakeEditor.tsx` | 560–594 | Outer accordion `id="deal-workspace-analysis"` wraps entire analysis workspace |

### 2.2 Section exports (`IntakeSections2.tsx`)

| Calculator | Wrapper export | Core implementation | Instance shell |
|------------|----------------|---------------------|----------------|
| DTI | L1110–1134 `DtiSection` | L896–1108 `DtiSectionCore` | `MultiInstanceToolShell` |
| Loan Comparison | L1462–1486 `ComparisonSection` | L1330–1460 `ComparisonSectionCore` | `MultiInstanceToolShell` |
| Weighted Interest | L1733–1757 `WeightedInterestSection` | L1600–1731 `WeightedInterestSectionCore` | `MultiInstanceToolShell` |
| Payoff | L1870–1893 `PayoffSection` | L1761–1868 `PayoffSectionCore` | `MultiInstanceToolShell` |
| Day Counter | L1942–1965 `DayCounterSection` | L1897–1940 `DayCounterSectionCore` | `MultiInstanceToolShell` |

**Related (not Sub-Tab B):** `BusinessDebtSection` L1491–1596 — Tab 2 Deal Info schedule; edits flat `weightedInterest` array directly.

### 2.3 Shared infrastructure

| File | Role |
|------|------|
| `lender-app/components/intake/analysis/MultiInstanceToolShell.tsx` | Multi-instance chrome (add / duplicate / delete / rename); `embedChrome` prop for nested mode |
| `lender-app/lib/intake/analysisInstances.ts` | `normalize*Instances()` — migrates legacy single-object keys to `*Instances` arrays |
| `lender-app/lib/file/dealAnalysisLayoutStorage.ts` | Section ids, labels, layout v1 parse/save helpers |
| `lender-app/lib/intake/dtiCompute.ts` | DTI ratio math |
| `lender-app/lib/intake/comparisonLoanSide.ts` | Loan comparison side metrics |
| `lender-app/lib/intake/weightedInterestBlend.ts` | Weighted rate blend + monthly payment sum |
| `lender-app/lib/intake/finance.ts` | `buildAmortization`, `daysBetween`, formatting |
| `lender-app/lib/file/fileSectionMetrics.ts` | `dealAnalysisToolFieldCount()` for drawer badges |

### 2.4 Tab 3 placeholders (migration target)

| File | Lines | Current state |
|------|-------|---------------|
| `lender-app/components/pipeline/tabs/DealWorkspaceTab.tsx` | 51–75, 387–405 | `CALCULATOR_SECTIONS` + `DealWorkspacePlaceholderSection` per tool |
| `lender-app/lib/pipeline/fileWorkspaceTabRouting.ts` | 26–32 | Stable anchors `pipeline-deal-workspace-calc-*` already defined |

### 2.5 Secondary consumers (must remain functional after migration)

| File | Usage |
|------|--------|
| `lender-app/components/intake/ShareView.tsx` | L369–380 — renders individual section components by share section id (`dti`, `comparison`, etc.), **not** via `DealAnalysisWorkspace` |
| `lender-app/components/intake/ShareManager.tsx` | Share bundles include analysis section ids |

---

## 3. State & data flow

### 3.1 Standard pattern — `{ draft, update }` only

All five calculators implement `DealSectionProps` / `SectionProps`:

```16:21:lender-app/lib/file/dealSectionTypes.ts
export type DealSectionProps = {
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  analysisWorkspaceNested?: boolean;
};
```

**No `useMutation`, `useQuery`, URL search params, or router state** inside `IntakeSections2.tsx` calculator sections.

| Section | Write path | Instance key |
|---------|-----------|--------------|
| DTI | `update("dtiInstances", next)` | `dtiInstances` |
| Comparison | `update("comparisonInstances", next)` | `comparisonInstances` |
| Weighted Interest | `update("weightedInterestInstances", next)` | `weightedInterestInstances` |
| Payoff | `update("payoffInstances", next)` | `payoffInstances` |
| Day Counter | `update("dayCounterInstances", next)` | `dayCounterInstances` |

Each wrapper passes `analysisWorkspaceNested: true` when mounted from `DealAnalysisWorkspace` (tighter `MultiInstanceToolShell` header). Tab 3 should pass the same flag when using the shared `DealWorkspaceCollapsibleSection` outer shell.

### 3.2 Autosave chain

```
Section update(key, value)
  → useDealWorkspaceEditor().update
  → optimistic draft patch + debounced api.pipeline.patchDeal
```

`DealAnalysisWorkspace` additionally persists layout:

```
setLayout(action) → update("dealAnalysisLayout", resolved)
```

`useDealWorkspaceEditor` also merges user default expand mode into `dealAnalysisLayout.expanded` on file open (`useLayoutEffect` ~L191–240).

### 3.3 Legacy single-object fallback

`analysisInstances.ts` `ensureInstanceList()` auto-wraps legacy keys (`dti`, `comparison`, `payoff`, `dayCounter`) into a one-item instance list. Weighted interest special-cases `draft.weightedInterest` row array → `{ rows }` instance data.

### 3.4 Cross-section reads (read-only)

| Tool | Reads from draft (no direct writes) |
|------|-------------------------------------|
| DTI | `incomeRows`, `liabilities`, `deriveIntake()` for linked property/scenario fields |
| Comparison | `deriveIntake().firstLoan` for “Import from Intake: Loans” |
| Weighted Interest | `draft.liabilities` for “Import from liabilities” |
| Payoff | — (self-contained instance data) |
| Day Counter | — (self-contained instance data) |

### 3.5 Convex mutations outside `patchDeal`

**None** inside calculator section components. All persistence is top-level intake sheet fields patched via `patchDeal`.

**Related but separate:** Tab 2 `BusinessDebtSection` uses `contactFirstUpdate` → dual-write path for CRM sync on `weightedInterest` flat array (`borrowerTabWriteAdapter.ts`). The **analysis** weighted-interest **calculator** writes `weightedInterestInstances` only; it does not invoke CRM dual-write directly.

### 3.6 AI assist

| Tool | `DealBlockAiAssistPanel` |
|------|--------------------------|
| DTI | Yes — `blockKind="dti"` (L962–984) |
| Comparison | No |
| Weighted Interest | No |
| Payoff | No |
| Day Counter | No |

Requires `DealWorkspaceAiProvider` ancestor (present on IntakeEditor via `DealWorkspaceAiProvider fileId={fileId}`).

### 3.7 Local / device state quirks

| Mechanism | Scope | Notes |
|-----------|-------|-------|
| `dealAnalysisLayout` on sheet | **Per file**, synced via `patchDeal` | Canonical visibility + expand state |
| `loadDealAnalysisLayout()` / `localStorage` key `dlc.deal-analysis-layout.v1` | Device | One-time migration in `DealAnalysisWorkspace` ~L225–238 when sheet has no v1 layout |
| `AnalysisLayoutSettings` UI copy | Misleading | Says “Saved on this device only” but `onChange` calls `update("dealAnalysisLayout", …)` — **file-scoped** |

---

## 4. Layout & sizing profiles

### 4.1 Summary matrix

| Tool | Wide table | Horizontal scroll wrapper | Multi-column layout | Mobile notes |
|------|------------|---------------------------|---------------------|--------------|
| DTI | No | No | `sm:grid-cols-3/4`; income rows `grid-cols-[1fr_160px_40px]` | Long vertical stack; manageable |
| Loan Comparison | No | No | `lg:grid-cols-2` side-by-side loan cards | Stacks to single column below `lg` |
| Weighted Interest | **Yes** `min-w-[760px]` | `overflow-x-auto` on table wrapper | 7-column debt grid | **Needs** `min-w-0 max-w-full` parent (same pattern as Hard Money F.4) |
| Payoff | **Yes** `min-w-[720px]` amortization | `max-h-[min(480px,55dvh)] overflow-auto` on schedule | Input grid `sm:grid-cols-3/4` | Schedule scrolls internally — good for Tab 3 |
| Day Counter | No | No | Three `SectionCard`s × `sm:grid-cols-3` | Compact |

### 4.2 Weighted Interest vs Business Debt (Phase 37.3.G)

| Aspect | `WeightedInterestSection` (analysis) | `BusinessDebtSection` (Deal Info Tab 2) |
|--------|--------------------------------------|----------------------------------------|
| Location today | Deal tab `analysis` (hidden when `isLegacyBusinessDebtAnalysisHidden()`) | `DealInfoTab` → `businessDebt` anchor |
| Data written | `weightedInterestInstances[].data.rows` | flat `weightedInterest[]` |
| Purpose | Blended APR calculator across selected debts | Corporate liability schedule + CRM sync |
| Table | Same ~760px min-width column set | Same pattern L1519–1520 |

**They are related but not identical tools.** Legacy rows on `weightedInterest` hydrate weighted-interest **instances** via `normalizeWeightedInstances`. Tab 2 business debt edits the flat array independently.

### 4.3 Tab 3 container requirements

- Sub-Tab B panel already uses `min-w-0` on `DealWorkspaceCalculatorsFrame`.
- **Weighted Interest:** wrap section body in `min-w-0 max-w-full` (mirror Hard Money migration).
- **Payoff:** inner schedule already owns scrollport — no outer nested scroll needed.
- **Loan Comparison:** `lg:grid-cols-2` needs ~1024px for side-by-side; acceptable stacked layout on mobile/tablet.
- Avoid duplicating `DealAnalysisWorkspace` outer hero + `AnalysisLayoutSettings` if Tab 3 gear menu subsumes visibility (prevents dual layout UIs).

---

## 5. Layout reuse — `dealAnalysisLayout` vs new helper

### 5.1 Schema (Convex)

```553:558:lender-app/convex/intakeSchemaPart.ts
    dealWorkspaceLayout: v.optional(v.any()),
    /** Analysis tab: calculator tool order / visibility (v1 object). */
    dealAnalysisLayout: v.optional(v.any()),
    /** Tab 3 Deal Workspace: Sub-Tab A section visibility (v1 object). */
    dealWorkspaceTab3Layout: v.optional(v.any()),
```

Also patchable via `convex/intakePatchable.ts` → `api.pipeline.patchDeal`.

### 5.2 `dealAnalysisLayout` shape (already production-ready)

```34:40:lender-app/lib/file/dealAnalysisLayoutStorage.ts
export type DealAnalysisLayoutV1 = {
  v: 1;
  order: DealAnalysisSectionId[];
  hidden: DealAnalysisSectionId[];
  expanded: Partial<Record<DealAnalysisSectionId, boolean>>;
};
```

Section ids match Tab 3 routing ids exactly: `dti | comparison | weighted | payoff | daycounter`.

### 5.3 Comparison to Sub-Tab A `dealWorkspaceTab3Layout`

| Feature | Sub-Tab A (`dealWorkspaceTab3Layout`) | Sub-Tab B (existing `dealAnalysisLayout`) |
|---------|---------------------------------------|-------------------------------------------|
| Visibility (`hidden[]`) | Yes | Yes |
| Section order | Fixed menu order in F.5 | Yes — full reorder already implemented |
| Expand/collapse per section | No (CollapsibleSection `defaultOpen={false}` only) | Yes — `expanded` map |
| Gear menu target | Tab 3 SubNav dropdown | Could extend same dropdown when Sub-Tab B active, or split calculator toggles |
| Persistence | Per file | Per file |

**Recommendation:** **Do not** add `dealWorkspaceTab3Layout` keys for calculators. Wire Sub-Tab B gear toggles to `dealAnalysisLayout.hidden` (reuse `parseDealAnalysisLayoutFromUnknown`, `toggle`-style helpers mirroring F.5). Optionally surface reorder later via slim gear submenu or defer reorder to phase 2.

### 5.4 Existing layout consumers

| Consumer | Behavior |
|----------|----------|
| `DealAnalysisWorkspace.tsx` | Full layout UI + visibility filter ~L286–290 |
| `useDealWorkspaceEditor.tsx` | Applies default expand mode to `dealAnalysisLayout.expanded` |
| `PipelineFileWorkspace.tsx` | Bulk collapse/expand drawer sections patches `dealAnalysisLayout` ~L1096–1118 |
| `fileSectionExpandPolicy.ts` | `buildDealAnalysisExpandedForMode()` |

---

## 6. Registry, routing & circuit breaker

### 6.1 Deal tab vs analysis sections

| Layer | Id | Label |
|-------|-----|-------|
| Deal workspace tab (IntakeEditor accordion) | `analysis` | Calculators & tools |
| Inner analysis section ids | `dti`, `comparison`, `weighted`, `payoff`, `daycounter` | See `DEAL_ANALYSIS_SECTION_LABELS` |

Tab 3 Sub-Tab B maps 1:1 to **inner** section ids, not the `analysis` deal tab wrapper.

### 6.2 Tab 3 anchors (`fileWorkspaceTabRouting.ts`)

| Section id | DOM anchor |
|------------|------------|
| `dti` | `pipeline-deal-workspace-calc-dti` |
| `comparison` | `pipeline-deal-workspace-calc-comparison` |
| `weighted` | `pipeline-deal-workspace-calc-weighted` |
| `payoff` | `pipeline-deal-workspace-calc-payoff` |
| `daycounter` | `pipeline-deal-workspace-calc-daycounter` |

Legacy inner anchors inside `DealAnalysisWorkspace`: `deal-analysis-${id}` (L320) — deep links must switch to Tab 3 anchors post-migration.

### 6.3 Circuit breaker status

```117:124:lender-app/lib/pipeline/fileWorkspaceLegacyVisibility.ts
export const LEGACY_DEAL_WORKSPACE_CALCULATOR_SECTION_IDS = [
  "dti",
  "comparison",
  "weighted",
  "payoff",
  "daycounter",
] as const;
```

`isLegacyDealWorkspaceCalculatorHidden()` only applies when `HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK === true` (still **false**). **Incremental migration** (mirror Sub-Tab A) will need:

1. Append `"analysis"` to `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS` (hides whole legacy analysis accordion), **or**
2. Finer-grained per-calculator hiding inside `DealAnalysisWorkspace` / IntakeEditor (not yet implemented).

Sub-Tab A pattern: incremental `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS` list + drawer block filter. Sub-Tab B should follow: migrate calculators individually or flip entire `analysis` tab once all five are live.

### 6.4 Weighted interest special flag

```61:65:lender-app/lib/pipeline/fileWorkspaceLegacyVisibility.ts
export const HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS = true;

export function isLegacyBusinessDebtAnalysisHidden(): boolean {
  return HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS;
}
```

`DealAnalysisWorkspace` ~L274–276, ~L288–289 skips `weighted` when this is true. **Tab 3 migration must explicitly decide:** mount Weighted Interest in Sub-Tab B, keep suppressed, or rename/replace with a calculator-only variant decoupled from business debt schedule.

---

## 7. Section-by-section migration readiness

### 7.1 DTI Calculator — **5 / 5**

| Attribute | Detail |
|-----------|--------|
| Mount | `<DtiSection draft={draft} update={update} analysisWorkspaceNested />` |
| Persistence | `dtiInstances` |
| Layout risk | Low — responsive grids only |
| Dependencies | `deriveIntake`, income/liability import buttons, AI assist panel |
| Blockers | None |

### 7.2 Loan Comparison — **5 / 5**

| Attribute | Detail |
|-----------|--------|
| Mount | `<ComparisonSection ... analysisWorkspaceNested />` |
| Persistence | `comparisonInstances` |
| Layout risk | Low — `lg:grid-cols-2` stacks on narrow viewports |
| Dependencies | Optional import from first loan via `deriveIntake` |
| Blockers | None |

### 7.3 Weighted Interest — **3 / 5**

| Attribute | Detail |
|-----------|--------|
| Mount | `<WeightedInterestSection ... analysisWorkspaceNested />` |
| Persistence | `weightedInterestInstances` (legacy hydrate from `weightedInterest`) |
| Layout risk | **Medium** — 760px min-width table |
| Policy | Currently hidden in legacy analysis by Phase 37.3.G; Tab 2 owns business debt schedule |
| Blockers | Product decision on whether Sub-Tab B exposes this tool; clarify UX vs `BusinessDebtSection` |

### 7.4 Payoff Calculator — **4 / 5**

| Attribute | Detail |
|-----------|--------|
| Mount | `<PayoffSection ... analysisWorkspaceNested />` |
| Persistence | `payoffInstances` |
| Layout risk | **Medium** — wide amortization table, but **internal** scroll container already present |
| Compute | Client-side `buildAmortization` up to 600 rows, displays 360 |
| Blockers | Minor — ensure outer Tab 3 accordion uses `lazyMount` to defer heavy table mount |

### 7.5 Day Counter — **5 / 5**

| Attribute | Detail |
|-----------|--------|
| Mount | `<DayCounterSection ... analysisWorkspaceNested />` |
| Persistence | `dayCounterInstances` |
| Layout risk | Low |
| Blockers | None |

---

## 8. Proposed migration blueprint (F.8+ execution — not in scope for F.7)

### 8.1 Mount pattern (mirror Sub-Tab A F.2–F.4)

For each calculator:

1. Replace `DealWorkspacePlaceholderSection` in `DealWorkspaceCalculatorsFrame`.
2. Wrap in `DealWorkspaceCollapsibleSection` with anchor from `DEAL_WORKSPACE_CALCULATOR_SECTION_IDS`.
3. Pass `{ draft, update, analysisWorkspaceNested: true }` from `useDealWorkspaceEditor()`.
4. Gate render on `!dealAnalysisLayout.hidden.includes(id)` (or shared helper).

**Alternative (fast path):** Mount entire `<DealAnalysisWorkspace dealFileKey={fileId} />` inside Sub-Tab B — **not recommended** (duplicate layout UI, duplicate collapsible shells, hero block noise).

### 8.2 Gear menu extension

When `activeSubTab === "calculators"`:

- Show five checkboxes bound to `dealAnalysisLayout.hidden` (labels from `DEAL_ANALYSIS_SECTION_LABELS`).
- “Reset to defaults” → `defaultDealAnalysisLayout()`.
- Sub-Tab A toggles continue using `dealWorkspaceTab3Layout`.

### 8.3 Circuit breaker activation sequence

| Step | Action |
|------|--------|
| Per tool migrated | Optional: hide individual tool inside `DealAnalysisWorkspace.renderBody` |
| All five live | Add `"analysis"` to `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS` |
| Deep links | Extend `fileWorkspaceTabRouting.ts`: `analysis` → `dealWorkspace` + calculators sub-tab + anchor |

### 8.4 Weighted interest decision tree

```
If product wants blended-rate calculator in Tab 3:
  → Mount WeightedInterestSection; document distinction from Tab 2 business debt
  → Consider setting HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS = false for Tab 3 only (or remove gate on migrated copy)
If product deprecates calculator in favor of Tab 2 schedule only:
  → Omit `weighted` from Sub-Tab B; remove from gear menu defaults
  → Keep LEGACY list entry for documentation
```

---

## 9. Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dual layout UIs (legacy `AnalysisLayoutSettings` + Tab 3 gear) | Medium | Hide legacy panel via circuit breaker when `analysis` tab migrated |
| `deal-analysis-*` vs `pipeline-deal-workspace-calc-*` anchor drift | Medium | Update `scrollTargetForDealTab` / jump helpers when routing `analysis` |
| Weighted interest confusion with Tab 2 business debt | High | In-UI description + audit doc; separate instance vs flat array |
| Payoff amortization perf on mobile | Low | `lazyMount` on outer collapsible; existing inner scroll |
| ShareView individual sections | Low | Share paths bypass `DealAnalysisWorkspace` — unaffected by Tab 3 mount |
| localStorage layout migration race | Low | `DealAnalysisWorkspace` one-time migrate already writes to sheet; Tab 3 inherits parsed layout |

---

## 10. Migration readiness scorecard (overall Sub-Tab B)

| Criterion | Score | Notes |
|-----------|-------|-------|
| Component isolation | **5/5** | Clean exports, no Convex in sections |
| Data pattern fit | **5/5** | Identical `{ draft, update }` as Sub-Tab A |
| Layout infrastructure | **5/5** | `dealAnalysisLayout` already file-scoped |
| Circuit breaker prep | **3/5** | Lists exist; incremental hide not wired like Sub-Tab A |
| UX / policy clarity (weighted) | **3/5** | Phase 37.3.G split needs explicit call |
| **Composite readiness** | **4/5** | Straightforward assembly; weighted tool is the main open question |

---

## 11. File reference index

| Path | Purpose |
|------|---------|
| `components/intake/DealAnalysisWorkspace.tsx` | Legacy orchestrator |
| `components/intake/IntakeSections2.tsx` | All five calculator sections |
| `components/intake/analysis/MultiInstanceToolShell.tsx` | Instance management UI |
| `lib/intake/analysisInstances.ts` | Instance normalization |
| `lib/file/dealAnalysisLayoutStorage.ts` | Layout types + parse |
| `lib/file/dealWorkspaceTab3Layout.ts` | Sub-Tab A only — **do not reuse for calculators** |
| `lib/pipeline/fileWorkspaceTabRouting.ts` | Tab 3 calculator anchors |
| `lib/pipeline/fileWorkspaceLegacyVisibility.ts` | Circuit breaker constants |
| `components/pipeline/tabs/DealWorkspaceTab.tsx` | Sub-Tab B placeholders |
| `convex/intakeSchemaPart.ts` | Field validators for all tool state |

---

**End of audit — Phase 37.3.F.7 complete. No application code modified.**
