# Phase 37.3.A — Tab 1 (File Overview) Migration Audit

**Date:** 2026-06-23  
**Status:** Read-only audit — **no code modified**  
**Goal:** Identify exact sources, JSX ranges, and dependencies for moving File Overview surfaces into `FileWorkspaceTabShell` tab `overview`.

**Canonical workspace:** `lender-app/components/PipelineFileWorkspace.tsx` (~5,060 LOC)  
**Block registry:** `lender-app/lib/pipelineBlockRegistry.ts`  
**Tab shell:** `lender-app/components/pipeline/FileWorkspaceTabShell.tsx` (`overview` placeholder today)

---

## 1. Executive summary

| User-facing surface | Registry `blockId` | Implementation | IntakeEditor? | Lift difficulty |
|---------------------|-------------------|----------------|---------------|-----------------|
| **Task Matrix** (triage feed) | `tasks` | `FileTasksBlock` — modular | **No** — independent drawer block | **Medium** — needs parent mutations + `TaskDrawer` overlay |
| **Unified Notes** | `fileNotes` | `FileNotesBlock` — modular | **No** — independent drawer block | **Low** — self-contained Convex inside child components |
| **Associated Contacts** | `contacts` | `FileContactsBlock` — modular (lazy) | **No** — independent drawer block | **Medium** — parent supplies mutation callbacks |
| **Activity / audit feed** | *(none — not a drawer block)* | `PipelineFileActivityPanel` | **No** — lives in `layoutStrip` | **Low** — self-contained; different scroll region today |
| **Lenders** | `lenders` | **~400 lines inlined** in workspace | **No** — independent drawer block | **High** — no `LenderAssignmentBlock`; extract or hoist handlers first |

**Naming clarifications**

- There is **no** component named `LenderAssignmentBlock` or `TaskMatrix` in the repo.
- **“Task Matrix”** = the in-file triage UI rendered by `FileTasksBlock` (`data-file-tasks-triage="true"`).
- **“Unified Notes”** = `FileNotesBlock` (`NoteComposer` + `NoteThread` on `pipelineFileNotes`).
- **“Activity Feed”** in product language may mean either:
  1. **`PipelineFileActivityPanel`** — server-written audit log (`pipelineFileActivity`, undo support), or
  2. **`FileNotesBlock` history** — user-authored note thread.
  
  These are **two different data systems**; Tab 1 should decide whether both belong in Overview or Activity tab (Phase 37.2 mapped audit feed to tab 6).

**IntakeEditor:** None of the Tab 1 candidate blocks live inside `IntakeEditor`. They are **drawer blocks** (or layout-strip panels) orchestrated by `PipelineFileWorkspace`.

---

## 2. Render architecture (today)

```
PipelineFileWorkspaceShell
├── <header> chrome          ← GlobalBanner + legacy chrome (Phase 37.2)
└── [data-pipeline-workspace-scroll]
    ├── scrollLead           ← FileWorkspaceTabShell (placeholders)
    ├── accessBanner
    ├── workspace utilities  (collapsible quick panels)
    ├── layoutStrip          ← PipelineFileInsightsPanel, PipelineFileActivityPanel, layout controls
    └── blocks               ← activeBlockIds.map → 13 CollapsibleSection drawer blocks
```

**Block loop entry:** `blocks` prop → `activeBlockIds.map((sid) => …)` starting ~L2981.

**Layout state (global to workspace, not IntakeEditor):**

| State / hook | Purpose | Lines (approx) |
|--------------|---------|----------------|
| `drawerLayout` / `setDrawerLayout` | Order, hidden, expanded, per-block settings | L621–635, persisted per file |
| `sectionExpanded(sid)` | Collapsible open/closed per block | L642–644 |
| `activeBlockIds` | Visible blocks after layout + visibility rules | L735–749 |
| `jumpToDrawerSection(sid)` | Expand + scroll to `#pipeline-block-{sid}` | L1503–1523 |
| `drawerSectionBadge(sid)` | Filled-field counts in block headers | L1224–1230 |

Moving a block to Tab 1 must either **bypass** drawer collapse chrome or **replicate** expand semantics inside the tab panel.

---

## 3. Registry mapping (`pipelineBlockRegistry.ts`)

