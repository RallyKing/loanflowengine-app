# Phase 37.2.A — UI Header / Banner Audit (Restart)

**Date:** 2026-06-22  
**Status:** Read-only audit — **no code modified**  
**Goal:** Prepare transition from the current monolithic file workspace to a **persistent Global Banner** + **6-tab content shell**.

**Note:** There is no `components/pipeline/FileWorkspace.tsx`. The canonical workspace is **`components/PipelineFileWorkspace.tsx`**. Block metadata lives in **`lib/pipelineBlockRegistry.ts`**.

---

## 1. Executive summary

| Layer | Today | Phase 37.2 target |
|-------|--------|-------------------|
| **Global Banner** | Inline `chrome` JSX in `PipelineFileWorkspace.tsx` (~500 lines) inside `PipelineFileWorkspaceShell` `<header>` | Extract **`GlobalBanner`** / **`PipelineFileCommandCenter`** — sticky, non-scrolling |
| **Tab navigation** | **None** at file level; **13 collapsible drawer blocks** + **17 deal collapsible sections** inside `IntakeEditor` | **6-tab shell** below banner; tab body scrolls inside `[data-pipeline-workspace-scroll]` |
| **File title / stage** | Compact header (always visible) | Banner (reuse `InlineText`, `PipelineStageSelector`) |
| **Funding amount** | `fileDetails` block + `OverviewSection` in deal workspace (3 places) | Banner quick-edit (reuse `InlineNumber` + `commitPipelineFundingAmount`) |
| **Client / project** | `HeaderDisclosurePanel` (collapsed) + `IntakeEditor` header grid (embedded) | Banner: client chip (nav) + project inline/popover |

**Scroll contract (must preserve):** `AppChrome` `<main>` is `overflow-y-hidden` on file route; **`[data-pipeline-workspace-scroll]`** is the sole vertical scroll owner (`PipelineFileWorkspaceShell.tsx`, `AppChrome.tsx`).

---

## 2. Component registry scan

**File:** `lender-app/lib/pipelineBlockRegistry.ts`

### 2.1 Registered drawer blocks (`PIPELINE_BLOCK_IDS`)

| blockId | Label | Primary implementation | Mandatory |
|---------|-------|------------------------|-----------|
| `fileDetails` | File details | `PipelineFileWorkspace.tsx` | **Yes** |
| `fileNotes` | File notes | `blocks/FileNotesBlock.tsx` | No |
| `dealWorkspace` | Deal workspace | `intake/IntakeEditor.tsx` | **Yes** |
| `licensing` | Licensing | `PipelineFileWorkspace.tsx` | No |
| `scenarioMatch` | Scenario match | `PipelineScenarioMatch.tsx` | No |
| `generateTerms` | Generate terms | `PipelineFileWorkspace.tsx` | No |
| `lenders` | Lenders | `PipelineFileWorkspace.tsx` | No |
| `contacts` | Contacts | `blocks/FileContactsBlock.tsx` | No |
| `feesSplits` | Fees & splits | `PipelineFileWorkspace.tsx` | No |
| `tasks` | Tasks | `blocks/FileTasksBlock.tsx` | No |
| `people` | Pipeline File Access | `PipelineFileSharingSection.tsx` | No |
| `archive` | Archive | `PipelineFileWorkspace.tsx` | No |
| `dangerZone` | Danger zone | `PipelineFileWorkspace.tsx` | No |

**Registry facts:**

- Most blocks are **not separate components** — `component: null`; logic is **inlined** in `PipelineFileWorkspace.tsx` (~4,900 lines).
- Layout persistence: `pipeline.fileDrawerLayout` + `lib/pipelineDrawerLayoutStorage.ts`.
- Deal sections are a **separate** layout system: `dealData.dealWorkspaceLayout` + `lib/file/dealWorkspaceLayout.ts` (17 tab ids).

### 2.2 Header utility sections (not in block registry)

From `pipelineDrawerLayoutStorage.ts`:

- `dealMessages`, `email`, `documents` — quick panels above drawer blocks.

