# Phase 37.3.C.A — Borrowers Tab (Deal Info) Migration Audit

**Date:** 2026-06-23  
**Status:** Read-only audit — **no code modified**  
**Goal:** Map legacy IntakeEditor surfaces for **Borrowers**, **Guarantors**, and **Household**; trace read/write paths; identify contact-first gaps vs `contactDataBridge.ts`; propose Tab 2 (`BorrowersTab`) architecture and legacy-hide flags.

**Prerequisite docs:** `docs/phase37-2-ui-audit.md` (Tab 2 mapping), `docs/phase37-1-data-bridge-audit.md`, `docs/phase37-1-c-migration-audit.md`, `docs/phase37-3-tab1-audit.md` (Overview extraction pattern).

**Canonical workspace:** `lender-app/components/PipelineFileWorkspace.tsx`  
**Deal editor:** `lender-app/components/intake/IntakeEditor.tsx` (embedded in drawer block `dealWorkspace`)  
**Tab shell:** `lender-app/components/pipeline/FileWorkspaceTabShell.tsx` (`borrowers` placeholder today)

---

## 1. Executive summary

| User-facing surface | Deal tab id (`DealTabId`) | Component | File | Approx lines | Lift difficulty |
|---------------------|---------------------------|-----------|------|--------------|-----------------|
| **Borrowers** (identity + employment) | `borrowers` | `BorrowersSection` | `IntakeEditor.tsx` | L1180–1319 | **Medium** — 17 fields × N borrowers; contact-first rebind |
| **Guarantors & sponsors** | `guarantors` | `GuarantorsSection` | `IntakeSectionsBiz.tsx` | L751–855 | **High** — ownership % + PFS-like fields; entity linkage |
| **Household** (dependents) | `household` | `HouseholdSection` | `IntakeEditor.tsx` | L1846–1865 | **Low** — 2 root-level deal fields; no contact table yet |

**Naming clarifications**

- **Tab 2 “Borrowers”** (file workspace shell) ≠ **deal tab “Overview”** (`OverviewSection` in IntakeEditor — file identifiers / funding type).
- **Tab 1 “Associated contacts”** (`FileContactsBlock`) ≠ **deal tab “Borrowers”** — CRM file links vs intake-shaped borrower rows in `dealData.borrowers[]`.
- There is **no intermediary hook** today. All three sections receive `{ draft, update }` from `IntakeEditor` and mutate top-level `dealData` keys debounced into **`api.pipeline.patchDeal`**.

**Contact-first gap:** UI writes **`pipeline.dealData`** only. Phase 37.1 bridge tables (`contacts`, `contactFileLinks`, `contactFinancialProfiles`, `contactBusinessOwnership`) are populated by **backfill/migration**, not by these form controls.

**Recommended migration order:** 37.3.C.B shell + hide legacy deal tabs → 37.3.C.C contact-first rebind (borrowers identity → contacts, guarantors → ownership + profile, household deferred or file-scoped extension).

---

## 2. Legacy UI surfaces

### 2.1 Registry & routing

| Mechanism | Path | Role |
|-----------|------|------|
| Deal tab metadata | `lib/file/dealTabGroups.ts` | `borrowers`, `guarantors`, `household` under group **Intake** |
| Tab labels | `lib/file/dealWorkspaceLayout.ts` → `DEAL_TAB_LABELS` | Display strings for collapsible headers |
| Section router | `IntakeEditor.tsx` → `renderDealTab()` | L94–141 — `switch (tabId)` mounts section components |
| Visible stack | `IntakeEditor.tsx` | L652 `visibleTabs`; L750–783 maps each tab to `CollapsibleSection` |
| DOM anchor | `IntakeEditor.tsx` | L752–755 `id="deal-workspace-{tabId}"` (e.g. `deal-workspace-borrowers`) |
| Field-count badges | `lib/file/fileSectionMetrics.ts` | L279–303 — `borrowers`, `guarantors`, `household` cases |
| Drawer host | `PipelineFileWorkspace.tsx` | L3636–3662 — `dealWorkspace` block → `<IntakeEditorLazy fileId embedded />` |

### 2.2 Component map (exact JSX)

#### `BorrowersSection`

