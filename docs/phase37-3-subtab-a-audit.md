# Phase 37.3.F.1 — Sub-Tab A (Workspace) Components Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — no code changes  
**Goal:** Locate the four Tab 3 / Sub-Tab A workspace engines, map data dependencies, assess layout risk, and score migration readiness before extraction from the legacy drawer `IntakeEditor` host.

**Prerequisite docs:** `docs/phase37-macro-alignment-audit.md`, `docs/phase37-3-deal-info-audit.md`, Phase 37.3.F skeleton (`DealWorkspaceTab.tsx`).

**Canonical legacy host:** `lender-app/components/intake/IntakeEditor.tsx` (drawer block `dealWorkspace`, ~L3645–3677 in `PipelineFileWorkspace.tsx`)  
**Tab 3 target shell:** `lender-app/components/pipeline/tabs/DealWorkspaceTab.tsx` (Sub-Tab A placeholders)  
**Circuit breaker prep:** `lender-app/lib/pipeline/fileWorkspaceLegacyVisibility.ts` (`HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK`, `isLegacyDealWorkspaceDealTabHidden`, etc.)

---

## 1. Executive summary

| Tab 3 placeholder | Primary component(s) | Legacy deal tab id | Drawer block | Persistence | Readiness |
|-------------------|----------------------|--------------------|--------------|-------------|-----------|
| Hard Money / Rehab Budgets | `HardMoneySection` | `hardmoney` | `dealWorkspace` accordion | `intakeSheets` → `patchDeal` via editor | **4 / 5** |
| Commercial / DSCR Math | `CommercialSection` | `commercial` | `dealWorkspace` accordion | same | **5 / 5** |
| Scenarios & Lender Match | `ScenarioSection` + `PipelineScenarioMatch` | `scenario` + `scenarioMatch` | accordion **and** separate drawer block | **split:** `dealData.scenario` + `pipeline.scenarioCriteria` / `pipeline.scenario` | **2 / 5** |
| Fees & Closing | `FeesSection` | `fees` | `dealWorkspace` accordion | `intakeSheets` → `patchDeal` | **4 / 5** |

**Recommended first migration:** **Commercial / DSCR** (`CommercialSection`) — pure `{ draft, update }`, responsive grids only, no wide tables, minimal cross-section coupling.

**Highest risk:** **Scenarios & Lender Match** — two components, two Convex persistence surfaces, parent props for lender match, and AI assist on both halves.

---

## 2. Registry & routing map

### 2.1 Deal tab registry (`lib/file/dealTabGroups.ts`)

| Deal tab id | UI label (legacy accordion) | Tab 3 anchor (`fileWorkspaceTabRouting.ts`) |
|-------------|----------------------------|---------------------------------------------|
| `hardmoney` | Hard Money | `pipeline-deal-workspace-hard-money-rehab` |
| `commercial` | Commercial / DSCR | `pipeline-deal-workspace-commercial-dscr` |
| `scenario` | Scenario | (part of `pipeline-deal-workspace-scenarios-lender-match`) |
| `fees` | Fees & Closing | `pipeline-deal-workspace-fees-closing` |

**Not a deal tab:** `scenarioMatch` is a **pipeline drawer block** (`lib/pipelineBlockRegistry.ts`), rendered beside (not inside) `IntakeEditor`.

### 2.2 IntakeEditor dispatch (`renderDealTab`)

```84:127:lender-app/components/intake/IntakeEditor.tsx
function renderDealTab(
  tabId: DealTabId,
  draft: Sheet,
  update: DealWorkspaceUpdater,
  fileId: Id<"pipeline">
) {
  const props = { draft, update };
  switch (tabId) {
    // ...
    case "scenario":
      return <ScenarioSection {...props} />;
    case "commercial":
      return <CommercialSection {...props} />;
    case "hardmoney":
      return <HardMoneySection {...props} />;
    case "fees":
      return <FeesSection {...props} />;
```

