# Phase 37.3.F.3 — Sub-Tab A Framework & Remaining Sandbox Compliance Audit

**Date:** 2026-06-23  
**Status:** Read-only analysis — no application code modified  
**Scope:** `FeesSection`, `HardMoneySection`, Tab 3 inline layout control state, circuit-breaker injection paths for upcoming migrations  
**North Star references:** `docs/ux-audit/future-state-platform-vision.md` (per-file modular layouts), `docs/phase37-2-ui-audit.md` (deal workspace layout on file), Phase 37.3.F skeleton spec (inline gear + Sub-Tab A/B frames)

**Baseline (completed):** Phase 37.3.F.2 — `CommercialSection` live in Tab 3; circuit breaker pattern established.

---

## 1. Executive summary

| Area | Finding | Compliance vs North Star |
|------|---------|--------------------------|
| **Fees & Closing** | Pure `{ draft, update }`; read-only cross-tab reads for funding basis | **Ready to migrate** (4/5) — same pattern as Commercial |
| **Hard Money / Rehab** | Pure `{ draft, update }`; one bounded wide table with existing `overflow-x-auto` | **Ready to migrate** (4/5) — mobile scroll QA required |
| **Inline layout gear (Tab 3)** | **Mock only** — disabled dropdown; no read/write | **Gap** — no per-file Sub-Tab A layout schema |
| **`pipeline.dealData.uiPreferences`** | **Does not exist** in codebase | N/A |
| **Legacy layout (drawer)** | `intakeSheets.dealWorkspaceLayout` — file-scoped, persisted via `patchDeal` | Aligns with per-file requirement for **legacy 17-tab stack only** |

**Critical gap:** Tab 3 Sub-Tab A uses a **fixed section order** and placeholder/mock layout control. There is no file-specific visibility or reorder API for the four Tab 3 workspace blocks (`hardMoneyRehab`, `commercialDscr`, `scenariosLenderMatch`, `feesClosing`). The inline gear must be wired to a **new or extended file-scoped layout document** before North Star “per-file layout presets” is satisfied for the Sandbox tab.

---

## 2. State & prop analysis

### 2.1 Shared contract (`SectionProps`)

Both sections implement `DealSectionProps` from `lib/file/dealSectionTypes.ts`:

```typescript
{ draft: DealWorkspaceSheet; update: DealWorkspaceUpdater }
```

- **No** `useMutation`, `useQuery`, `useContext`, `localStorage`, or `sessionStorage` inside `IntakeSectionsBiz.tsx` (verified — zero matches).
- All writes go through `update(key, value)` → `useDealWorkspaceEditor` → debounced `api.pipeline.patchDeal`.

---

### 2.2 Hard Money / Rehab — `HardMoneySection`

| Attribute | Detail |
|-----------|--------|
| **File** | `components/intake/IntakeSectionsBiz.tsx` |
| **Lines** | ~L488–747 (export L490–747) |
| **Deal tab id** | `hardmoney` |
| **Draft key** | `draft.hardMoney` |
| **Write path** | `update("hardMoney", { ...h, [field]: value })` via local `set()` / `setLine()` |
| **Local React state** | None |
| **Side effects** | None |

#### Cross-reads (read-only, not writes)

| Source | Usage | Lines |
|--------|--------|-------|
| `deriveIntake(draft)` | `di.subjectValue` → as-is value `LinkedField` fallback | L493, L591–596 |
| `draft.hardMoney.rehabLines` | Line-item table source | L492, L676–694 |

`deriveIntake` reads `subjectProperty`, `scenario`, `loans`, `incomeRows`, `reo`, etc. — **read-only** aggregation (`lib/intake/derivations.ts` L41–152). No hidden mutation.

#### Inline formulas (no external engine)

All math is synchronous in-component (~L502–531):

| Output | Formula inputs |
|--------|----------------|
| `rehabEffective` | `rehabBudget \|\| sum(rehabLines.amount)` |
| `ltc`, `ltv`, `ltarv` | purchase, rehab, loan splits, as-is, ARV |
| `ioMonthly`, `pointsDollars` | rate, points, initial loan |
| `holdingCost`, `totalOut`, `projectedProfit` | sale price, hold months, selling costs %, monthly holding |