- **Export:** `IntakeEditor.tsx` L1180 (`export function BorrowersSection`)
- **Mounted when:** `renderDealTab("borrowers", …)` L108–109
- **Props type:** `SectionProps` (= `DealSectionProps` from `lib/file/dealSectionTypes.ts`)
- **Structure:** One `SectionCard` per `draft.borrowers[i]`; grid of `TextInput` fields; add/remove borrower buttons
- **Also consumed by:** `ShareView.tsx` L346 (share-link read-only/editor parity)

#### `GuarantorsSection`

- **Export:** `IntakeSectionsBiz.tsx` L751 (`export function GuarantorsSection`)
- **Imported in:** `IntakeEditor.tsx` L81; `ShareView.tsx` L43
- **Mounted when:** `renderDealTab("guarantors", …)` L110–111
- **Structure:** Single outer `SectionCard`; inner bordered cards per guarantor; combined liquid/net-worth totals in header

#### `HouseholdSection`

- **Export:** `IntakeEditor.tsx` L1846 (`export function HouseholdSection`)
- **Mounted when:** `renderDealTab("household", …)` L126–127
- **Structure:** Single `SectionCard`; two fields on `draft` root (not nested object)

### 2.3 Render architecture (today)

```
PipelineFileWorkspaceShell
└── [data-pipeline-workspace-scroll]
    ├── scrollLead → FileWorkspaceTabShell (borrowers = placeholder)
    └── drawer blocks
        └── dealWorkspace (CollapsibleSection)
            └── IntakeEditor (embedded)
                ├── header (client / project / file name — duplicate of banner)
                ├── DealWorkspaceLayoutSettings (show/hide/reorder deal tabs)
                └── visibleTabs.map → CollapsibleSection per DealTabId
                    ├── deal-workspace-borrowers  → BorrowersSection
                    ├── deal-workspace-guarantors → GuarantorsSection
                    └── deal-workspace-household  → HouseholdSection
```

**Scroll contract:** Deal sections scroll inside **`[data-pipeline-workspace-scroll]`** (same as Overview tab). Tab shell nav is **`sticky top-0`** inside scroll lead — align with `docs/governance/runtime-workspace-scroll-authority.md` when mounting real Borrowers content.

### 2.4 Relationship to Overview tab `contacts` block

Phase 37.3.B placed **`FileContactsBlock`** on Tab 1 (Overview), not Tab 2. Phase 37.2 originally mapped Tab 2 to absorb drawer block `contacts`; **current shipped state keeps CRM links on Overview**.

| Surface | Data | Purpose |
|---------|------|---------|
| `FileContactsBlock` | `contactFileLinks` + `contacts` | CRM relationships (client, co-signer, referral, …) |
| `BorrowersSection` | `dealData.borrowers[]` | Intake worksheet rows (names, phones, employer, …) |

These can diverge until contact-first rebind links borrower index → `contactId`. Backfill resolves primary via `contactFileLinks` then name match on `borrowers[0]` (`backfillContactStickyData.ts` L303–336).

---

## 3. Data read path

### 3.1 No intermediary hook

Sections do **not** call Convex directly. They read **`draft`** passed from `IntakeEditor`.

### 3.2 IntakeEditor load chain

| Step | Code | Detail |
|------|------|--------|
| Query | `IntakeEditor.tsx` L286–294 | `useQuery(api.pipeline.getDealForEditor, { fileId, memberUserKey? })` |
| Resolver | `convex/pipeline.ts` L979–996 | Merges `pipeline.dealData` (embedded) with linked `intakeSheets` via `pickIntakeShapedPreviewPayload` |
| Local state | `IntakeEditor.tsx` L302, L339–366 | `draft: DealWorkspaceSheet \| null`; synced from `dealBundle.sheet` unless key is dirty |
| Init | `IntakeEditor.tsx` L319–338 | `initDealDataIfMissing` when `dealData` empty |
| Section props | `renderDealTab()` L100 | `{ draft, update }` only — **no `fileId` on section props** |

### 3.3 Schema keys read

| Section | `draft` paths | Validator source |
|---------|---------------|------------------|
| Borrowers | `draft.borrowers[]` | `convex/intakeSchemaPart.ts` L4–21 (`borrower` object) |
| Guarantors | `draft.guarantors[]` | L367–382 (`guarantor` object) |
| Household | `draft.dependentsCount`, `draft.dependentsAges` | L516–517 on intake sheet |