| blockId | Label | componentReference | uiSurface |
|---------|-------|-------------------|-----------|
| `tasks` | Tasks | `components/pipeline/blocks/FileTasksBlock.tsx` | drawer |
| `fileNotes` | File notes | `components/pipeline/blocks/FileNotesBlock.tsx` | drawer |
| `contacts` | Contacts | `components/pipeline/blocks/FileContactsBlock.tsx` | drawer |
| `lenders` | Lenders | `components/PipelineFileWorkspace.tsx` *(inline)* | drawer |

Related **non-registry** surface:

| Surface | File | Role |
|---------|------|------|
| File history / audit | `components/PipelineFileActivityPanel.tsx` | Compliance undo feed — **not** in `PIPELINE_BLOCK_IDS` |

Phase 37.2 tab plan placed **lenders** under tab 5 (`lendersTerms`). Phase 37.3.A includes lenders in the Overview audit per product directive — flag as **scope decision** before move.

---

## 4. Data subscriptions (`usePipelineFileWorkspaceData.ts`)

Parent workspace already centralizes Convex reads used by Tab 1 candidates:

| Export | Convex source | Used by |
|--------|---------------|---------|
| `linkedTasks` | `api.tasks.byRelatedFile` | `FileTasksBlock` |
| `fileTaskAttachmentCounts` | derived from `linkedTasks` | `FileTasksBlock` |
| `standaloneContacts` | contacts list | `FileContactsBlock` |
| `associatedContactLinks` | contact file links | `FileContactsBlock`, insights |
| `searchHits` | `api.lenders.list` (when `lenderSearch` non-empty) | Lenders inline block |
| `detail.lenders` | file detail query | Lenders inline block |

Additional workspace-local queries (not in hook):

| Query | Lines (approx) | Used by |
|-------|----------------|---------|
| `api.fileLenders.listByFile` | L527–535 | Declined/chosen lender link metadata |
| `api.organizationSettings.getContactRoles` | L515–525 | `FileContactsBlock` role selects |

---

## 5. Surface audits

### 5.1 Task Matrix — `FileTasksBlock` (`tasks`)

**Registry:** `blockId: "tasks"` · category `execution` · not mandatory.

**Imports in `PipelineFileWorkspace.tsx`:**

```typescript
import { FileTasksBlock } from "@/components/pipeline/blocks/FileTasksBlock";
import { TaskDrawer } from "./TaskDrawer";
```

**Component file:** `lender-app/components/pipeline/blocks/FileTasksBlock.tsx` (353 LOC)

**Inner architecture (self-contained UI state):**

- Own Convex: `api.organizationSettings.getTaskColorPresets`, `api.organizationTriageLabels.listTriageLabels`, `api.tasks.patch`, `api.tasks.wakeUpTask`
- Child components: `FileTaskTriageComposer`, `FileTaskTriageFeedRow`, `TaskTemplateApplyModal`, `TaskTriageLabelManagerSheet`, `TaskTriageQuickEditPopover`, `TaskAttemptSnoozeSheet`, `TaskAttemptAuditDialog`
- Test id: `data-testid="file-tasks-triage-block"`

**JSX mount range in workspace:** **L4417–L4524** (inside `sid === "tasks"` branch)

```4417:4524:lender-app/components/PipelineFileWorkspace.tsx
                ) : sid === "tasks" ? (
          <div id="pipeline-block-tasks">
          <CollapsibleSection ...>
            <FileTasksBlock
              tasks={linkedTasks ?? []}
              loading={linkedTasks === undefined}
              attachmentCounts={fileTaskAttachmentCounts ?? undefined}
              organizationId={orgConvexArgs?.organizationId}
              memberUserKey={convexMemberKey ?? orgConvexArgs?.memberUserKey}
              pipelineFileId={p._id}
              actorUserKey={convexMemberKey ?? undefined}
              disabled={!canUseHub || !orgConvexArgs}
              onAdd={async (payload) => { /* createTask mutation */ }}
              onToggleDone={async (t) => { /* runPatchTask / completeTask */ }}
              onDelete={async (t) => { /* removeTask */ }}
              onPatchTask={async (t, patch) => { await runPatchTask(t, patch); }}
              onOpen={(taskId) => setOpenTaskId(taskId)}
            />
          </CollapsibleSection>
          </div>
```

**Parent dependencies (must move with block or into a facade hook):**