### 2.3 Proposed 6-tab shell mapping (target — not in codebase)

Phase 37.2 introduces a **new top-level tab model**. Recommended mapping from existing surfaces:

| # | Tab (proposed) | Absorbs drawer blocks | Absorbs deal tabs (`DealTabId`) |
|---|----------------|----------------------|----------------------------------|
| 1 | **Overview** | `fileDetails` (partial), insights strip | `cover`, `scenario`, `overview` |
| 2 | **Borrowers** | `contacts` | `borrowers`, `guarantors`, `household` |
| 3 | **Financial** | (contact-first PFS — Phase 37.3+) | `income`, `assets`, `reo` |
| 4 | **Property & Loans** | — | `property`, `loans`, `commercial`, `hardmoney` |
| 5 | **Lenders & Terms** | `lenders`, `scenarioMatch`, `generateTerms`, `feesSplits` | `fees`, `analysis` (partial) |
| 6 | **Activity & Admin** | `tasks`, `fileNotes`, `people`, `licensing`, `archive`, `dangerZone` | `workflow`, `notes` |

**New artifacts needed (37.2.B+):**

- `lib/pipeline/fileWorkspaceTabRegistry.ts` (or extend block registry with `uiSurface: "tab"`)
- `components/pipeline/FileWorkspaceTabShell.tsx`
- Route-local tab state (URL hash or search param — TBD in 37.2.B)

---

## 3. Route & page structure

```
app/pipeline/[fileId]/page.tsx
  └── PipelineFilePageClient.tsx
        └── PipelineFileWorkspace.tsx          ← orchestrator (~4,900 LOC)
              └── PipelineFileWorkspaceShell.tsx
                    ├── <header> chrome        ← GlobalBanner extraction target
                    └── [data-pipeline-workspace-scroll]
                          ├── accessBanner
                          ├── utilities (collapsible)
                          ├── layoutStrip (PipelineFileInsightsPanel)
                          └── modular blocks (13 drawer sections)
```

**Data hook:** `hooks/usePipelineFileWorkspaceData.ts` — consolidates Convex subscriptions for the workspace (keep; banner reads from same detail query).

**There is no** `FileWorkspace.tsx` under `components/pipeline/`.

---

## 4. Audit: existing header elements

### 4.1 File header — title, funding, stage

| Field | Component / code | File | Lines (approx) |
|-------|------------------|------|----------------|
| **File name** | `InlineText` → `patchField({ fileName })` | `PipelineFileWorkspace.tsx` | 2166–2174 mobile, 2334–2342 desktop |
| **Pipeline stage** | `PipelineStageSelector` → `patchField({ stageId, subStageId })` | same | 2217–2230, 2365–2378 |
| **Funding amount** | `InlineNumber` + `useBlockData` + `commitPipelineFundingAmount` | `fileDetails` block | 2946–3044 |
| **Client name** | Not in compact header | `HeaderDisclosurePanel` → `LinkedClientsEditor` | 2476–2492 |
| **Project name** | Not in compact header | `ChangeFileProjectControl` + deal `projectName` | 2478–2484; `IntakeEditor` 719–723 |

**Secondary header chrome (preserve adjacent to banner, not inside command fields):**

- Back-to-hub `Link`
- Owner badge, archived/snoozed pills
- `HeaderDisclosureToggle` + overflow `DropdownMenu`
- `FileWorkspaceTriageHighlight`

**Layout classes:** `lib/pipeline/pipelineHeaderFlex.ts` (used by header + triage).

### 4.2 Overview / Cover tab components

| Component | File | Role |
|-----------|------|------|
| **`CoverSection`** | `components/intake/IntakeSections2.tsx` (~L136+) | Coversheet: deal type, funding on cover, LTV, comp — **reuse in Overview tab** |
| **`OverviewSection`** | `components/intake/IntakeEditor.tsx` (~L1079+) | File identifiers, **`cover.fundingAmount`** TextInput, funding type, source — **duplicate funding UX** |
| **`ScenarioSection`** | `IntakeSections2.tsx` | Scenario comparison — Overview tab candidate |