**Borrower object fields (read):** `firstName`, `middleName`, `lastName`, `yearsInSchool`, `fico`, `bestTime`, `mobile`, `homePhone`, `altPhone`, `email`, `ssn`, `dob`, `employerName`, `employerPhone`, `employerTenure`, `position`.

**Guarantor object fields (read):** `name`, `role`, `ownershipPct`, `fico`, `liquidAssets`, `netWorth`, `yearsExperience`, `ssn`, `dob`, `mobile`, `email`, `address`, `citizenship`, `notes`.

---

## 4. Data write path

### 4.1 Unified write funnel (all three sections)

Every field change follows the same path:

```
onChange → setBorrower / setItem / update(key, value)
  → IntakeEditor.update() L368–372
  → dirtyRef + setDraft
  → queueSave() → debounced flush() L449–481
  → useMutation(api.pipeline.patchDeal) L457–464
  → convex/pipeline.ts patchDeal L1062+
  → mergePatchIntoDeal → pipeline.dealData (+ linked intakeSheets sync)
```

**Layout-only writes:** `dealWorkspaceLayout` (hide/show/reorder tabs) uses same `update` / `patchDeal` path L374–387.

**There is no** `patchPipelineDealData` symbol — canonical mutation is **`api.pipeline.patchDeal`**.

**Patchable keys** (among others): `convex/intakePatchable.ts` L50, L60–61, L88 — `borrowers`, `dependentsCount`, `dependentsAges`, `guarantors`.

### 4.2 Per-section write triggers

#### BorrowersSection (`IntakeEditor.tsx` L1183–1316)

| User action | `update` key | Value shape |
|-------------|--------------|-------------|
| Edit any borrower field | `"borrowers"` | Full array with patched index |
| Add borrower | `"borrowers"` | `[...borrowers, {}]` |
| Remove borrower | `"borrowers"` | Filtered array |

#### GuarantorsSection (`IntakeSectionsBiz.tsx` L754–847)

| User action | `update` key | Value shape |
|-------------|--------------|-------------|
| Edit guarantor field | `"guarantors"` | Mapped array |
| Add guarantor | `"guarantors"` | `[...items, { role: "Secondary" }]` |
| Remove guarantor | `"guarantors"` | Filtered array |

**Example:** Ownership % change L804 → `setItem(i, { ownershipPct: e.target.value })` → `update("guarantors", …)` → `patchDeal({ guarantors: … })`.

#### HouseholdSection (`IntakeEditor.tsx` L1850–1860)

| User action | `update` key | Value |
|-------------|--------------|-------|
| Dependents count | `"dependentsCount"` | string |
| Dependents ages | `"dependentsAges"` | string |

### 4.3 Audit / activity side effects

`patchDeal` logs touched keys to `pipelineFileActivity` as `deal_patch`. **No `undoSpec`** for deal JSON patches (see `docs/phase37-1-data-bridge-audit.md` §3). Contact bridge mutations append **`contactDataVersions`** — not used by current UI.

---

## 5. Contact-first gap analysis

### 5.1 `contactDataBridge.ts` surface (Phase 37.1)

| Export | Purpose | Used by Borrowers tab today? |
|--------|---------|------------------------------|
| `getContactReo` / `saveContactReo` | REO schedule | **No** (Financial tab / `reo` deal tab) |
| `getContactFinancialProfile` / `saveContactFinancialProfile` | PFS arrays + `liquidAssets`, `netWorth` | **No** |
| `getContactBusinessEntities` / `saveContactBusinessEntity` | Entity + ownership junction | **No** |
| `getContactBusinessDebtSchedule` / `saveContactBusinessDebt` | Business debt rows | **No** |
| `listContactDataVersions` | Version log | **No** |

**Additional APIs (not in bridge):**

| API | Relevant fields |
|-----|-----------------|
| `api.contacts.update` | `name`, `email`, `phone`, `emails[]`, `phones[]`, roles |
| `api.contactFileLinks.upsert` / `remove` | File ↔ contact link + `role` |
| `api.pipeline.patchDeal` | **Current** write path for all three sections |

### 5.2 Field-level re-route matrix

#### `dealData.borrowers[]` → contact-first targets