Accordion mount loop: ~L553–586 — each visible deal tab wrapped in `CollapsibleSection` with `id={`deal-workspace-${tid}`}`.

### 2.3 Secondary consumers (unchanged by Tab 3 migration)

| File | Usage |
|------|--------|
| `components/intake/ShareView.tsx` | Same four sections for shared read/edit views (~L341–382) |
| `components/intake/ShareManager.tsx` | Share bundles include `commercial`, `hardmoney`, `fees`, `scenario` |

---

## 3. Shared data architecture (all four deal-tab sections)

### 3.1 Standard pattern — `{ draft, update }`

All four deal-tab section components implement `DealSectionProps` / `SectionProps`:

```16:21:lender-app/lib/file/dealSectionTypes.ts
export type DealSectionProps = {
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  analysisWorkspaceNested?: boolean;
};
```

- **Read:** top-level keys on `Doc<"intakeSheets">` embedded in the deal editor draft (`hardMoney`, `commercial`, `scenario`, `fees`).
- **Write:** `update("hardMoney" | "commercial" | "scenario" | "fees", partial)` — no direct Convex calls inside section files.

### 3.2 Editor context & autosave

`IntakeEditor` and (when wired) `DealWorkspaceTab` sit under `DealWorkspaceEditorProvider` in `PipelineFileWorkspace.tsx` (~L2451).

| Layer | Responsibility |
|-------|----------------|
| `useDealWorkspaceEditor` | `useQuery(api.pipeline.getDealForEditor)`, debounced `useMutation(api.pipeline.patchDeal)` |
| `update()` | Optimistic draft patch + queue `patchDeal` |
| `deriveIntake(draft)` | Read-only cross-field derivations (property, loans, income, REO counts) for `LinkedField` fallbacks |

**No `api.pipeline.patchDeal` calls inside** `IntakeSectionsBiz.tsx` or `ScenarioSection` in `IntakeSections2.tsx`.

### 3.3 Circuit breaker (post-migration)

When `HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK` flips to `true`:

- `isLegacyDealWorkspaceDealTabHidden("hardmoney" | "commercial" | "scenario" | "fees")` → hide accordion copies in `IntakeEditor` (`visibleTabs` filter must be extended — today only `isLegacyBorrowersDealTabHidden` is applied at ~L453–454).
- `isLegacyDealWorkspaceDrawerSectionHidden("scenarioMatch")` → hide drawer lender-match block.

---

## 4. Section-by-section audit

### 4.1 Hard Money / Rehab Budgets

| Attribute | Detail |
|-----------|--------|
| **Component** | `HardMoneySection` |
| **File** | `components/intake/IntakeSectionsBiz.tsx` |
| **Lines** | Export ~L490–747; section comment ~L488 |
| **Deal tab id** | `hardmoney` |
| **Draft key** | `draft.hardMoney` |
| **Update calls** | `update("hardMoney", { ...h, [field]: value })` |
| **Cross-reads** | `deriveIntake(draft)` — `subjectValue` for as-is value `LinkedField` |
| **Local state** | None (fully controlled from draft) |
| **Convex in view** | None |
| **Sub-components** | `SectionCard`, `Field`, `LinkedField`, `ReadStat`, intake `Button` |

**Internal structure (5 cards):**

1. Deal structure — product / rehab scope / exit (`sm:grid-cols-3`)
2. Values & loan sizing — LTC/LTV/LTARV stats (`sm:grid-cols-3`)
3. Pricing & terms (`sm:grid-cols-3`)
4. **Rehab budget — line items** — editable table
5. Exit & profit model + Sponsor track record

**Layout / responsiveness:**

| Element | Risk | Mitigation already in code |
|---------|------|----------------------------|
| Rehab line-items table | **Medium** — `min-w-[760px]` | Wrapper: `max-w-full overflow-x-auto overscroll-x-contain` (~L664–697) |
| Other blocks | Low | Responsive CSS grids |

**Migration notes:**

