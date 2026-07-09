# Phase 37.3.D — Deal Info Tab Realignment & Financials Audit

**Date:** 2026-06-23  
**Status:** Tab shell realigned (Phase 37.3.D code); financial sections **read-only audit** — no layout extraction yet  
**Goal:** Align the 6-tab workspace shell to the master blueprint; map income / assets / REO for landing inside **Tab 2: Deal Info** (`dealInfo`).

**Prerequisite docs:** `docs/phase37-2-ui-audit.md`, `docs/phase37-3-borrowers-audit.md`, `docs/phase37-1-data-bridge-audit.md`, `docs/phase37-3-tab1-audit.md`.

**Canonical workspace:** `lender-app/components/PipelineFileWorkspace.tsx`  
**Tab shell:** `lender-app/components/pipeline/FileWorkspaceTabShell.tsx`  
**Deal editor (legacy host):** `lender-app/components/intake/IntakeEditor.tsx` (drawer block `dealWorkspace`)

---

## 1. Executive summary

| Area | Status (37.3.D) |
|------|-----------------|
| **6-tab shell keys & labels** | **Done** — blueprint ids: `overview`, `dealInfo`, `dealWorkspace`, `documents`, `clientPortal`, `settings` |
| **Deal Info panel (live)** | Borrowers, guarantors, household — dual-write active (37.3.C.C.1–3) |
| **Deal Info panel (planned)** | Income, assets & liabilities, schedule of REO — still in legacy `IntakeEditor` accordion only |
| **Contact-first gap (financials)** | UI writes `dealData` only; bridge tables populated by backfill + partial guarantor PFS dual-write |

**Recommended next slices:** 37.3.D.B extract `IncomeSection` / `AssetsSection` / `ReoSection` into `DealInfoTab` (extend `BorrowersTab` or rename to `DealInfoTab`) → 37.3.E dual-write adapters per financial key (mirror borrower/guarantor pattern).

---

## 2. Global tab schema realignment (37.3.D)

### 2.1 Master blueprint — 6 tabs

| `FileWorkspaceTabId` | UI label | Role |
|----------------------|----------|------|
| `overview` | File Overview | Notes, contacts, tasks, lender summary (37.3.B live) |
| `dealInfo` | Deal Info | Borrowers, guarantors, household **+ financial blocks** (partial live) |
| `dealWorkspace` | Deal Workspace | Legacy 17-section sandbox (`IntakeEditor` collapsible stack) — **drawer block `dealWorkspace`** |
| `documents` | Documents | File documents / library links (placeholder) |
| `clientPortal` | Client Portal | Portal invite & client-facing config (placeholder) |
| `settings` | Settings | File settings / layout / admin (placeholder) |

**Replaces interim 37.2 shell ids:** `borrowers`, `financial`, `propertyLoans`, `lendersTerms`, `activity`.

### 2.2 Code touchpoints (modified in 37.3.D)

| File | Change |
|------|--------|
| `components/pipeline/FileWorkspaceTabShell.tsx` | `FILE_WORKSPACE_TAB_IDS`, `TAB_LABELS`, `dealInfoPanel` prop |
| `lib/pipeline/fileWorkspaceTabRouting.ts` | `DEAL_INFO_TAB_SECTION_IDS`; `dealInfoAnchorForDealTab`; deal-tab → `dealInfo` routing incl. `income` / `assets` / `reo` |
| `components/PipelineFileWorkspace.tsx` | `dealInfoPanel={borrowersTabPanel}` |
| `components/pipeline/tabs/BorrowersTab.tsx` | Section anchor ids + test ids → `pipeline-deal-info-*` |

**Unchanged (by design):** `BorrowersTab.tsx` component name, `borrowerTabWriteAdapter.ts`, `GuarantorsSection` / `BorrowersSection` internals, `HIDE_LEGACY_BORROWERS_DEAL_TABS` flag name.

### 2.3 Deal Info section anchors (routing registry)