| Legacy field | Current write | Target (Phase 37.3.C.C+) | Bridge / mutation |
|--------------|---------------|--------------------------|-------------------|
| `firstName`, `middleName`, `lastName` | `patchDeal.borrowers` | `contacts.name` (composed) | `contacts.update` |
| `email` | same | `contacts.email` / `emails[]` | `contacts.update` |
| `mobile`, `homePhone`, `altPhone` | same | `contacts.phones[]` with labels | `contacts.update` |
| `ssn`, `dob` | same | **Gap** — no column on `contacts` today | New contact PII extension or encrypted profile |
| `fico` | same | **Gap** — not on `contactFinancialProfiles` | Extend profile or contact header |
| `employerName`, `employerPhone`, `employerTenure`, `position` | same | **Gap** — employment block not in bridge | Future `contactEmployment` or stay on deal until schema |
| `yearsInSchool`, `bestTime` | same | File-scoped intake-only OR contact extension | TBD |
| Array index `i` | implicit | `contactFileLinks` role: `client` (i=0), `co-signer` (i>0) | `contactFileLinks.upsert` |
| — | — | Stable join | **`dealData.borrowers[i].contactId`** (proposed transition FK — see phase37-1-data-bridge-audit §6) |

#### `dealData.guarantors[]` → contact-first targets

| Legacy field | Current write | Target | Bridge / mutation |
|--------------|---------------|--------|-------------------|
| `name` | `patchDeal.guarantors` | Match/create `contacts` | `contacts.update` / create |
| `email`, `mobile` | same | Contact methods | `contacts.update` |
| `ownershipPct` | same | `contactBusinessOwnership.ownershipPercentage` | `saveContactBusinessEntity` ownership patch |
| `role` | same | `contactBusinessOwnership.title` or link `role` | `saveContactBusinessEntity` |
| `liquidAssets`, `netWorth` | same | `contactFinancialProfiles.liquidAssets`, `.netWorth` | `saveContactFinancialProfile` |
| `fico`, `ssn`, `dob`, `address`, `citizenship`, `notes`, `yearsExperience` | same | Partial — profile/contact gaps | Mixed; PII same as borrowers |
| Entity context | file-level `deal.business` | Requires `contactBusinessEntities` row for file | `saveContactBusinessEntity` (backfill L990–1047) |

**Backfill reference:** `backfillContactStickyData.ts` L1081–1097 maps guarantors by **name match** to contacts, then `upsertOwnership` with `ownershipPct` → `ownershipPercentage`.

#### `dependentsCount`, `dependentsAges`

| Legacy field | Current write | Target | Notes |
|--------------|---------------|--------|-------|
| `dependentsCount` | `patchDeal` | **No contact table** | Phase 37.1.C: out of PFS profile scope |
| `dependentsAges` | same | **No contact table** | Keep file-scoped on primary contact profile extension OR `dealData` until schema decision |

**Policy options:** (a) remain on `dealData` for Tab 2 shell migration; (b) add optional fields on `contactFinancialProfiles`; (c) household belongs on primary borrower contact only.

### 5.3 What must be re-routed (summary)

| Write today | Must eventually become |
|-------------|------------------------|
| `patchDeal({ borrowers })` | `contacts.update` + `contactFileLinks.upsert` + optional dual-write to `dealData` during transition |
| `patchDeal({ guarantors })` | `contacts` + `contactBusinessOwnership` + `contactFinancialProfiles` (liquid/net worth) |
| `patchDeal({ dependentsCount, dependentsAges })` | Deferred — file-level or profile extension |
| All guarantor `ownershipPct` edits | **`contactBusinessOwnership`**, not `dealData.guarantors[].ownershipPct` |

**Dual-write period:** Recommend server-side `patchDeal` hook or dedicated `saveBorrowerFromTab` mutation that writes contact tables **and** mirrors legacy keys until export/FNMA paths are migrated.

---

## 6. Proposed Tab 2 architecture (`BorrowersTab.tsx`)

### 6.1 Design goals

1. **Single scroll owner** — panel lives in `FileWorkspaceTabShell` scroll lead; no nested full-page scrollports.
2. **One Convex subscription** — avoid duplicate `getDealForEditor` + competing autosave timers.
3. **Reuse section components** — `BorrowersSection`, `GuarantorsSection`, `HouseholdSection` unchanged in 37.3.C.B; rebind internals in 37.3.C.C.
4. **Safe rollback** — feature flags hide legacy deal-tab collapsibles without deleting code.

### 6.2 Recommended component tree (37.3.C.B)

