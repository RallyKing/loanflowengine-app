# Phase 37.4.H.1 — Household Dependents Data & Fields Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — **no code changed**  
**Goal:** Map the remaining household dependent scalars, their storage/bindings, and the Tab 2 target so Phase 37.4.H can complete contact-first synchronization and lock down Deal Info.

**Prerequisite docs:** `docs/phase37-3-borrowers-audit.md`, `docs/phase37-3-deal-info-audit.md`, `docs/phase37-1-data-bridge-audit.md`, `docs/phase37-macro-alignment-audit.md` (Tab 3 portions superseded by 37.3.F).

**Canonical Tab 2 panel:** `lender-app/components/pipeline/tabs/DealInfoTab.tsx`  
*(Prompt referenced `DealInformationTab.tsx` — that file does not exist; `DealInfoTab.tsx` is the live implementation.)*

---

## 1. Executive summary

| Finding | Detail |
|---------|--------|
| **Field count** | **2 scalars only** — no row arrays, no per-dependent objects, no childcare expense fields |
| **Schema keys** | `dependentsCount`, `dependentsAges` (optional strings on intake/deal sheet root) |
| **Storage tier** | **File/deal scoped** — `pipeline.dealData` + linked `intakeSheets` row; **not** on `contacts` or sticky CRM tables today |
| **Tab 2 UI** | **Already mounted** — `HouseholdSection` inside `DealInfoTab` accordion `pipeline-deal-info-household` |
| **Write path** | **`updateLegacy` → `useDealWorkspaceEditor.update` → debounced `api.pipeline.patchDeal`** — **no dual-write** |
| **Legacy drawer** | Household deal tab **hidden** via `isLegacyBorrowersDealTabHidden("household")` — Tab 2 is sole in-app editor |
| **CRM gap** | Last **people-adjacent** Tab 2 section without contact-first bridge (borrowers, guarantors, income, assets, REO, business debt bridged in 37.3.C–37.3.G) |
| **Childcare / household size** | **Not present** in codebase (grep clean for `householdSize`, `numberOfDependents`, `childCare`, `childcare`) |

**Recommended next slice:** **37.4.H.2** — schema decision + `saveHouseholdDualWrite` + adapter intercept → switch `DealInfoTab` household accordion from `updateLegacy` to contact-first `update`.

---

## 2. Legacy field inventory

### 2.1 Canonical schema keys

| Key | Type | Label (UI) | Validator locations |
|-----|------|------------|---------------------|
| `dependentsCount` | `v.optional(v.string())` | “Number of dependents” | `convex/intakeSchemaPart.ts` L516 |
| `dependentsAges` | `v.optional(v.string())` | “Ages (comma separated)” | `convex/intakeSchemaPart.ts` L517 |

**Patch surface:** `convex/intakePatchable.ts` L60–61 — both keys are patchable via `patchDeal`.

**Placement in deal document:** Root-level siblings of `borrowers[]`, `incomeRows[]`, `assets[]`, `liabilities[]` — grouped under comment `// Household` in `intakeSchemaPart.ts` L515–517. **Not nested under borrower objects.**

### 2.2 Fields searched but not found

| Pattern | Result |
|---------|--------|
| `numberOfDependents`, `dependentAges`, `householdSize` | No matches |
| `childcare`, `childCare`, childcare expense scalars | No matches |
| Dependents on `contacts` table | No schema fields |
| Dependents on `contactFinancialProfiles` | No schema fields |
| Backfill for dependents | `backfillContactStickyData.ts` — **no** dependents handling |

### 2.3 Related file-level PFS scalars (out of H.1 scope, same legacy write path)

These live on the **Assets & Liabilities** section UI, not Household, but share the **non-dual-write** `patchDeal` fallback:

| Key | UI section | File |
|-----|------------|------|
| `citizenship` | Assets & Liabilities | `IntakeEditor.tsx` L1246–1247 |
| `defaultJudgments` | Assets & Liabilities | L1257–1258 |
| `bkHistory`, `bkDate` | Assets & Liabilities | L1267–1268 |
| `latePaymentsLast12` | Assets & Liabilities | L1284–1285 |

Phase 37.4.H should **not** expand scope to these unless explicitly requested; they are a separate “PFS hardship flags” slice.

---

## 3. UI render map

### 3.1 Section component