```typescript
DEAL_INFO_TAB_SECTION_IDS = {
  borrowers:  "pipeline-deal-info-borrowers",
  guarantors: "pipeline-deal-info-guarantors",
  household:  "pipeline-deal-info-household",
  income:     "pipeline-deal-info-income",      // reserved — not mounted yet
  assets:     "pipeline-deal-info-assets",      // reserved — not mounted yet
  reo:        "pipeline-deal-info-reo",         // reserved — not mounted yet
}
```

`tabForDealTab("income" | "assets" | "reo")` → `"dealInfo"` for scroll/deep-link when sections migrate.

### 2.4 Structural map — Tab 2 Deal Info (target)

```
FileWorkspaceTabShell [dealInfo]
└── DealInfoTab (today: BorrowersTab.tsx — rename optional in 37.3.D.B)
    ├── Section: Borrowers          ✅ live + dual-write (contacts)
    ├── Section: Guarantors           ✅ live + dual-write (contacts, ownership, PFS scalars)
    ├── Section: Household            ✅ live (legacy patchDeal only)
    ├── Section: Monthly income       ⬜ legacy IntakeEditor only
    ├── Section: Assets & Liabilities ⬜ legacy IntakeEditor only
    └── Section: Schedule of REO      ⬜ legacy IntakeEditor only
```

**Deal Workspace tab (`dealWorkspace`):** Remaining 14 deal tabs (cover, scenario, property, loans, commercial, analysis, fees, …) stay in drawer `IntakeEditor` until individually migrated or intentionally kept as sandbox.

---

## 3. Financial sections — legacy UI audit

### 3.1 Registry & routing

| Deal tab id | Label (`DEAL_TAB_LABELS`) | Component | File | Lines (approx) |
|-------------|---------------------------|-----------|------|----------------|
| `income` | Income | `IncomeSection` | `IntakeEditor.tsx` | L1411–1497 |
| `assets` | Assets & Liabilities | `AssetsSection` | `IntakeEditor.tsx` | L1501–1623 |
| `reo` | Schedule of REO | `ReoSection` | `IntakeSections2.tsx` | L1138–1320 |

| Mechanism | Path | Role |
|-----------|------|------|
| Section router | `IntakeEditor.tsx` → `renderDealTab()` | L112–123 mounts sections |
| Visible stack | `IntakeEditor.tsx` | Collapsible deal tabs via `dealWorkspaceLayout` |
| DOM anchor | `IntakeEditor.tsx` | `id="deal-workspace-{tabId}"` |
| Field badges | `lib/file/fileSectionMetrics.ts` | L296–313 — counts filled nodes |
| Share parity | `ShareView.tsx` | L348+ mounts same sections for share links |

### 3.2 Income — `IncomeSection`

**Read path:** `draft.incomeRows ?? []`  
**Write path:** `update("incomeRows", …)` on every row add/edit/remove  
**Autosave:** `IntakeEditor` → debounced `api.pipeline.patchDeal` (same as all deal keys)

**Row shape (`incomeRow` — `convex/intakeSchemaPart.ts` L58–64):**

| Field | UI control | Notes |
|-------|------------|-------|
| `borrower` | Select | `"Borrower 1"`, `"Borrower 2"`, `"Other"` — **string tag, not contactId** |
| `source` | Select | W2, Self-Employed, 1099, … |
| `description` | TextInput | |
| `monthlyAmount` | TextInput | Currency string |
| `notes` | TextInput | |

**Derived UI:** `sumIncomeRowsMonthly(rows)` total in section header.

**Contact-first bridge (`contactFinancialProfiles.income[]`):**  
Shape is **identical** to intake `incomeRow` per `contactStickyIncomeRowV` (`convex/contactStickyData/validators.ts` L4–10).

**Backfill behavior (`backfillContactStickyData.ts`):**

- `splitIncomeRows(incomeRows, primary, coBorrowers)` — maps `"Borrower 1"` → primary contact, `"Borrower 2"` → co-borrower slot, by name tag index
- Merges into per-contact PFS with fingerprint dedupe (`incomeFingerprint`)
- File-level `assets` / `liabilities` arrays merged into **primary** contact PFS when `includeFileLevelArrays`