```
PipelineFileWorkspace
└── FileWorkspaceTabShell
    └── borrowersPanel → <BorrowersTab … />
        ├── BorrowersSection   { draft, update }
        ├── GuarantorsSection  { draft, update }
        └── HouseholdSection   { draft, update }
```

**Section anchors** (mirror Overview tab):

```typescript
export const BORROWERS_TAB_SECTION_IDS = {
  borrowers: "pipeline-borrowers-people",
  guarantors: "pipeline-borrowers-guarantors",
  household: "pipeline-borrowers-household",
} as const;
```

Add to `lib/pipeline/fileWorkspaceTabRouting.ts`:

- `dealTabToFileWorkspaceTab("borrowers" | "guarantors" | "household") → "borrowers"`
- `borrowersAnchorForDealTab(tabId) → BORROWERS_TAB_SECTION_IDS.*`
- Extend `jumpToDrawerSection` / deep links for `deal-workspace-borrowers` → switch tab + scroll anchor

### 6.3 Shared draft hook (required)

Extract from `IntakeEditor.tsx`:

```typescript
// lib/file/useDealWorkspaceEditor.ts (proposed)
function useDealWorkspaceEditor(fileId: Id<"pipeline">) {
  // getDealForEditor, initDealDataIfMissing, draft, update, flush, saving, savedAt
  return { draft, update, flush, saving, savedAt, dealBundle };
}
```

| Consumer | Usage |
|----------|-------|
| `IntakeEditor` | All deal tabs except hidden migrated ones |
| `BorrowersTab` | Three sections only |
| Future tabs | Financial, Property & Loans, … |

**Alternative (reject):** Second `IntakeEditor` instance or duplicate query in `BorrowersTab` — causes twin autosave and conflict risk.

### 6.4 `BorrowersTab` props sketch

```typescript
export type BorrowersTabProps = {
  className?: string;
  fileId: Id<"pipeline">;
  /** From useDealWorkspaceEditor — passed by PipelineFileWorkspace */
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  readOnly?: boolean;
};
```

`PipelineFileWorkspace` calls `useDealWorkspaceEditor(p._id)` once at orchestrator level (or inside a `DealWorkspaceEditorProvider` wrapping tab shell + deal drawer).

### 6.5 `FileWorkspaceTabShell` extension

Mirror `overviewPanel`:

```typescript
borrowersPanel?: ReactNode;
// panelContent: activeTab === "borrowers" && borrowersPanel ?? placeholder
```

### 6.6 Phase 37.3.C.C — contact-first adapter layer

Introduce **`lib/contacts/borrowerTabWriteAdapter.ts`** (proposed):

| Function | Behavior |
|----------|----------|
| `updateBorrowerIdentity(fileId, index, patch)` | Resolve `contactId` from link or `borrowers[i]`; `contacts.update`; dual-write `patchDeal` if flag |
| `updateGuarantor(fileId, index, patch)` | Resolve contact + file business entity; `saveContactBusinessEntity` / `saveContactFinancialProfile`; dual-write |
| `updateHousehold(fileId, patch)` | `patchDeal` only until schema exists |

UI sections keep `{ draft, update }` initially; **`update` implementation** swaps from raw `patchDeal` to adapter in C.C.

---

## 7. Legacy visibility flags

Extend `lib/pipeline/fileWorkspaceLegacyVisibility.ts` (pattern from Overview 37.3.B):

```typescript
/** Phase 37.3.C — hide deal-workspace collapsibles migrated to Borrowers tab */
export const HIDE_LEGACY_BORROWERS_DEAL_TABS = false; // flip true in 37.3.C.B

export const LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS = [
  "borrowers",
  "guarantors",
  "household",
] as const satisfies readonly DealTabId[];

export function isLegacyBorrowersDealTabHidden(tabId: DealTabId): boolean {
  return (
    HIDE_LEGACY_BORROWERS_DEAL_TABS &&
    (LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS as readonly string[]).includes(tabId)
  );
}
```

### 7.1 IntakeEditor integration

In `IntakeEditor.tsx` (~L652, L750–783):

```typescript
const visibleTabs = wsLayout.order.filter(
  (id) =>
    !wsLayout.hidden.includes(id) &&
    !isLegacyBorrowersDealTabHidden(id),
);
```

**Optional sr-only stub** (parity with Overview drawer stubs): when hidden, render `<div id="deal-workspace-borrowers" className="sr-only" aria-hidden />` so old deep links don’t 404 — or redirect via `fileWorkspaceTabRouting`.

