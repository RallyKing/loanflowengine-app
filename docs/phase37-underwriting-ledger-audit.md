# Phase 37.8.U.1 — Underwriting Ledger & Task Condition Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — **no application code changed**  
**Goal:** Map task/condition/underwriting primitives, lender allocation data, Tab 6 shell state, and staging blueprint for an underwriting control-center tab.

**Prerequisite docs:** `docs/phase37-macro-alignment-audit.md` §3.7, `docs/phase37-client-portal-audit.md`, `docs/project-intelligence-summary.md`, `lender-app/docs/collaboration-architecture-audit.md`.

---

## 1. Executive summary

| Finding | Detail |
|---------|--------|
| **No dedicated underwriting ledger table** | No `conditions`, `stipulations`, `pipelineTasks`, or `underwritingItems` schema exists |
| **Task system** | Canonical **`tasks`** table + **`tasks.byRelatedFile`** query; status = `todo` \| `in_progress` \| `done` \| `archived` (not satisfied/waived) |
| **Borrower “conditions” proxy** | **`clientPortalRequests`** — broker-created, client-facing; `open` \| `done` |
| **Deal milestone checklist** | **`dealData.workflow[]`** and **`dealData.cover.lenders[]`** — JSON in pipeline row / intake, not relational UW rows |
| **Lender allocation** | **`pipeline.lenders[]`**, **`selectedLenderId`**, **`fileLenders`** junction (`quoted` \| `selected` \| `submitted` \| `declined`), legacy + indexed graph dual-read |
| **Post-funding ledger** | **`ledger`** + **`payments`** — revenue after fund; **not** an underwriting condition tracker |
| **Tab 6 shell today** | Key **`settings`**, label **“Settings”** — **`TabPlaceholder` only**; no `UnderwritingTab.tsx` |
| **Live task UX today** | **`FileTasksBlock`** on **Tab 1 Overview** (`OverviewTab` → `tasks.byRelatedFile`) |
| **Live lender UX today** | **`LenderSummaryBlock`** on Tab 1 + full lenders drawer / `fileLenders` API |

**Critical naming note:** The 6-tab blueprint’s **sixth slot is currently `settings`**, not `underwriting`. Phase 37.8 product intent likely requires **either renaming/repurposing Tab 6** or introducing an **`underwriting` tab key** in a future shell migration. This audit treats **Tab 6 = index 5 = `settings` placeholder** as the mount boundary unless product renames the key.

**Recommended strategy:** Build an **`UnderwritingLedgerTab`** (or repurpose `settings`) as a **read-model orchestrator** over existing stores — do **not** invent a parallel condition table until unified UW semantics are defined. Start with **segmented sub-sections** + optional unified timeline in a later slice.

---

## 2. Task & workflow schema inventory

### 2.1 Canonical `tasks` table

**Source:** `convex/schema.ts` L1835–2037; API: `convex/tasks.ts`

| Field | Type | Role |
|-------|------|------|
| `title`, `description` | string | Primary copy |
| `type` | `work` \| `personal` \| `errands_groceries` | Task class |
| `category` | `errand` \| `research` \| `call` \| `admin` \| `project` | Hub taxonomy |
| `status` | **`todo` \| `in_progress` \| `done` \| `archived`** | Lifecycle (not UW-specific) |
| `dueDate`, `startDate` | optional Unix ms | Scheduling |
| `completedAt` | optional Unix ms | Set when marked done |
| `assigneeId`, `ownerUserId` | optional string | Ownership (multi-user scaffold) |
| `relatedFileId` | optional `Id<"pipeline">` | **File linkage** — index `by_relatedFile` |
| `relatedContactId` | optional `Id<"contacts">` | CRM linkage |
| `parentTaskId`, `linkedTaskIds` | hierarchy / graph | Subtasks & cross-links |
| `checklist` | `{ text, done }[]` | Inline micro-steps |
| `triageLabelId`, `highlightColorId` | optional | Visual triage (Phase 21–22) |
| `attemptCount`, `lastAttemptAt` | optional | Follow-up attempts (denormalized) |
| `recurrence` | optional rule object | Repeating tasks |
| `organizationId` | optional org FK | Tenant scope |

**File-scoped query:** `tasks.byRelatedFile({ fileId, organizationId, memberUserKey })` — returns all org tasks with `relatedFileId === fileId`, ordered desc.

**There is no** `assignedTo` FK — use `assigneeId` / `ownerUserId` strings. **There is no** `resolvedAt` — use `completedAt`. **There is no** `open` \| `satisfied` \| `waived` enum.

### 2.2 Task attachments & templates