- Mount: `<HardMoneySection draft={draft} update={update} />` inside Tab 3 collapsible at anchor `pipeline-deal-workspace-hard-money-rehab`.
- Requires non-null `draft` from `useDealWorkspaceEditor()` (same guard as `DealInfoTab`).
- Extend `IntakeEditor` `visibleTabs` filter with `isLegacyDealWorkspaceDealTabHidden` when circuit breaker enabled.

**Readiness score: 4 / 5** — Drop-in props pattern; rehab table needs Tab 3 width smoke test on mobile (overflow wrapper should carry over).

---

### 4.2 Commercial / DSCR Math

| Attribute | Detail |
|-----------|--------|
| **Component** | `CommercialSection` |
| **File** | `components/intake/IntakeSectionsBiz.tsx` |
| **Lines** | Export ~L283–486; section comment ~L281 |
| **Deal tab id** | `commercial` |
| **Draft key** | `draft.commercial` |
| **Update calls** | `update("commercial", { ...c, [field]: value })` |
| **Cross-reads** | `deriveIntake(draft)` — `proposedLoanAmount`, `subjectValue` for DSCR/LTV math and `LinkedField` on funding amount |
| **Local state** | None |
| **Convex in view** | None |
| **Computed outputs** | NOI, DSCR, cap rate, LTV, debt service (inline — no external engine) |

**Internal structure (5 cards):**

1. Property classification (`sm:grid-cols-3`)
2. Rent roll summary (`sm:grid-cols-3`)
3. Operating expenses (`sm:grid-cols-3`)
4. Commercial loan terms — live DSCR/LTV in header (`sm:grid-cols-3`)
5. Sponsor & exit (`sm:grid-cols-3`)

**Layout / responsiveness:**

| Element | Risk |
|---------|------|
| All fields | **Low** — no tables; grids collapse to single column below `sm` |

**Migration notes:**

- Simplest extraction: single import + `{ draft, update }` inside Tab 3 collapsible.
- Funding amount links to Scenario via `LinkedField` — still works read-only if Scenario remains in legacy host until migrated.

**Readiness score: 5 / 5** — Best first candidate.

---

### 4.3 Scenarios & Lender Match

This Tab 3 placeholder is a **composite** of two legacy surfaces with different data models.

#### 4.3.A — Scenario modeling (`ScenarioSection`)

| Attribute | Detail |
|-----------|--------|
| **Component** | `ScenarioSection` |
| **File** | `components/intake/IntakeSections2.tsx` |
| **Lines** | Export ~L525–892; section comment ~L523 |
| **Deal tab id** | `scenario` |
| **Draft key** | `draft.scenario` (+ reads `draft.occupancy`) |
| **Update calls** | `update("scenario", merged)` |
| **Cross-reads** | Heavy `deriveIntake(draft)` + `LinkedField` from Property, Loans, Income, REO |
| **Local state** | `scenarioMobileStep` (0–2) via `useNarrowViewport()` |
| **Convex in view** | Indirect — `DealBlockAiAssistPanel` uses `useAction` (AI assist), optional `fileId` prop |
| **Features** | Risk alerts, export scenario snapshot (.txt download), AI assist apply patch |

**Internal structure:**

- Mobile step tabs: Setup | Cashflow | Debts (`useNarrowViewport`, ~L622–649)
- Cards: Scenario snapshot, Income & housing, Savings comparison, Recurring debts (dynamic rows), All properties owned, Scenario notes
- Debts UI: `grid-cols-[1fr_160px_40px]` rows — **no horizontal table**

**Layout / responsiveness:**

| Element | Risk |
|---------|------|
| Mobile step wizard | **Medium** — must retest inside Tab 3 + sticky sub-nav stack |
| Linked fields | Low layout risk |

#### 4.3.B — Lender match (`PipelineScenarioMatch`)