### 7.2 Flags not needed

| Flag | Reason |
|------|--------|
| `HIDE_LEGACY_BORROWERS_DRAWER_BLOCK` | Entire `dealWorkspace` block must stay until all deal tabs migrate |
| Hide `FileContactsBlock` | Already on Overview; out of scope for Tab 2 |

### 7.3 Share link parity

`ShareView.tsx` renders the same sections for external share URLs — **do not hide** there. Only pipeline embedded `IntakeEditor` respects `HIDE_LEGACY_BORROWERS_DEAL_TABS`.

---

## 8. Migration phases (execution checklist)

| Phase | Deliverable | Risk |
|-------|-------------|------|
| **37.3.C.A** | This audit | — |
| **37.3.C.B** | `BorrowersTab`, `useDealWorkspaceEditor`, `borrowersPanel` in tab shell, `HIDE_LEGACY_BORROWERS_DEAL_TABS`, routing/deep links | Low if hook shared |
| **37.3.C.C.1** | Borrower identity → `contacts` + `contactFileLinks` dual-write | Medium — primary index rules |
| **37.3.C.C.2** | Guarantor ownership → `contactBusinessOwnership` | High — requires business entity |
| **37.3.C.C.3** | Guarantor liquid/net worth → `contactFinancialProfiles` | Medium |
| **37.3.C.C.4** | Household schema decision | Low urgency |
| **37.3.C.D** | Remove dual-write; stop mirroring `dealData.borrowers` / `guarantors` | Requires export/FNMA audit |

**Governance before ship (37.3.C.B+):** `npm run qa:governance`, mobile scroll on tab switch, `npm run deploy:prod`.

---

## 9. Risks & dependencies

| Risk | Mitigation |
|------|------------|
| Twin autosave / conflict | Single `useDealWorkspaceEditor` provider |
| Borrower index ≠ primary contact | Explicit `contactId` on borrower row or link role rules (index 0 = client) |
| Guarantor edits without `deal.business` | Create/locate `contactBusinessEntities` from file business tab first |
| SSN/DOB nowhere on `contacts` | Tab 2 shell can lift UI as-is; contact-first PII blocked on schema |
| `ShareView` / FNMA export read `dealData.borrowers` | Dual-write until exporters read contacts |
| Field count badges on hidden tabs | `dealTabFieldCount` still runs on draft — badges disappear with hidden tabs (acceptable) |
| Mobile ops rail “Deal” | May need tab default or anchor jump to Borrowers sections |

---

## 10. Key file index

| Purpose | Path |
|---------|------|
| Section components | `components/intake/IntakeEditor.tsx` (Borrowers, Household), `components/intake/IntakeSectionsBiz.tsx` (Guarantors) |
| Deal tab router | `components/intake/IntakeEditor.tsx` L94–141, L750–783 |
| Section props types | `lib/file/dealSectionTypes.ts` |
| Deal tab ids | `lib/file/dealTabGroups.ts`, `lib/file/dealWorkspaceLayout.ts` |
| Read query | `convex/pipeline.ts` → `getDealForEditor` |
| Write mutation | `convex/pipeline.ts` → `patchDeal` |
| Patchable keys | `convex/intakePatchable.ts` |
| Schema shapes | `convex/intakeSchemaPart.ts` |
| Contact bridge | `convex/contactDataBridge.ts` |
| Contact CRUD | `convex/contacts.ts` → `update` |
| File links | `convex/contactFileLinks.ts` → `upsert`, `remove` |
| Backfill mapping | `convex/migrations/backfillContactStickyData.ts` |
| Tab shell | `components/pipeline/FileWorkspaceTabShell.tsx` |
| Overview pattern | `components/pipeline/tabs/OverviewTab.tsx`, `lib/pipeline/fileWorkspaceLegacyVisibility.ts` |
| Workspace orchestrator | `components/PipelineFileWorkspace.tsx` |
| Share parity | `components/intake/ShareView.tsx` |
| Phase 37.2 tab map | `docs/phase37-2-ui-audit.md` §2.3 |

---

## 11. Audit constraints

- **No code modified** in Phase 37.3.C.A
- Contact-first **write** rebind is **specified**, not implemented
- **`BorrowersTab.tsx` does not exist yet** — architecture proposal only