| Dependency | Lines (approx) | Notes |
|------------|----------------|-------|
| `linkedTasks`, `fileTaskAttachmentCounts` | data hook | Pass-through props |
| `orgConvexArgs`, `convexMemberKey`, `canUseHub` | workspace | Org gate for mutations |
| `createTask`, `runPatchTask`, `completeTask`, `removeTask` | L1281–1308, callbacks in JSX | Task CRUD |
| `openTaskId` / `setOpenTaskId` | L609, L4521 | Opens task inspector |
| **`TaskDrawer` overlay** | **L4700–L4712** | **Outside** drawer block loop — required for `onOpen` |

**IntakeEditor:** Not used.

**Drawer chrome to drop in tab:** `CollapsibleSection` + `DrawerBlockHeaderExtras` (L4419–L4431).

**Migration note:** Extract a `FileTasksBlockContainer` that owns mutations + `TaskDrawer`, or keep overlay at workspace root and pass `onOpen` from Tab 1 panel.

---

### 5.2 Unified Notes — `FileNotesBlock` (`fileNotes`)

**Registry:** `blockId: "fileNotes"` · settings schema: `{ rows: 4 }`.

**Imports:**

```typescript
import { FileNotesBlock } from "@/components/pipeline/blocks/FileNotesBlock";
```

**Component file:** `lender-app/components/pipeline/blocks/FileNotesBlock.tsx` (62 LOC)

**Inner architecture (highly self-contained):**

- `NoteComposer` + `NoteThread` — own Convex subscriptions inside `components/pipeline/notes/`
- Data: `pipelineFileNotes` + `pipelineFileNoteLinks`
- Props: `pipelineFileId`, `organizationId`, `memberUserKey`, optional `blockSettings.rows`

**JSX mount range:** **L3359–L3399**

```3359:3399:lender-app/components/PipelineFileWorkspace.tsx
                ) : sid === "fileNotes" ? (
          <div id="pipeline-block-fileNotes">
          <CollapsibleSection ...>
            {(p.organizationId ?? activeOrganizationId) ? (
              <FileNotesBlock
                blockSettings={fileNotesResolvedSettings}
                pipelineFileId={p._id}
                organizationId={(p.organizationId ?? activeOrganizationId) as Id<"organizations">}
                memberUserKey={convexMemberKey}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select an organization...</p>
            )}
          </CollapsibleSection>
          </div>
```

**Parent dependencies:**

| Dependency | Lines | Notes |
|------------|-------|-------|
| `fileNotesResolvedSettings` | L751–754 | `resolveDrawerBlockSettings("fileNotes", drawerLayout)` |
| `activeOrganizationId`, `p.organizationId` | — | Org gate |
| `convexMemberKey` | — | Member key for Convex |

**IntakeEditor:** Not used. Deal `notes` tab is separate (inside `IntakeEditor` deal sections).

**Migration note:** Easiest lift — mount `FileNotesBlock` directly in Tab 1; optionally drop drawer settings or pass fixed `rows`.

---

### 5.3 Activity feed — `PipelineFileActivityPanel` (audit log)

**Not in block registry.** Lives in **`layoutStrip`**, not `blocks`.

**Import:**

```typescript
import { PipelineFileActivityPanel } from "@/components/PipelineFileActivityPanel";
```

**Component file:** `lender-app/components/PipelineFileActivityPanel.tsx` (281 LOC)

**JSX mount range:** **L2847–L2854**

```2847:2854:lender-app/components/PipelineFileWorkspace.tsx
              <PipelineWorkspaceSection
                htmlId="pipeline-ws-file-activity"
                sectionId="file-activity"
                ...
              >
                <PipelineFileActivityPanel fileId={p._id} />
              </PipelineWorkspaceSection>
```

**Inner architecture (self-contained):**

- Own state: `open`, `busyRow`, `busyLast`, `err`
- Convex: `api.pipelineFileActivity.listForFile` (lazy — skipped until expanded)
- Mutations: `undoActivity`, `undoMostRecentForFile`
- Uses `useUserPreferences().accountId` internally for `memberUserKey`
- Nested scroll: `data-nested-scroll` on event list (L195–196)

**Parent dependencies:** **`fileId` only** — no drawer layout, no IntakeEditor.

**Distinction from notes:** This is the **system audit trail** (patch undo, automation events), not user notes.

**Migration note:** Can mount in Tab 1 or defer to tab `activity` per Phase 37.2 map; moving it removes duplicate “activity” concept if both tabs show history.

---

### 5.4 Associated Contacts — `FileContactsBlock` (`contacts`)

**Registry:** `blockId: "contacts"`.

**Imports:**