| Attribute | Detail |
|-----------|--------|
| **Component** | `PipelineScenarioMatch` (lazy: `PipelineScenarioMatchLazy` in drawer) |
| **File** | `components/PipelineScenarioMatch.tsx` |
| **Lines** | Export ~L241–747; file header docs ~L1–16 |
| **Drawer block id** | `scenarioMatch` |
| **Host today** | `PipelineFileWorkspace.tsx` ~L3751–3771 (sibling of `dealWorkspace`, **not** inside `IntakeEditor`) |

**Props required from parent:**

```72:89:lender-app/components/PipelineScenarioMatch.tsx
export type PipelineScenarioMatchProps = {
  fileId: Id<"pipeline">;
  fileUpdatedAt: number;
  fundingAmount: number;
  scenarioText: string | undefined;
  criteria: ScenarioCriteria | undefined;
  attachedLenderIds: Set<Id<"lenders">>;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
  // ...
};
```

**Persistence (separate from deal workspace draft):**

| Mutation / query | Purpose |
|------------------|---------|
| `api.pipeline.patch` | Autosave `scenarioCriteria` (debounced ~500ms) |
| `api.scenario.matchScenario` | Lender search (on submit) |
| `api.pipeline.attachLender` | Attach lender to file |
| Offline queue | `pipeline.patch` when hub unavailable |

**Also uses:** `DealBlockAiAssistPanel` with explicit `fileId` and `blockKind="lender_match"`.

**Layout / responsiveness:**

| Element | Risk |
|---------|------|
| Criteria form | Low — `grid-cols-1 sm:grid-cols-2` |
| Match results list | Low — vertical `ul`, flex rows with `min-w-0 truncate` |
| Nested `CollapsibleSection` | Medium — double accordion chrome when nested under Tab 3 collapsible |

**Migration notes:**

- Tab 3 section should **compose** `ScenarioSection` + `PipelineScenarioMatch` (or split sub-sections) under one anchor.
- `DealWorkspaceTab` must receive pipeline file props (funding amount, criteria, linked lender ids) — pattern similar to `OverviewTab` props bag.
- Wrap Tab 3 subtree in `DealWorkspaceAiProvider` **or** pass `fileId` into `DealBlockAiAssistPanel` on `ScenarioSection`.
- Two circuit breakers: hide `scenario` deal tab + hide `scenarioMatch` drawer block.

**Readiness score: 2 / 5** — Dual persistence, parent wiring, AI provider, accordion nesting cleanup.

---

### 4.4 Fees & Closing

| Attribute | Detail |
|-----------|--------|
| **Component** | `FeesSection` |
| **File** | `components/intake/IntakeSectionsBiz.tsx` |
| **Lines** | Export ~L859–1042; section comment ~L857 |
| **Deal tab id** | `fees` |
| **Draft key** | `draft.fees` (nested: `broker`, `lender`, `thirdParty`, `prepaids`) |
| **Update calls** | `update("fees", { ...f, ...patch })` via local `setFees()` |
| **Cross-reads** | `deriveIntake(draft)`, `draft.cover.fundingAmount`, `draft.hardMoney.initialLoan` + `rehabHoldback` for lender points basis |
| **Local state** | None |
| **Convex in view** | None |
| **Computed outputs** | Running subtotals + `TOTAL estimated fees` |

**Internal structure (6 cards):**

1. Broker fees (`sm:grid-cols-4`)
2. Lender fees (`sm:grid-cols-4`)
3. Third-party (`sm:grid-cols-4`)
4. Prepaids & reserves (`sm:grid-cols-4`)
5. Adjustments & totals (`sm:grid-cols-3`)

**Layout / responsiveness:**

| Element | Risk |
|---------|------|
| 4-column fee grids | **Low–medium** — wraps to 1 col on mobile; no explicit overflow wrappers (usually fine) |

**Migration notes:**

- Drop-in `{ draft, update }`; points hint reads hard-money totals — works even if Hard Money still in legacy host.
- Optional follow-up: link funding amount to Tab 3 Commercial/Scenario when those migrate.