| Item | Location |
|------|----------|
| **Component** | `HouseholdSection` |
| **Export** | `components/intake/IntakeEditor.tsx` L1633–1652 |
| **Layout** | `SectionCard` → 2-column grid (`md:grid-cols-2`) |
| **Controls** | Two `TextInput` fields (free-form strings, no numeric validation) |

```typescript
// IntakeEditor.tsx L1637–1647 (abridged)
<Field label="Number of dependents">
  <TextInput value={draft.dependentsCount ?? ""} onChange={… update("dependentsCount", …)} />
</Field>
<Field label="Ages (comma separated)">
  <TextInput value={draft.dependentsAges ?? ""} onChange={… update("dependentsAges", …)} />
</Field>
```

### 3.2 Where it renders today

| Surface | Mounted? | Write adapter | Notes |
|---------|----------|---------------|-------|
| **Tab 2 — `DealInfoTab`** | **Yes** | `updateLegacy` | L157–163 — primary user path |
| **Legacy `IntakeEditor` accordion** | **Hidden** | `update` from editor hook | `renderDealTab("household")` L119–120 still exists but tab filtered out |
| **Share portal — `ShareView`** | **Yes** | Share session `update` | L363–364 |
| **Export / print** | **Yes** | Read-only | `lib/intake/export.ts` L564–571 |
| **DTI calculator** | **No** | — | `DtiSection` does not read dependents |

### 3.3 Tab 2 target layout (already wired)

```
DealInfoTab (components/pipeline/tabs/DealInfoTab.tsx)
├── Borrowers          pipeline-deal-info-borrowers     ✅ contactFirstUpdate
├── Guarantors         pipeline-deal-info-guarantors    ✅ contactFirstUpdate
├── Household          pipeline-deal-info-household     ⚠️ updateLegacy  ← H.2 target
├── Income             pipeline-deal-info-income          ✅ contactFirstUpdate
├── Assets & Liabilities pipeline-deal-info-assets      ✅ contactFirstUpdate
├── Schedule of REO    pipeline-deal-info-reo           ✅ contactFirstUpdate
└── Business Debt      pipeline-deal-info-business-debt ✅ contactFirstUpdate
```

**Natural home for dependents:** Keep the existing **Household** accordion (between Guarantors and Income). Rationale from `dealTabGroups.ts`: household is an **Intake / people** tab, not a financial grid. Alternative (37.4.H optional UX): inline dependents on **primary borrower** card — would duplicate section unless Household accordion is removed.

**Anchor / routing:** `DEAL_INFO_TAB_SECTION_IDS.household` → `"pipeline-deal-info-household"` (`fileWorkspaceTabRouting.ts` L47, L80, L136). Deep links: `tabForDealTab("household")` → `"dealInfo"`.

**Collapsible shell:** `DealInfoCollapsibleSection` — `defaultOpen={false}`, `lazyMount`, `variant="card"` (matches other Tab 2 sections).

---

## 4. State & CRM binding profile

### 4.1 Read path

```
api.pipeline.getDealForEditor (via useDealWorkspaceEditor)
  → dealBundle.sheet / pipeline.dealData merge
  → draft.dependentsCount, draft.dependentsAges
  → HouseholdSection TextInputs
```

- **Subscription owner:** `useDealWorkspaceEditor` (`lib/file/useDealWorkspaceEditor.tsx`) — shared by Tab 2 and legacy drawer.
- **No contact join** on read — UI never loads dependents from `contactFinancialProfiles` or `contacts`.

### 4.2 Write path (current — legacy only)

```
HouseholdSection onChange
  → updateLegacy("dependentsCount" | "dependentsAges", value)   // DealInfoTab L162
  → useDealWorkspaceEditor.update(key, value)
  → dirtyRef + setDraft
  → debounced flush → api.pipeline.patchDeal
  → mergePatchIntoDeal → pipeline.dealData (+ intakeSheets sync when linked)
  → pipelineFileActivity kind: "deal_patch", keys: ["dependentsCount"] etc.
```

**Adapter bypass:** `useContactFirstBorrowerUpdate` (`borrowerTabWriteAdapter.ts` L37–38) documents household as **legacy**. Intercept map (L904–988) handles `borrowers`, `guarantors`, `incomeRows`, `assets`, `liabilities`, `reo`, `weightedInterest` only — **`dependentsCount` / `dependentsAges` fall through to `update`**.

**Save indicator gap:** `DealInfoTab` merges `borrowerSaving`, `guarantorSaving`, `incomeSaving`, `assetsSaving`, `reoSaving`, `businessDebtSaving` — **no `householdSaving`**.