| Table | Purpose |
|-------|---------|
| **`taskAttachments`** | Blobs on tasks (`storageId`, `by_task`) |
| **`taskTemplates`** / **`taskTemplateGroups`** | Playbook definitions; **`TaskTemplateApplyModal`** clones into file tasks |
| **`organizationTriageLabels`** | Label presets for file task triage |
| **`taskNotifications`** | Assign/reassign inbox |

### 2.3 Graph junction: `fileTasks`

**Source:** `schema.ts` L1113–1131

Links `fileId` ↔ `taskId` with `relationshipType`: `related` \| `blocked_by` \| `follow_up` \| `other`. Part of Phase 15 indexed graph; **`relatedFileId` on `tasks` remains the primary file-task query path** for the drawer/overview UI.

### 2.4 Task follow-up audit trail

Not a separate `taskAttempts` table. Attempts surface as:

- Denormalized counters on **`tasks`** (`attemptCount`, `lastAttemptAt`)
- **`pipelineFileNotes`** with `noteKind: "attempt"`, `linkedTaskId`, `attemptNumber` (L3620–3627)

UI: `TaskAttemptSnoozeSheet`, `TaskAttemptAuditDialog` in `FileTasksBlock`.

### 2.5 Intake workflow checklist (deal JSON — not `tasks`)

**Source:** `convex/intakeSchemaPart.ts` L79–83, L519–520

```typescript
workflowItem: { label: string; done: boolean; date?: string }
dealData.workflow: workflowItem[]
```

Used in **`IntakeEditor`** for broker-internal milestones (intro email, EDU, scenario, etc.). **Stored in `pipeline.dealData` or linked `intakeSheets`** — no Convex mutation dedicated to “UW condition satisfied.”

### 2.6 Lender submission milestone dates (deal JSON)

**Source:** `coverLender` in `intakeSchemaPart.ts` L200–208

| Field | Meaning |
|-------|---------|
| `name` | Lender label on coversheet |
| `submission`, `approval`, `appraisal`, `ctc`, `docsOut`, `funded` | **Date strings** (typically ISO date inputs) |

Lives at **`dealData.cover.lenders[]`**. UI: `IntakeSections2.tsx` — “Date each milestone across up to 3 lender submissions.” **Not synced to `fileLenders` or `tasks`.**

---

## 3. “Conditions” & stipulations — what exists today

| Concept | Store | Status model | Scoped to file? |
|---------|-------|--------------|-----------------|
| **Internal tasks** | `tasks` | todo / in_progress / done / archived | Yes (`relatedFileId`) |
| **Client document requests** | `clientPortalRequests` | **open / done** | Yes (`pipelineFileId`) |
| **Client status feed** | `clientPortalUpdates` | N/A (informational) | Yes |
| **Deal workflow checklist** | `dealData.workflow[]` | done boolean + optional date | Yes (deal JSON) |
| **Lender milestone dates** | `dealData.cover.lenders[]` | date strings per stage | Yes (deal JSON) |
| **Pipeline stage** | `pipeline.status` + org `stageId` / `subStageId` | string / FK | Yes |
| **Dedicated UW conditions** | **None** | — | — |

**`clientPortalRequests`** is the closest relational primitive to “borrower must provide X” but it is **portal-scoped** (requires `grantId`) and broker-authored — not a general underwriting stipulation registry.

**Comms templates** reference “conditions” (`lib/comms/seedTemplates.ts` slug `condition-update`) — copy only, not schema.

---

## 4. Lender assignment & allocation primitives

### 4.1 Pipeline row (legacy + canonical list)

**Source:** `pipeline` table L1352–1372

| Field | Role |
|-------|------|
| **`lenders`** | `Id<"lenders">[]` — all lenders associated with file |
| **`selectedLenderId`** | Chosen funding lender (must be in `lenders[]`) |
| **`selectedLenderSentAt`** | Manual “sent to selected lender” date (Unix ms) |
| **`termOptions`** | Quote-style term drafts (rate, term, prepay, appraisal flag, etc.) L1508–1523 |
| **`status`** / **`stageId`** / **`subStageId`** | Pipeline position (includes value `underwriting` in UI taxonomy — `lib/pipelineStatus.ts`) |

**Mutations:** `pipeline.selectLender`, `pipeline.patch`, lender attach/detach in `pipeline.ts` + `indexedGraphEdgeSync.ts`.

**No field** for net lock rate, lock expiration, or submission batch ID at pipeline top level — pricing lives in **`termOptions`** strings or deal calculators.

### 4.2 Relational junction: `fileLenders`

**Source:** `schema.ts` L1050–1071; API: `convex/fileLenders.ts`