**Dual-write gap:** No live adapter; edits never reach `contactFinancialProfiles` until backfill or future mutation.

---

### 3.3 Assets & liabilities — `AssetsSection`

**Read paths:** `draft.assets ?? []`, `draft.liabilities ?? []`  
**Write paths:** `update("assets", …)`, `update("liabilities", …)`  
**Single component, two deal keys** — both sections in one exported component.

**Asset row (`assetRow` L66–70):**

| Field | UI |
|-------|-----|
| `description` | TextInput |
| `estimatedValue` | TextInput |
| `notes` | TextInput |

**Liability row (`liabilityRow` L72–77):**

| Field | UI |
|-------|-----|
| `description` | TextInput |
| `monthlyPayment` | TextInput |
| `balance` | TextInput |
| `notes` | TextInput |

**Derived UI:** `sumAssetsEstimatedValue`, `sumLiabilitiesBalances`, `sumLiabilitiesMonthlyPayments`.

**Contact-first bridge:**  
`contactFinancialProfiles.assets[]` / `.liabilities[]` — **1:1 field match** with sticky validators.

**Backfill:** File-level arrays attach to **primary borrower contact** PFS (not split per co-borrower). Merge uses `assetFingerprint` / `liabilityFingerprint` dedupe.

**Dual-write gap:** Full PFS arrays not dual-written. **Exception:** guarantor `liquidAssets` / `netWorth` scalars dual-write via `saveGuarantorIdentityDualWrite` (37.3.C.C.3) — separate from this section.

**Naming note:** UI title "Assets" / "Liabilities" maps to deal tab id `assets` (includes both).

---

### 3.4 Schedule of REO — `ReoSection`

**Read path:** `draft.reo ?? []`  
**Write path:** `update("reo", …)`  
**File:** `IntakeSections2.tsx` (not `IntakeEditor.tsx`)

**Helpers:** `deriveIntake(draft)` for subject/primary property CTAs; `addFromSubject()` / `addFromPrimary()` prefill rows from property/loan tabs.

**Row shape (`reoRow` L117–137):** 19 optional string fields including `address`, `usage`, `marketValue`, `balance`, `mortgagePayment`, `grossRent`, `netRent`, etc.

**UI columns:** Purchased, ST, Use, Address, Type, Market value, Position, Balance, Mort pmt, Rate, Taxes, Ins, HOA, Gross/Net rent, APN, Invested + totals row.

**Contact-first bridge (`contactReoProperties`):**  
Field rename map in backfill `mapReoRow()`:

| `dealData.reo[]` | `contactReoProperties` |
|------------------|------------------------|
| `address` | `propertyAddress` |
| `balance` | `mortgageBalance` |
| `mortgagePayment` | `monthlyPayment` |
| (others) | same name |

Rows stored **per primary contact** with `sortOrder`; fingerprint dedupe on address + usage + state.

**Bridge API:** `contactDataBridge.saveContactReo` / `getContactReo` — contact-scoped CRUD with version log.

**Dual-write gap:** REO schedule is file-level array only in UI; no per-edit sync to `contactReoProperties`.

---

## 4. Write path diagram (today)

```
IncomeSection / AssetsSection / ReoSection
    │  update("incomeRows" | "assets" | "liabilities" | "reo", value)
    ▼
IntakeEditor (useDealWorkspaceEditor or local debounce)
    │  patchDeal({ …key })
    ▼
pipeline.dealData.{key}  +  intakeSheets.{key} (if linked)
    │
    ✗ (no live path)
    ▼
contactFinancialProfiles / contactReoProperties
    ▲
    └── backfillContactStickyData + saveGuarantorIdentityDualWrite (scalars only)
```

---

## 5. Contact-first rebind matrix (financials — proposed)