### 4.3 CRM / relational storage (today)

| Table | Household fields | Used by UI? |
|-------|------------------|-------------|
| `pipeline.dealData` | `dependentsCount`, `dependentsAges` | **Yes** |
| `intakeSheets` | Same keys when file linked | **Yes** (mirror on patch) |
| `contacts` | — | No |
| `contactFinancialProfiles` | income, assets, liabilities, liquidAssets, netWorth only | No |
| `contactRealEstateOwned` | — | No |
| `contactBusinessDebtSchedules` | — | No |
| `contactDataVersions` | entity types: `reo`, `pfs`, `business`, `business_ownership`, `business_debt` | **No `household` entity type** |

**Binding verdict:** Dependents are **100% file/deal scalars**. They are **not** bound to individual `Contact` rows. Underwriting treats them as **household-level** (one count + one ages string per file), not per-borrower.

### 4.4 Downstream consumers

| Consumer | Keys used |
|----------|-----------|
| `lib/file/fileSectionMetrics.ts` L300–304 | Field-count badge for legacy `household` deal tab |
| `convex/shareSections.ts` L44, L71, L96 | Share bundle section `household` |
| `lib/intake/export.ts` L564–571 | PDF/CSV export block “Dependents” |
| `components/intake/ShareManager.tsx` | Includes `"household"` in default share sections |

**No automated underwriting math** in repo reads dependents for DTI (DTI uses `dti` / `dtiInstances` debt buckets + income rows).

---

## 5. Legacy visibility & circuit breakers

| Mechanism | Effect on household |
|-----------|---------------------|
| `LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS` includes `"household"` | `fileWorkspaceLegacyVisibility.ts` L38–45 |
| `HIDE_LEGACY_BORROWERS_DEAL_TABS = true` | L35 |
| `IntakeEditor.tsx` L456–460 | `visibleTabs` filter excludes household accordion |
| Tab 2 mount | `DealInfoTab` is **only** in-app editor for dependents |

**Legacy DOM id** (if circuit breaker disabled): `deal-workspace-household` (`IntakeEditor.tsx` L563).

---

## 6. Contact-first gap & schema policy options

Prior audits (`phase37-3-borrowers-audit.md` §5.2, `phase37-1-data-bridge-audit.md` L109) deferred dependents because:

1. No CRM column existed in Phase 37.1 sticky schema.
2. Semantics are **household/file-level**, not clearly per-contact.
3. FNMA/export paths still read `dealData` root keys.

### 6.1 Policy options (pick one in 37.4.H.2)

| Option | CRM target | Pros | Cons |
|--------|------------|------|------|
| **A — Primary borrower profile extension** | Add `dependentsCount`, `dependentsAges` to `contactFinancialProfiles` | Reuses existing PFS table; mirrors income/assets pattern; one profile per primary borrower | Semantically odd on non-primary contacts; multi-borrower files need “primary” rule |
| **B — File-scoped sticky row** | New `fileHouseholdProfiles` or store on `pipeline` row | Matches true household semantics | New table + governance; breaks “all PFS on contact” story |
| **C — Dual-write deal only (transition)** | Keep `dealData` authoritative; CRM write noop / stub | Fastest; Tab 2 UX unchanged | Does not complete CRM bridge |
| **D — Primary `contacts` extension** | Optional fields on `contacts` document | Visible on contact record | Pollutes identity table; tenant isolation review |

**Recommendation:** **Option A** — extend `contactFinancialProfiles` with optional `dependentsCount` / `dependentsAges`, dual-written from **primary borrower index** (index `0` in `borrowers[]`, same rule as assets/income primary sync in `pipelineContacts.ts`). Keep `dealData` mirror during transition for export/share parity.

---

## 7. Proposed implementation plan (37.4.H.2+)

### Slice H.2 — Schema & server mutation

| Step | File(s) | Action |
|------|---------|--------|
| 1 | `convex/schema.ts` | Add optional `dependentsCount`, `dependentsAges` to `contactFinancialProfiles` |
| 2 | `convex/intakeSchemaPart.ts` | No change required (deal keys already exist) |
| 3 | `convex/pipelineContacts.ts` | Add `saveHouseholdDualWrite` mutation: patch deal + upsert primary borrower’s `contactFinancialProfiles` |
| 4 | `convex/contactDataBridge.ts` | Extend `saveContactFinancialProfile` / read helpers if used by contact detail routes |
| 5 | `convex/migrations/backfillContactStickyData.ts` | Backfill pass: copy root deal dependents → primary matched contact profile |