**Constraint compliance:** Formulas are self-contained; migration can mount the component without wrapping or adapter logic.

#### Layout structure & Tab 3 clip risk

| Block | Layout | Clip risk in Tab 3 sub-frame |
|-------|--------|------------------------------|
| Deal structure | `sm:grid-cols-3` | Low |
| Values & loan sizing | `sm:grid-cols-3` + header stats | Low |
| Pricing & terms | `sm:grid-cols-3` | Low |
| **Rehab budget — line items** | `<table min-w-[760px]>` inside `overflow-x-auto` wrapper | **Medium** — primary QA target |
| Exit & profit model | `sm:grid-cols-3` | Low |
| Sponsor track record | `sm:grid-cols-4` | Low |

Rehab table wrapper (~L664–697):

```664:665:lender-app/components/intake/IntakeSectionsBiz.tsx
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
```

**Visual bug scenarios to test after migration:**

1. **Nested horizontal scroll** — Tab 3 sits inside `[data-pipeline-workspace-scroll]`; inner table scroll should not fight vertical workspace scroll (pattern already used in legacy drawer).
2. **Sticky sub-nav overlap** — `DealWorkspaceTab` sub-nav is `sticky top-[2.5625rem]`; wide table scroll should remain inside card, not under sticky chrome.
3. **CollapsibleSection lazy mount** — first expand of section mounts table; verify no width collapse before paint (`min-w-0` on Tab 3 section wrapper — already on `DealWorkspaceCollapsibleSection`).
4. **Row growth** — unbounded `rehabLines` rows increase vertical height only; no virtualization (acceptable; same as legacy).

**Migration readiness: 4 / 5**

---

### 2.3 Fees & Closing — `FeesSection`

| Attribute | Detail |
|-----------|--------|
| **File** | `components/intake/IntakeSectionsBiz.tsx` |
| **Lines** | ~L857–1042 (export L859–1042) |
| **Deal tab id** | `fees` |
| **Draft key** | `draft.fees` (nested: `broker`, `lender`, `thirdParty`, `prepaids`) |
| **Write path** | `setFees(patch)` → `update("fees", { ...f, ...patch })` |
| **Local React state** | None |
| **Side effects** | None |

#### Cross-reads (read-only)

| Source | Usage | Lines |
|--------|--------|-------|
| `deriveIntake(draft)` | `di.proposedLoanAmount` for lender points basis | L865, L878–880 |
| `draft.cover.fundingAmount` | Primary funding amount fallback | L877–879 |
| `draft.hardMoney.initialLoan` + `rehabHoldback` | Funding amount fallback chain | L881–882 |

Funding amount resolution (~L877–885):

```877:885:lender-app/components/intake/IntakeSectionsBiz.tsx
  const coverAny = draft.cover as { fundingAmount?: string } | undefined;
  const fundingAmount =
    toNumber(coverAny?.fundingAmount) ||
    toNumber(di.proposedLoanAmount) ||
    toNumber(draft.hardMoney?.initialLoan) +
      toNumber(draft.hardMoney?.rehabHoldback);
```

These reads are **display/calculation only** (points $ hint, lender sum). They do not write to `cover`, `scenario`, or `hardMoney`. Fees remains functional if Hard Money / Cover / Scenario stay in legacy host.

#### Inline formulas

| Output | Computation |
|--------|-------------|
| `brokerSum`, `lenderSum`, `tpSum`, `ppSum` | Sum of nested fee fields |
| `lenderPointsDollars` | `fundingAmount * parseRate(lender.pointsPct)` |
| `total` | All sums + wire fee − credits to borrower |

#### Layout structure & Tab 3 clip risk

| Block | Layout | Clip risk |
|-------|--------|-----------|
| Broker fees | `sm:grid-cols-4` | Low — wraps to 1 col on mobile |
| Lender fees | `sm:grid-cols-4` | Low |
| Third-party | `sm:grid-cols-4` | Low |
| Prepaids & reserves | `sm:grid-cols-4` | Low |
| Adjustments & totals | `sm:grid-cols-3` | Low |

No wide tables. No horizontal overflow wrappers required.

**Migration readiness: 4 / 5**

---

### 2.4 IntakeEditor dispatch (legacy host)

Both sections are mounted via `renderDealTab` (~L106–109, L126–127 in `IntakeEditor.tsx`):