**IntakeEditor embedded mode** (`embedded={true}` from `dealWorkspace` block):

- Renders its **own** `<header>` with client/project/file name grid (L673–735) — **duplicate of banner target fields**.
- Deal sections = **vertical stack of `CollapsibleSection`**, not horizontal tabs (L750–786).

### 4.3 Existing navigation / “tabs”

| Mechanism | Type | Location |
|-----------|------|----------|
| **Drawer blocks** | Collapsible cards, scroll-to-section | `PipelineFileWorkspace.tsx` modular blocks |
| **Deal workspace sections** | 17 collapsible deal tabs | `IntakeEditor.tsx` via `dealWorkspaceLayout` |
| **Mobile ops rail** | Fixed dock: Deal / Lenders / Tasks | `PipelineMobileWorkspaceOpsRail.tsx` |
| **Lender sub-tabs** | Find vs On-file (narrow only) | `PipelineFileWorkspace.tsx` ~L3862 |
| **Hub projection modes** | Client / Project / Loan (hub only) | `PipelinePageClient.tsx` — not file workspace |

**No horizontal 6-tab strip exists today** on the file route.

---

## 5. Dependency mapping (shared components)

Import reference counts (repo-wide grep, `lender-app/`):

| Symbol / module | Import sites | Risk if wrapped |
|-----------------|-------------|-----------------|
| **`InlineText`** | ~12 files | **Low** — stable primitive; banner + table + tasks |
| **`InlineNumber`** | ~5 files | **Low** — banner wraps same API as `fileDetails` |
| **`PipelineStageSelector`** | ~6 files | **Low** — drop-in; used hub + workspace + board |
| **`commitPipelineFundingAmount`** | **4** (`PipelineFileWorkspace`, `PipelineTableRow`, `pipelineTableCommits`, semantics doc) | **Medium** — must remain single commit path |
| **`commitPipelineFileName`** | **4** (same pattern) | **Medium** |
| **`useBlockData`** | **2** (`PipelineFileWorkspace`, hook def) | **Low** — workspace-only funding bus |
| **`pipelineHeaderFlex`** | **3** | **Low** — header layout tokens |
| **`PipelineFileWorkspaceShell`** | **~15** (tests, docs, AppChrome) | **Do not break** — scroll contract |
| **`IntakeEditor`** | lazy from workspace + routes | **Preserve** — tab content source |
| **`CoverSection` / `OverviewSection`** | IntakeEditor + ShareView | **Preserve** — refactor into Overview tab |

**Safe wrap strategy:** GlobalBanner imports **`InlineText`**, **`InlineNumber`**, **`PipelineStageSelector`** unchanged; calls **`commitPipelineFundingAmount`** / **`patchField`** from props — no fork of commit logic.

---

## 6. Data integrity & audit (banner edits)

| Field class | Write path | Audit trail |
|-------------|-----------|-------------|
| File name, stage, funding (pipeline row) | `patchField` → `api.pipeline.patch` | `activityFeed` + optional `undoSpec` (`convex/pipeline.ts`) |
| Deal-backed funding / file name | `commitPipelineFundingAmount` / `commitPipelineFileName` → `patchDeal` + pipeline patch | Same + deal patch keys logged |
| Client name (display chip) | Read-only in banner | N/A |
| Project name (deal string) | `runPatchDeal({ projectName })` | `deal_patch` activity |
| Contact sticky data | `contactDataBridge` | `contactDataVersions` — **not banner scope** |

---

## 7. Files to **DEMOLISH** (nuke / inline-remove after extraction)

These regions become redundant once GlobalBanner + 6-tab shell ship. **Demolish = delete or collapse**, not delete underlying primitives.