| Deal key | UI section | Bridge table | Split rule | Suggested dual-write mutation |
|----------|------------|--------------|------------|------------------------------|
| `incomeRows` | Income | `contactFinancialProfiles.income[]` | By `borrower` tag → primary / co-borrower contact | `saveIncomeDualWrite` (extend `pipelineContacts.ts`) |
| `assets` | Assets | `contactFinancialProfiles.assets[]` | Primary contact (match backfill) | `saveAssetsDualWrite` or combined PFS mutation |
| `liabilities` | Liabilities | `contactFinancialProfiles.liabilities[]` | Primary contact | same |
| `reo` | REO | `contactReoProperties` rows | Primary contact; map field names | `saveReoDualWrite` |

**Adapter pattern (mirror 37.3.C):**

- Extend `useContactFirstBorrowerUpdate` (or rename → `useDealInfoWriteAdapter`) to intercept keys: `incomeRows`, `assets`, `liabilities`, `reo`
- `updateDraftOnly` + debounced Convex mutation
- Step A: legacy deal patch; Step B: contact bridge sync with fingerprint / borrower-tag resolution

**Borrower tag resolution:** Reuse `incomeBorrowerTagIndex` + `loadPrimaryAndCoBorrowerContacts` from `pipelineContacts.ts` / backfill.

---

## 6. Dependencies & consumers

| Consumer | Impact when financials move to Deal Info tab |
|----------|---------------------------------------------|
| `ShareView.tsx` | Keep importing section components; no tab shell |
| `fileSectionMetrics.ts` | Badge counts unchanged (deal tab ids stable) |
| DTI / insights | `lib/pipelineFileInsights.ts` — `dti-no-income` jumps to `dealWorkspace` today; retarget to `dealInfo` + anchor |
| FNMA export | `lib/intake/exportFnma.ts` — reads `dealData` keys; legacy mirror preserves exports |
| `HIDE_LEGACY_*` flags | Add `HIDE_LEGACY_FINANCIAL_DEAL_TABS` when sections extract (mirror borrowers flag) |

---

## 7. Extraction checklist (37.3.D.B+ — not started)

1. Mount `IncomeSection`, `AssetsSection`, `ReoSection` in `BorrowersTab` (or `DealInfoTab`) with `{ draft, update }` from `useDealWorkspaceEditor`
2. Add `HIDE_LEGACY_FINANCIAL_DEAL_TABS` for `income`, `assets`, `reo` in `fileWorkspaceLegacyVisibility.ts`
3. Wire section ids from `DEAL_INFO_TAB_SECTION_IDS`
4. Implement dual-write mutations per §5
5. Mobile QA on wide REO table (`min-w-[1500px]` horizontal scroll)
6. Do **not** remove `dealWorkspace` drawer block until sandbox tabs have a migration plan

---

## 8. Key file index

| Purpose | Path |
|---------|------|
| Tab shell | `components/pipeline/FileWorkspaceTabShell.tsx` |
| Tab routing | `lib/pipeline/fileWorkspaceTabRouting.ts` |
| Deal Info panel | `components/pipeline/tabs/BorrowersTab.tsx` |
| Write adapter | `lib/contacts/borrowerTabWriteAdapter.ts` |
| Dual-write mutations | `convex/pipelineContacts.ts` |
| Income / Assets | `components/intake/IntakeEditor.tsx` |
| REO | `components/intake/IntakeSections2.tsx` |
| Deal tab ids | `lib/file/dealTabGroups.ts` |
| Intake validators | `convex/intakeSchemaPart.ts` |
| Sticky validators | `convex/contactStickyData/validators.ts` |
| Bridge CRUD | `convex/contactDataBridge.ts` |
| Backfill reference | `convex/migrations/backfillContactStickyData.ts` |
| Prior borrowers audit | `docs/phase37-3-borrowers-audit.md` |

---

## 9. Audit constraints

- **Financial layout code not modified** in 37.3.D (audit + tab realignment only)
- **No new dual-write** for income/assets/reo in this phase
- **Convex schema unchanged**