```106:109:lender-app/components/intake/IntakeEditor.tsx
    case "commercial":
      return <CommercialSection {...props} />;
    case "hardmoney":
      return <HardMoneySection {...props} />;
```

```126:127:lender-app/components/intake/IntakeEditor.tsx
    case "fees":
      return <FeesSection {...props} />;
```

Secondary consumer: `ShareView.tsx` (~L355–356, L381–382) — unchanged by Tab 3 migration.

---

## 3. Inline layout state gap

### 3.1 What exists today

| System | Storage location | Scope | Controls | Persisted how |
|--------|------------------|-------|----------|---------------|
| **Legacy deal accordion** | `intakeSheets.dealWorkspaceLayout` | **Per file** | Order, hide, expand of 17 `DealTabId`s | `patchDealWorkspaceLayout()` → `patchDeal` |
| **Analysis tools** | `intakeSheets.dealAnalysisLayout` | **Per file** (after migration bootstrap) | Order, hide, expand of calculator section ids | `update("dealAnalysisLayout", …)` → `patchDeal` |
| **Analysis local bootstrap** | `localStorage` key `dlc.deal-analysis-layout.v1` | **Per browser** (one-time seed) | Migrated into file on first open | `DealAnalysisWorkspace` L225–238 |
| **Tab 3 inline gear** | None | N/A | Mock dropdown — all items **disabled** | **Not persisted** |
| **`pipeline.dealData.uiPreferences`** | — | — | **Not implemented** | — |
| **Drawer block layout** | `pipeline` drawer layout storage (separate) | Per file / user prefs | Pipeline **drawer blocks**, not deal sections | Not applicable to Tab 3 sections |

#### Legacy layout schema (`DealWorkspaceLayoutV1`)

`lib/file/dealWorkspaceLayout.ts` L13–18:

```typescript
{
  v: 1;
  order: DealTabId[];      // 17 legacy deal tabs
  hidden: DealTabId[];
  expanded: Partial<Record<DealTabId, boolean>>;
}
```

**UI:** `DealWorkspaceLayoutSettings` in `IntakeEditor.tsx` (~L136–267) — full reorder/hide/reset panel above accordion stack.

**Read/write in editor:**

- Parse: `parseDealWorkspaceLayoutFromUnknown(draft.dealWorkspaceLayout)` — `IntakeEditor.tsx` ~L455
- Write: `patchDealWorkspaceLayout` — `useDealWorkspaceEditor.tsx` ~L175–188
- Visibility filter: `visibleTabs = wsLayout.order.filter(… !wsLayout.hidden.includes(id) …)` — `IntakeEditor.tsx` ~L456–460

#### Tab 3 inline gear (current — non-functional)

`DealWorkspaceTab.tsx` ~L194–217:

- `DropdownMenu` labeled “Inline layout defaults”
- Items: “Section order”, “Visibility toggles”, “Reset to defaults” — all `disabled`
- **No state**, **no connection** to `dealWorkspaceLayout` or any other store

### 3.2 North Star misalignment

| Requirement (North Star / Phase 37) | Current state |
|-------------------------------------|---------------|
| Per-file section visibility | Tab 3 sections always render (Commercial live; others placeholder) — no hide |
| Per-file section order | Fixed order in `DealWorkspaceWorkspaceFrame` |
| Toggle must not affect other files | Would be satisfied by file-scoped Convex field (same as `dealWorkspaceLayout`) |
| Inline gear adjacent to sub-tabs | UI shell present; logic missing |

**Root cause:** `dealWorkspaceLayout` indexes **`DealTabId`** (17 legacy tabs), not **Tab 3 Sub-Tab A section ids** (`hardMoneyRehab`, `commercialDscr`, `scenariosLenderMatch`, `feesClosing` from `fileWorkspaceTabRouting.ts`). Reusing `dealWorkspaceLayout.hidden` for `hardmoney` / `fees` would hide legacy accordion copies but **would not drive Tab 3 frame visibility** without a mapping layer.

### 3.3 Proposed schema anchor (implementation-ready, not built)

Add a **versioned, file-scoped** field on the intake sheet (same persistence path as existing layouts):