| Priority | File / region | What to remove | Why |
|----------|---------------|----------------|-----|
| **P0** | `PipelineFileWorkspace.tsx` **`chrome` prop body** (~L2154–2658) | Entire inline header JSX | Replaced by `GlobalBanner` |
| **P0** | `PipelineFileWorkspace.tsx` **`fileDetails` block** funding + file name fields (~L2918–2934, 2946–3044) | Duplicate editors promoted to banner | Single SoT for command fields |
| **P1** | `IntakeEditor.tsx` **embedded header grid** (~L673–735) | client/project/file name row when `embedded` | Banner owns identity row |
| **P1** | `IntakeEditor.tsx` **non-embedded nav header** (~L673–691) | Back link + “Deal workspace” label in embedded context | File workspace already has hub back |
| **P2** | `HeaderDisclosurePanel` **hierarchy + linked clients** (~L2459–2494) | Client/project when in banner | Keep snooze/switcher/ACL in disclosure |
| **P2** | `PipelineFileWorkspace.tsx` **modular block loop** for merged tabs | Blocks absorbed into 6-tab panels | Replace with tab router |
| **P3** | `dealWorkspaceLayout` **17-section collapsible stack** in `IntakeEditor` | Vertical accordion inside deal tab | Overview/Borrowers/… tabs host sections |
| **P3** | `PipelineMobileWorkspaceOpsRail.tsx` | Dock jumps to drawer block ids | Retarget to 6-tab ids or remove |

**Do NOT demolish:**

- `PipelineFileWorkspaceShell.tsx` (shell + scrollport)
- `components/inline/*`
- `PipelineStageSelector.tsx`
- `lib/pipeline/pipelineTableCommits.ts`
- Intake section components (`CoverSection`, `OverviewSection`, …)
- `pipelineBlockRegistry.ts` (extend, don’t delete)
- Convex mutations / activity feed

---

## 8. Files to **PRESERVE** (reuse as-is or compose)

### 8.1 Primitives & commits (unchanged)

| File | Reuse |
|------|--------|
| `components/inline/InlineText.tsx` | File name, project name |
| `components/inline/InlineNumber.tsx` | Funding amount |
| `components/inline/InlineSelect.tsx` | Used inside stage selector |
| `components/pipeline/PipelineStageSelector.tsx` | Stage/sub-stage |
| `lib/pipeline/pipelineTableCommits.ts` | `commitPipelineFundingAmount`, `commitPipelineFileName`, … |
| `lib/pipeline/pipelineHeaderFlex.ts` | Banner layout tokens |
| `hooks/useBlockData.ts` | Funding sync / shared bus |
| `components/ResourceAccessProvider.tsx` | Read-only gating |

### 8.2 Shell & routing (unchanged)

| File | Reuse |
|------|--------|
| `components/PipelineFileWorkspaceShell.tsx` | Sticky `<header>` slot + scroll body |
| `components/AppChrome.tsx` | File route scroll delegation |
| `app/pipeline/[fileId]/page.tsx` | Route entry |
| `hooks/usePipelineFileWorkspaceData.ts` | Data subscriptions |

### 8.3 Tab content sources (compose into 6-tab panels)

| File | Tab destination |
|------|-----------------|
| `components/intake/IntakeSections2.tsx` | Overview (`CoverSection`, `ScenarioSection`, `ReoSection`) |
| `components/intake/IntakeEditor.tsx` | Section renderers (`OverviewSection`, `BorrowersSection`, …) |
| `components/intake/IntakeSectionsBiz.tsx` | Business, commercial, fees, guarantors |
| `components/intake/DealAnalysisWorkspace.tsx` | Lenders & Terms / Analysis |
| `components/pipeline/blocks/FileContactsBlock.tsx` | Borrowers tab |
| `components/pipeline/blocks/FileTasksBlock.tsx` | Activity tab |
| `components/pipeline/blocks/FileNotesBlock.tsx` | Activity tab |
| `components/PipelineScenarioMatch.tsx` | Lenders & Terms tab |
| `components/PipelineFileSharingSection.tsx` | Activity tab |

### 8.4 Hub/table (unchanged — outside file workspace)

| File | Note |
|------|------|
| `components/pipeline/PipelineTableRow.tsx` | Same commit helpers; not part of banner extraction |
| `components/pipeline/PipelineHubFileRow.tsx` | Hub context only |