| Field | Role |
|-------|------|
| `fileId`, `lenderId`, `organizationId` | Edge keys |
| **`relationshipType`** | **`quoted` \| `selected` \| `submitted` \| `declined` \| `other`** |
| **`rejectionReason`** | Optional when declined (Phase 26.1) |
| `sortOrder`, timestamps | Ordering / audit |

**Query:** `fileLenders.listByFile` — returns link summaries for UI badges (used by `LenderSummaryBlock`).

**Sync:** `syncFileLenderEdgesFromPipeline` keeps junction aligned with `pipeline.lenders[]` / selection during graph migrations.

### 4.3 Lender profile attachments (not file-scoped)

**`lenderAttachments`** — guidelines/term sheets on **`lenders`** CRM rows, not per pipeline file.

### 4.4 Lender discovery candidates

**`lenderCandidates`** — AI-suggested lenders pre-acceptance; separate from file allocation.

### 4.5 Live UI surfaces

| Surface | Component | Tab / location |
|---------|-----------|----------------|
| Summary cards | `LenderSummaryBlock` | Tab 1 Overview |
| Full manager | Lenders drawer block | Legacy drawer (`legacyLendersExpanded`) |
| Match / shop | Lender match blocks | Tab 3 Deal Workspace (scenario section) |
| Terms export | Generate Terms / `termOptions` | Pipeline drawer |

---

## 5. Revenue ledger (do not conflate with UW)

**Tables:** `ledger` (L1779), `payments` (L1816)

- One **`ledger`** row per **funded** file — expected gross/net, payment mode
- **`payments`** — individual receipts against ledger

Used by **`/ledger`** route and `projectIntoLedger` on pipeline. **Out of scope** for underwriting condition tracking unless product explicitly ties “CTC cleared” to funding ledger events.

---

## 6. Tab 6 shell state & entry boundary

### 6.1 Six-tab order (`FileWorkspaceTabShell.tsx`)

| Index | Tab key | Label | Panel state |
|-------|---------|-------|-------------|
| 0 | `overview` | File Overview | Wired |
| 1 | `dealInfo` | Deal Info | Wired |
| 2 | `dealWorkspace` | Deal Workspace | Wired |
| 3 | `documents` | Documents | Wired (`DocumentVaultTab`) |
| 4 | `clientPortal` | Client Portal | Wired (`ClientPortalTab`) |
| **5** | **`settings`** | **Settings** | **`TabPlaceholder`** |

**Files under `components/pipeline/tabs/` today:**  
`OverviewTab`, `DealInfoTab`, `DealWorkspaceTab`, `DocumentVaultTab`, `ClientPortalTab`, plus vault helpers — **no `SettingsTab.tsx` or `UnderwritingLedgerTab.tsx`.**

**Shell props wired:** `overviewPanel`, `dealInfoPanel`, `dealWorkspacePanel`, `documentsPanel`, `clientPortalPanel` — **no `settingsPanel` / `underwritingPanel`.**

**Fallback routing:** Any unwired tab (including **`settings`**) renders `TabPlaceholder` with `data-testid="pipeline-tab-placeholder-{tabId}"`.

### 6.2 Related live admin UI (not in Tab 6 body)

Per `docs/phase37-macro-alignment-audit.md` §3.7:

- Drawer blocks: `people`, `archive`, `dangerZone`
- Per-file drawer layout strip
- File templates / layout controls

Underwriting-relevant work (**tasks**, **lenders**, **portal requests**) currently lives on **Tab 1**, **Tab 5**, and **legacy drawer** — not Tab 6.

---

## 7. API & module reference map

| Domain | Primary module | Key exports |
|--------|----------------|-------------|
| File tasks | `convex/tasks.ts` | `byRelatedFile`, `create`, `patch`, `complete`, `remove` |
| Task UI | `components/pipeline/blocks/FileTasksBlock.tsx` | Triage composer, templates, feed |
| Portal requests | `convex/clientPortalAdmin.ts` | `createClientRequest`, `listPortalUploadsForBroker` |
| Portal client requests | `convex/clientPortal.ts` | `getFileBundle`, `completeClientRequest` |
| Lender links | `convex/fileLenders.ts` | `listByFile`, reject/reinstate mutations |
| Pipeline lenders | `convex/pipeline.ts` | `selectLender`, attach/detach, `termOptions` via patch |
| Deal workflow | `convex/pipeline.ts` / `patchDeal` | Mutates `dealData.workflow`, `dealData.cover.lenders` |
| File notes / attempts | `convex/pipelineFileNotes.ts` (implied) | Notes with `linkedTaskId` |
| Stage taxonomy | `organizationPipelineStages` | Org-scoped stage/sub-stage |

---