**Recommended path:** `intakeSheets.dealWorkspaceTab3Layout` (Convex: extend `intakeSchemaPart.ts` / `intakePatchable.ts` alongside `dealWorkspaceLayout` and `dealAnalysisLayout`).

**Proposed shape (`DealWorkspaceTab3LayoutV1`):**

```typescript
type DealWorkspaceSubTabASectionId =
  | "hardMoneyRehab"
  | "commercialDscr"
  | "scenariosLenderMatch"
  | "feesClosing";

type DealWorkspaceTab3LayoutV1 = {
  v: 1;
  workspace: {
    order: DealWorkspaceSubTabASectionId[];
    hidden: DealWorkspaceSubTabASectionId[];
    expanded: Partial<Record<DealWorkspaceSubTabASectionId, boolean>>;
  };
  /** Sub-Tab B — reuse existing ids or alias `dealAnalysisLayout` */
  calculators?: {
    order: DealAnalysisSectionId[];
    hidden: DealAnalysisSectionId[];
    expanded: Partial<Record<DealAnalysisSectionId, boolean>>;
  };
};
```

**Implementation hooks (future slice):**

| Layer | Responsibility |
|-------|----------------|
| `lib/file/dealWorkspaceTab3Layout.ts` | Parse/normalize/move/default (mirror `dealWorkspaceLayout.ts`) |
| `useDealWorkspaceEditor` | `patchDealWorkspaceTab3Layout()` or extend `update("dealWorkspaceTab3Layout", …)` |
| `DealWorkspaceTab.tsx` | Read layout → filter/order sections; wire gear dropdown to toggle `hidden` / move `order` |
| `DealWorkspaceWorkspaceFrame` | Respect `expanded` for collapsible open state (optional — today uses `defaultOpen={false}` only) |

**Calculators sub-tab:** Prefer **reusing** existing `dealAnalysisLayout` (already file-scoped, L209–250 in `DealAnalysisWorkspace.tsx`) rather than duplicating. Inline gear on Calculators sub-tab could edit `dealAnalysisLayout` when Sub-Tab B is active.

**Do not use:**

- `localStorage` for visibility (violates per-file / multi-device North Star — except one-time bootstrap pattern already used for analysis)
- Global React context without Convex backing
- `pipeline.dealData.uiPreferences` until schema is formally added

---

## 4. Circuit breaker paths

### 4.1 Established pattern (Commercial — Phase 37.3.F.2)

| File | Line(s) | Mechanism |
|------|---------|-----------|
| `fileWorkspaceLegacyVisibility.ts` | L89 | `HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_TABS = true` |
| `fileWorkspaceLegacyVisibility.ts` | L92–94 | `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS = ["commercial"]` |
| `fileWorkspaceLegacyVisibility.ts` | L99–108 | `isLegacyDealWorkspaceMigratedDealTabHidden(tabId)` |
| `fileWorkspaceLegacyVisibility.ts` | L133–134 | `isLegacyDealWorkspaceDealTabHidden` delegates to migrated helper first |
| `IntakeEditor.tsx` | L3–4, L456–460 | Import + `visibleTabs` filter excludes migrated ids |
| `fileWorkspaceTabRouting.ts` | L85–90 | `commercial` → `dealWorkspace` tab + anchor |

Commercial no longer appears in drawer `IntakeEditor` accordion; lives in Tab 3 only.

### 4.2 Fees migration injection (Phase 37.3.F.x — Fees slice)

**Step 1 — `lib/pipeline/fileWorkspaceLegacyVisibility.ts`**

Add `"fees"` to incremental list (~L92–94):

```typescript
export const LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS = [
  "commercial",
  "fees",  // ← add on Fees migration
] as const satisfies readonly DealTabId[];
```

No other changes required if `HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_TABS` remains `true` (L89).  
`isLegacyDealWorkspaceMigratedDealTabHidden("fees")` becomes `true` automatically (L99–108).

**Step 2 — `components/intake/IntakeEditor.tsx`**

Already filtered at ~L456–460 — **no line change** when using incremental list pattern (same as Commercial).

**Step 3 — `lib/pipeline/fileWorkspaceTabRouting.ts`**

Add routing entries (mirror Commercial ~L85–90):

```typescript
// DEAL_TAB_TO_FILE_TAB
fees: "dealWorkspace",

// DEAL_TAB_TO_DEAL_WORKSPACE_ANCHOR
fees: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing,
```