**Mutation shape (mirror income):**

```typescript
saveHouseholdDualWrite({
  fileId,
  dependentsCount?: string,
  dependentsAges?: string,
  expectedUpdatedAt?,
  preferencesAccountId?,
})
```

### Slice H.3 — Client adapter

| Step | File(s) | Action |
|------|---------|--------|
| 1 | `lib/contacts/borrowerTabWriteAdapter.ts` | Intercept `dependentsCount` / `dependentsAges` in `wrappedUpdate`; debounce flush to `saveHouseholdDualWrite`; add `householdSaving` / `householdSavedAt` |
| 2 | `components/pipeline/tabs/DealInfoTab.tsx` | Change L162: `update={contactFirstUpdate}`; merge `householdSaving` into combined save status |
| 3 | `HouseholdSection` | **No internal changes** (constraint: do not alter field UI/math in H.2) |

### Slice H.4 — Verification & governance

| Check | Command / action |
|-------|------------------|
| Build | `npm run build` from `lender-app/` |
| QA gate | `npm run qa:governance` |
| Deploy | `npm run deploy:prod` |
| Manual | Tab 2 Household → edit count/ages → verify `dealData` + `contactFinancialProfiles` (Convex dashboard) |
| Share/export | Confirm `shareSections` household bundle still reads deal mirror |
| Regression | Legacy drawer household tab remains hidden; deep link `#pipeline-deal-info-household` scrolls correctly |

### Slice H.5 — Optional UX polish (defer unless requested)

- Show read-only dependents summary on **Contacts** detail when profile populated.
- Co-locate dependents inside **BorrowersSection** primary borrower card and deprecate standalone Household accordion (requires layout + governance doc update).

---

## 8. File reference index

| Purpose | Path |
|---------|------|
| UI section | `lender-app/components/intake/IntakeEditor.tsx` L1631–1652 |
| Tab 2 mount | `lender-app/components/pipeline/tabs/DealInfoTab.tsx` L157–163 |
| Write adapter | `lender-app/lib/contacts/borrowerTabWriteAdapter.ts` |
| Editor hook | `lender-app/lib/file/useDealWorkspaceEditor.tsx` |
| Deal schema | `lender-app/convex/intakeSchemaPart.ts` L515–517 |
| Patch allowlist | `lender-app/convex/intakePatchable.ts` L60–61 |
| CRM PFS table | `lender-app/convex/schema.ts` L2362–2374 |
| Dual-write templates | `lender-app/convex/pipelineContacts.ts` (`saveIncomeDualWrite`, `saveAssetsAndLiabilitiesDualWrite`) |
| Section anchors | `lender-app/lib/pipeline/fileWorkspaceTabRouting.ts` |
| Legacy hide list | `lender-app/lib/pipeline/fileWorkspaceLegacyVisibility.ts` L38–45 |
| Field metrics | `lender-app/lib/file/fileSectionMetrics.ts` L300–304 |
| Share keys | `lender-app/convex/shareSections.ts` L44 |
| Export | `lender-app/lib/intake/export.ts` L564–571 |
| Tab metadata | `lender-app/lib/file/dealTabGroups.ts` L28 |

---

## 9. Deployment plan (post-implementation)

1. **Convex:** Deploy schema + `saveHouseholdDualWrite` + optional backfill migration (run backfill in staging first per `data-migration-safety-policy.md`).
2. **Next.js:** `npm run qa:governance` → `npm run deploy:prod`.
3. **Production smoke:** Open deal-backed file → Tab 2 Deal Info → expand Household → edit fields → confirm save indicator → reload → values persist.
4. **CRM spot-check:** Open linked primary borrower contact → financial profile shows dependents (after H.2 schema).
5. **Stakeholder sign-off:** Tab 2 dual-write coverage becomes **7/7 sections** (all Deal Info accordions).

---

## 10. Sign-off checklist (H.1 audit complete)

- [x] All dependent-related schema keys located (2 strings on deal root)
- [x] No hidden childcare / household-size fields in repo
- [x] UI render sites documented (Tab 2 live; legacy hidden)
- [x] Write path traced (`updateLegacy` → `patchDeal` only)
- [x] CRM binding gap confirmed (no contact table today)
- [x] Tab 2 target accordion identified (`pipeline-deal-info-household`)
- [x] Implementation slices drafted for 37.4.H.2+
- [x] **No application code modified in this phase**