## 8. Gaps vs underwriting ledger product vision

| ID | Gap | Impact |
|----|-----|--------|
| G-1 | No unified **`underwritingItems`** or **`conditions`** table | Cannot query one ledger across task + portal + deal JSON |
| G-2 | **Incompatible status enums** | tasks ≠ portal requests ≠ workflow booleans |
| G-3 | **Lender milestones in JSON** | Hard to filter/sort/report without normalization |
| G-4 | **Tab 6 is `settings` placeholder** | No mount point for UW dashboard yet |
| G-5 | **Tasks duplicated in UX** | Tab 1 feed vs future Tab 6 — need canonical owner |
| G-6 | **`clientPortalRequests` grant-scoped** | Not all borrower asks are portal grants |
| G-7 | **No waive/satisfy semantics** | Only done/archived or open/done |

---

## 9. Development staging blueprint

### Phase 37.8.U.2 — Tab shell & product key decision

1. **Decision:** Repurpose Tab 6 key `settings` → `underwriting` (label “Underwriting”) **or** keep `settings` and add UW as primary body (admin moves to Settings route).
2. Add `underwritingPanel` prop to `FileWorkspaceTabShell` (mirror Tab 4/5 pattern).
3. Create `components/pipeline/tabs/UnderwritingLedgerTab.tsx` placeholder with section anchors.

### Phase 37.8.U.3 — Read-model queries (no new table yet)

1. **`underwritingLedger.listForFile`** query — returns normalized DTO union:
   - `kind: "task" | "portal_request" | "workflow_item" | "lender_milestone" | "file_lender_link"`
   - Common: `id`, `title`, `status`, `dueAt?`, `completedAt?`, `sourceRef`, `sortAt`
2. Client-side merge + sort (or server merge) — **newest / due-soon first**.

### Phase 37.8.U.4 — Segmented UI (recommended first UX)

Sub-sections inside Tab 6:

| Section | Source |
|---------|--------|
| **Action queue** | Open `tasks` + open `clientPortalRequests` |
| **Lender track** | `fileLenders` + `cover.lenders` milestones |
| **Internal checklist** | `dealData.workflow` |
| **Completed / waived** | Archived tasks + done portal requests |

Optional **“All items”** toggle flattens sections with type chips.

### Phase 37.8.U.5 — Write-path unification (later)

Only if product requires **`satisfied` / `waived`**:

- Add optional `underwritingLedgerLinks` table **or** extend `tasks` with `uwKind` + `resolution: satisfied|waived|open`
- Migrate `clientPortalRequests` visibility into ledger read-model (keep grant FK)
- Bridge `dealData.workflow` toggles through dual-write helper (like Phase 37.3 contacts)

### Phase 37.8.U.6 — QA & deploy

- `npm run build` + `npm run qa:governance` + `npm run deploy:prod`
- Mobile: Tab 6 sticky sub-nav, single scroll owner on file route

---

## 10. Design philosophy — integrated list vs sub-sections

**Question:** Should the underwriting dashboard be one integrated tagged list, or distinct sub-sections?

### Recommendation: **Segmented sub-sections first, optional unified timeline second**

| Approach | Pros | Cons |
|----------|------|------|
| **Single integrated list** | One scan line for brokers; good for “what’s due today” | Today’s data lives in **4+ stores** with different status vocabularies and mutation paths; heavy adapter layer; easy to break portal/task semantics |
| **Distinct sub-sections** | Matches current architecture; clear ownership per source; faster Phase 37.8 ship | Cross-type prioritization requires a summary row or “Action queue” strip |

**Suggested default layout for Tab 6:**

1. **Top strip:** “Action queue” — merged **open tasks + open portal requests**, sorted by due date / created date, with type chips (`Task`, `Client request`).
2. **Below:** Collapsible sections for **Lender compliance** (fileLenders + cover milestones) and **Internal workflow** (`dealData.workflow`).
3. **Phase 37.8.U.4+:** Add **“All items”** view as a filter mode on the same read-model — not the only default.

Avoid forcing **lender milestone JSON** and **relational tasks** into one flat list without normalized DTOs — compliance reporting will need the section boundaries anyway.

---

## 11. Verification checklist (read-only pass)

- [x] Searched `convex/` for tasks, conditions, stipulations, milestones
- [x] Documented `tasks` status fields and file linkage
- [x] Mapped lender allocation (`pipeline`, `fileLenders`, `termOptions`, cover lenders)
- [x] Confirmed Tab 6 = `settings` placeholder; no underwriting tab component
- [x] Staging blueprint drafted
- [x] Distinguished revenue `ledger` from UW ledger concept

**No code modified in this phase.**