**Step 4 — `components/pipeline/tabs/DealWorkspaceTab.tsx`**

Replace Fees placeholder with `<FeesSection draft={draft} update={update} />` inside `DealWorkspaceCollapsibleSection` at anchor `pipeline-deal-workspace-fees-closing`.

### 4.3 Hard Money migration injection (Phase 37.3.F.x — Hard Money slice)

**Step 1 — `lib/pipeline/fileWorkspaceLegacyVisibility.ts`**

Add `"hardmoney"` to ~L92–94:

```typescript
export const LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS = [
  "commercial",
  "hardmoney",  // ← add on Hard Money migration
  // "fees",     // order depends on migration sequence
] as const satisfies readonly DealTabId[];
```

**Step 2 — `IntakeEditor.tsx`**

Same ~L456–460 filter — automatic once id is in list.

**Step 3 — `fileWorkspaceTabRouting.ts`**

```typescript
hardmoney: "dealWorkspace",  // DEAL_TAB_TO_FILE_TAB

hardmoney: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.hardMoneyRehab,  // anchor map
```

**Step 4 — `DealWorkspaceTab.tsx`**

Mount `<HardMoneySection draft={draft} update={update} />` at `pipeline-deal-workspace-hard-money-rehab`.

### 4.4 Full drawer block retirement (future — not for Fees/Hard Money alone)

When **all** Sub-Tab A (+ calculators) sections migrate:

| File | Line | Action |
|------|------|--------|
| `fileWorkspaceLegacyVisibility.ts` | L71 | Set `HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK = true` |
| `PipelineFileWorkspace.tsx` | ~L3645–3677 | Hide or stub `dealWorkspace` drawer `CollapsibleSection` via `isLegacyDealWorkspaceDrawerBlockHidden("dealWorkspace")` |

Until then, drawer block remains for unmigrated deal tabs (cover, scenario, property, analysis, etc.).

### 4.5 Circuit breaker decision matrix

| Flag | `hardmoney` hidden in legacy? | `fees` hidden in legacy? | Tab 3 shows section? |
|------|------------------------------|--------------------------|----------------------|
| Today (F.2 done) | No | No | Commercial only |
| After add `"fees"` to migrated list + mount | No | **Yes** | Commercial + Fees |
| After add `"hardmoney"` to migrated list + mount | **Yes** | per list | Commercial + Hard Money (+ Fees if migrated) |
| `HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK = true` | Yes (via full list) | Yes | All migrated sections in Tab 3 |

---

## 5. Migration checklist (Fees & Hard Money)

### Fees & Closing (recommended next — 37.3.F.3 execution)

1. Mount `FeesSection` in `DealWorkspaceTab.tsx` (anchor `pipeline-deal-workspace-fees-closing`).
2. Append `"fees"` to `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS`.
3. Extend `fileWorkspaceTabRouting.ts` (`fees` → tab + anchor).
4. Smoke: edit broker origination → autosave; confirm legacy accordion omits Fees.
5. Mobile: 4-column grids on narrow Tab 3 width.

### Hard Money / Rehab (37.3.F.4)

1. Mount `HardMoneySection` at `pipeline-deal-workspace-hard-money-rehab`.
2. Append `"hardmoney"` to migrated list + routing.
3. **Mandatory mobile QA:** rehab line-items horizontal scroll inside Tab 3 + sticky sub-nav.
4. Verify `LinkedField` as-is value still links when Property tab remains in legacy host.

---

## 6. Compliance verdict

| Component | `{ draft, update }` pure? | Hidden side effects? | Tab 3 layout risk | Blockers |
|-----------|----------------------------|----------------------|-------------------|----------|
| `FeesSection` | Yes | No | Low | None — ready to migrate |
| `HardMoneySection` | Yes | No | Medium (760px table) | Mobile scroll QA only |
| Inline layout gear | N/A | N/A | N/A | **Schema + wiring not built** |

**North Star alignment score (Tab 3 Sandbox):** ~**60%** — first live block (Commercial) proves mount path; remaining engines are migration-ready; **per-file inline layout control is the primary framework debt**.

---

*End of Phase 37.3.F.3 compliance audit — read-only; no application code modified.*