```typescript
const FileContactsBlockLazy = nextDynamic(
  () => import("@/components/pipeline/blocks/FileContactsBlock").then(...),
  { ssr: false, loading: () => ... }
);
```

**Component file:** `lender-app/components/pipeline/blocks/FileContactsBlock.tsx` (~500 LOC)

**JSX mount range:** **L4272–L4383**

```4272:4383:lender-app/components/PipelineFileWorkspace.tsx
                ) : sid === "contacts" ? (
          <CollapsibleSection ... title="Associated Contacts">
            <FileContactsBlockLazy
              contacts={standaloneContacts ?? []}
              links={associatedContactLinks ?? []}
              contactRoles={workspaceContactRoles}
              onLink={async (...) => upsertContactFileLink({...})}
              onCreateAndLink={async (...) => { createContact(...); upsertContactFileLink(...); }}
              onUpdateLink={async (link) => upsertContactFileLink({...})}
              onRemoveLink={async (linkId) => removeContactFileLink({...})}
              legacyContactCount={legacyContactCount}
            />
          </CollapsibleSection>
```

**Parent dependencies:**

| Dependency | Lines (approx) |
|------------|----------------|
| `standaloneContacts`, `associatedContactLinks` | data hook |
| `workspaceContactRoles` | L515–525 query |
| `workspaceContactById` | L550–556 memo |
| `upsertContactFileLink`, `removeContactFileLink`, `createContact` | mutations ~L843+ |
| `contactRoleDisplayName`, `effectiveContactRoleIdFromDoc` | role helpers |
| `legacyContactCount` | L2117 (`p.contacts?.length`) |

**Related but separate — header `LinkedClientsEditor`:** L2587–2592 inside legacy chrome disclosure — manages **loan client relationships** (hub graph), not `contactFileLinks`. Do not conflate with `FileContactsBlock`.

**IntakeEditor:** Borrower tabs inside deal workspace are separate (`borrowers`, `guarantors` deal tabs).

**Migration note:** Medium effort — extract contact link handlers to `useFileContactLinksActions` facade for Tab 1 mount.

---

### 5.5 Lenders — inline block (`lenders`)

**Registry:** `blockId: "lenders"` · **componentReference points at workspace file** — not componentized.

**There is no `LenderAssignmentBlock`.** Entire UI is inline JSX.

**JSX mount range:** **L3871–L4271** (~400 lines)

**Structure inside `CollapsibleSection`:**

1. Mobile tab switcher (`mobileLenderPanel`: find vs on-file) — L3966–L4001
2. Search field + `searchHits` result list + attach buttons — L4002–L4086
3. “On this file” linked lender list (`sortedLenderRows`) — L4088–L4269
4. Per-row: reject, restore, select/chosen star, detach — L4183–L4264
5. Header actions: clear others / clear all — L3898–L3961

**Workspace imports used by lenders block:**

```typescript
import { SearchField } from "./ui/SearchField";
import { ActionSuiteModal } from "./ui/ActionSuite";
// Icons: Building2, Star, Eraser, Trash2
```

**Local state (workspace-level — must travel with extraction):**

| State | Lines (approx) |
|-------|----------------|
| `lenderSearch`, `setLenderSearch` | L483, L4019–L4023 |
| `attachError`, `attaching`, `detaching`, `selecting` | L590–593 |
| `rejectModalLenderId`, `rejectReason`, `rejecting` | L594–597 |
| `restoring`, `confirmClear`, `clearing` | L598–605 |
| `mobileLenderPanel`, `narrow` | L609–613, L3966+ |

**Mutations:**

| Mutation | Lines |
|----------|-------|
| `attachLender` | L1097, handler L1919–L1934 |
| `detachLender` | L1098, handler L1936–L1951 |
| `selectLender` | L1099, handler L1953–L1968 |
| `rejectLenderLink` | L1100, handler L1970–L1990 |
| `restoreLenderLink` | L1101, handler L1993–L2009 |
| `clearOtherLenders` | L1102, handler L2011–L2027 |

**Derived data:**

| Symbol | Source |
|--------|--------|
| `lenderRows`, `sortedLenderRows`, `linkedIds` | L1883–L1807 |
| `searchHits` | data hook + `lenderSearch` |
| `fileLenderLinkById` | L536–548 (`api.fileLenders.listByFile`) |

**Modal outside block loop:** **L4715–L4772** — `ActionSuiteModal` for rejection reason (must move with lenders UI).

**IntakeEditor:** Not used.