---

## 9. Proposed `GlobalBanner` props

### Minimal (directive)

```typescript
type GlobalBannerProps = {
  fileId: Id<"pipeline">;
  pipelineData: GlobalBannerPipelineData;
  onUpdate: GlobalBannerUpdateHandler;
};
```

### `GlobalBannerPipelineData` (recommended)

```typescript
{
  pipeline: Doc<"pipeline">;
  fundingAmount: number;
  dealBacked: boolean;
  dealCommitRow?: DealCommitRow;
  clientDisplay: { name: string; contactId?: Id<"contacts">; href?: string } | null;
  projectDisplay: { name: string; projectId?: Id<"projects"> } | null;
  fileName: string;
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  readOnly: boolean;
  isSnoozed: boolean;
  isArchived: boolean;
}
```

### `onUpdate` handler

```typescript
{
  patchPipeline: (fields: PatchPipelineFields) => Promise<void>;
  patchDeal?: (changes: Record<string, unknown>) => Promise<void>;
  blockBus?: BlockDataBusApi; // funding override sync
}
```

---

## 10. Proposed 6-tab shell props (37.2.B)

```typescript
type FileWorkspaceTabId =
  | "overview"
  | "borrowers"
  | "financial"
  | "propertyLoans"
  | "lendersTerms"
  | "activity";

type FileWorkspaceTabShellProps = {
  fileId: Id<"pipeline">;
  activeTab: FileWorkspaceTabId;
  onTabChange: (tab: FileWorkspaceTabId) => void;
  children: React.ReactNode; // tab panel content
};
```

Tab strip placement: **first child** inside `[data-pipeline-workspace-scroll]`, optionally **`sticky top-0`** (requires entry in `runtime-workspace-scroll-authority.md` if sticky).

---

## 11. Test & governance touchpoints

| Area | Files |
|------|--------|
| Scroll / sticky | `tests/mobile/scroll/phase5-mobile-native.spec.ts`, `tests/mobile/workspace-sheet/*.spec.ts` |
| Header hierarchy | `tests/mobile/pipeline-file-information-hierarchy.spec.ts` |
| Funding sync E2E | `tests/e2e/pipeline-funding-sync.spec.ts` |
| AGENTS.md | Pipeline file scroll authority |

---

## 12. Phase 37.2.B implementation order (suggested)

1. Add `GlobalBanner.tsx`; swap `chrome` prop in `PipelineFileWorkspace.tsx`.
2. Add `FileWorkspaceTabShell.tsx` + tab registry; default tab `overview`.
3. Mount existing section components into tab panels (lazy).
4. Demolish P0 duplicates (header blob regions, fileDetails funding/name).
5. Demolish P1 IntakeEditor embedded header duplicates.
6. Retire drawer block accordion loop progressively.
7. Mobile QA + update Playwright selectors (`pipeline-workspace-header-*` test ids).

---

## 13. Audit constraints

- **No code modified** in Phase 37.2.A (Restart)
- **No Convex / schema changes**
- 6-tab shell is **specified here**; implementation is **Phase 37.2.B**

---

## 14. Key file index

| Purpose | Path |
|---------|------|
| Block registry | `lib/pipelineBlockRegistry.ts` |
| Drawer layout | `lib/pipelineDrawerLayoutStorage.ts` |
| Deal tab ids | `lib/file/dealTabGroups.ts`, `lib/file/dealWorkspaceLayout.ts` |
| Workspace orchestrator | `components/PipelineFileWorkspace.tsx` |
| Sticky shell | `components/PipelineFileWorkspaceShell.tsx` |
| Deal editor | `components/intake/IntakeEditor.tsx` |
| Cover / scenario | `components/intake/IntakeSections2.tsx` |
| Overview section | `IntakeEditor.tsx` (`OverviewSection`) |
| Page route | `app/pipeline/[fileId]/page.tsx` |
| Data hook | `hooks/usePipelineFileWorkspaceData.ts` |
| Commits | `lib/pipeline/pipelineTableCommits.ts` |