**Readiness score: 4 / 5** — Straightforward; minor cross-tab read dependencies only.

---

## 5. Convex & side-effect matrix

| Component | Direct Convex | Indirect (AI / parent) |
|-----------|---------------|------------------------|
| `HardMoneySection` | — | — |
| `CommercialSection` | — | — |
| `ScenarioSection` | — | `DealBlockAiAssistPanel` → `useAction` |
| `FeesSection` | — | — |
| `PipelineScenarioMatch` | `patch`, `attachLender`, `matchScenario` query | `DealBlockAiAssistPanel` |

**Autosave path for deal-tab sections:** all writes funnel through `useDealWorkspaceEditor.update` → `api.pipeline.patchDeal` (debounced by user intake autosave cadence).

---

## 6. Layout risk summary (Tab 3 container)

| Section | Wide table / grid | Existing overflow | Tab 3 action |
|---------|-------------------|-------------------|--------------|
| Hard Money | Rehab lines `min-w-[760px]` | Yes (`overflow-x-auto`) | Verify in `[data-pipeline-workspace-scroll]` + sticky sub-nav |
| Commercial | None | N/A | None |
| Scenario | None (debts are flex rows) | N/A | Retest mobile step UI under nested chrome |
| Lender Match | None | N/A | Consider flattening outer `CollapsibleSection` when embedded |
| Fees | 4-col grids | Implicit grid wrap | Optional `min-w-0` on Tab 3 section wrapper |

**Scroll ownership:** Tab 3 lives in `FileWorkspaceTabShell` → `scrollLead` of pipeline workspace. Do not add nested full-page scrollports; horizontal scroll stays **inside** section cards only.

---

## 7. Migration readiness rubric

| Score | Meaning |
|-------|---------|
| **5** | Mount with `{ draft, update }` only; no extra providers; no wide tables |
| **4** | Mount with editor context; minor cross-tab reads or one bounded table |
| **3** | Requires new props adapter or layout tweak |
| **2** | Multiple persistence paths or heavy parent wiring |
| **1** | Major refactor / split required |

---

## 8. Recommended migration order

| Order | Section | Rationale |
|-------|---------|-----------|
| **1** | Commercial / DSCR | Highest readiness; validates Tab 3 mount + circuit breaker with lowest risk |
| **2** | Fees & Closing | Same pattern; exercises 4-col grids in Tab 3 |
| **3** | Hard Money / Rehab | Adds horizontal scroll QA for rehab table |
| **4** | Scenarios & Lender Match | Defer until Scenario + `PipelineScenarioMatch` composition design is agreed |

### Per-slice checklist (when executing migration)

1. Replace placeholder in `DealWorkspaceTab.tsx` with live section + `useDealWorkspaceEditor()`.
2. Add `isLegacyDealWorkspaceDealTabHidden` to `IntakeEditor` `visibleTabs` filter.
3. For lender match: pass pipeline props; hide `scenarioMatch` drawer via `isLegacyDealWorkspaceDrawerSectionHidden`.
4. Wrap AI-dependent blocks in `DealWorkspaceAiProvider` or pass `fileId`.
5. Mobile QA: iPhone Safari, Android Chrome, tablet, desktop per `docs/mobile-testing-rules.md`.
6. `npm run qa:governance` + `npm run deploy:prod`.

---

## 9. Open questions (for migration planning)

1. **Scenarios composite UX:** Single collapsible vs. two (Scenario + Lender Match) under Sub-Tab A?
2. **Scenario mobile steps:** Keep wizard inside Tab 3 or simplify now that file workspace has its own tab shell?
3. **Dual-write:** None required for these four — all remain `dealData` / `intakeSheets` keys except `scenarioMatch` pipeline fields. Confirm intentional.
4. **IntakeEditor header:** Cover / project name block stays in legacy host until Cover migrates — no impact on these four sections.

---

*End of Phase 37.3.F.1 audit — read-only; no application code modified.*