**Migration note:** Highest risk. Recommend **Phase 37.3.B** extract `FileLendersBlock.tsx` mirroring `FileTasksBlock` pattern before tab mount. Until then, duplicating inline JSX in Tab 1 would fork event handlers.

---

## 6. Overlays & listeners outside the block loop

These are **not** inside `activeBlockIds.map` but are **required** by Tab 1 candidates:

| Overlay | Trigger | Lines | Required by |
|---------|---------|-------|-------------|
| `TaskDrawer` | `openTaskId` | L4700–L4712 | Task Matrix |
| `ActionSuiteModal` (lender reject) | `rejectModalLenderId` | L4715–L4772 | Lenders |
| `PipelineDrawerParallelBlockContainer` | block automation | L4691–L4695 | Indirect (block visibility signals) |

**Presence / focus:** `openTaskId` feeds presence model (L1563–L1579) — keep wired when tasks move.

---

## 7. IntakeEditor vs drawer — state check

| Surface | Wrapped in IntakeEditor? | Wrapper today |
|---------|--------------------------|---------------|
| FileTasksBlock | **No** | Drawer `CollapsibleSection` |
| FileNotesBlock | **No** | Drawer `CollapsibleSection` |
| FileContactsBlock | **No** | Drawer `CollapsibleSection` |
| Lenders inline | **No** | Drawer `CollapsibleSection` |
| PipelineFileActivityPanel | **No** | `layoutStrip` `PipelineWorkspaceSection` |
| IntakeEditor / deal tabs | **Yes** | `dealWorkspace` block only (L3400–L3432) |

**Data-binding risk:** Moving drawer blocks to Tab 1 does **not** break IntakeEditor deal field paths. Risk is limited to:

1. Losing `drawerLayout.expanded` persistence for moved blocks
2. Breaking `jumpToDrawerSection("tasks" | "fileNotes" | "contacts" | "lenders")` deep links (`PIPELINE_FILE_BLOCK_QUERY`, insights panel)
3. Duplicate rendering if legacy drawer copies remain during dual-workspace phase

---

## 8. Recommended Tab 1 mount order (Phase 37.3.B)

| Step | Surface | Action |
|------|---------|--------|
| 1 | `FileNotesBlock` | Mount in `overview` tab; leave legacy drawer copy until verified |
| 2 | `PipelineFileActivityPanel` | Decide tab ownership (Overview vs `activity`); mount |
| 3 | `FileContactsBlock` | Extract link mutation hook; mount |
| 4 | `FileTasksBlock` + `TaskDrawer` | Container component; mount |
| 5 | Lenders | Extract `FileLendersBlock` from L3871–L4271 + modal L4715–L4772 **before** tab mount |

---

## 9. Files to touch (execution preview — not done in 37.3.A)

| File | Change |
|------|--------|
| `components/pipeline/FileWorkspaceTabShell.tsx` | Replace `overview` placeholder with composed panel |
| `components/PipelineFileWorkspace.tsx` | Pass props / render Tab 1 content; optional legacy hide flags per block |
| `components/pipeline/blocks/FileLendersBlock.tsx` | **New** — extract lenders inline (recommended) |
| `components/pipeline/FileOverviewTabPanel.tsx` | **New** — optional composition root |
| `lib/pipelineBlockRegistry.ts` | Optional `uiSurface: "tab"` / tab registry extension |
| `docs/phase37-2-ui-audit.md` | Update when tab ownership finalized |

---

## 10. Quick reference — JSX line index

| Surface | `sid` / region | Start | End |
|---------|----------------|-------|-----|
| Activity audit panel | `layoutStrip` | 2847 | 2854 |
| File notes | `fileNotes` | 3359 | 3399 |
| Lenders (inline) | `lenders` | 3871 | 4271 |
| Associated contacts | `contacts` | 4272 | 4383 |
| Tasks / Task Matrix | `tasks` | 4417 | 4524 |
| TaskDrawer overlay | workspace root | 4700 | 4712 |
| Lender reject modal | workspace root | 4715 | 4772 |
| Blocks loop | `blocks` prop | 2981 | 4696 |

*Line numbers refer to `PipelineFileWorkspace.tsx` as of Phase 37.2.B completion.*

---

## 11. Constraint confirmation

**No code was moved, modified, or deleted in this audit.**  
Next step: **Phase 37.3.B** — implement Tab 1 `overview` panel starting with `FileNotesBlock` + `FileTasksBlock` containers, per low-hanging-fruit order above.
