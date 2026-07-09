# Phase 24.1 — Operational status engine (architecture lock v3)

**Status:** **HARDENED — pending approval** (v3 adds `severity`, `automationEligible`; see `docs/phase24-1-status-engine-final-readiness.md`). **No schema / UI / Convex until readiness report reviewed and Track A stable.**  
**Date:** 2026-05-28 (revision 3)  
**Supersedes:** `docs/phase24-pipeline-status-architecture.md` (24.0 draft)  
**Artifact:** `migration-reports/phase24-1-status-engine-architecture-lock.json` (must match this doc)  
**Prerequisite:** `docs/tasks-create-failure-report.md`

---

## 0. Executive summary — three problems, one primary OS

Brokers run the pipeline on one question:

> **“Where is this deal stuck?”**

That is **operational status** — not row color, not funnel stage alone, not task labels.

| Business problem | System | Role |
|------------------|--------|------|
| **Pipeline progression** | `organizationPipelineStages` + `stageId` | Where the deal sits in the **lending funnel** |
| **Operational attention** | `organizationPipelineStatuses` + file `statusId` | **Primary pipeline OS** — stuck / waiting / blocked / done |
| **Visual prioritization** | Resolved from status record (`rowColor`, `pillColor`, `icon`) | **Presentation layer** — must not own semantics |

Phase 24.1 builds the **operational status engine** first. Visual treatment is **derived**, not the product definition.

**Mandatory stack:**

```text
Pipeline Stage       →  funnel progression (secondary axis)
        ↓
Operational Status   →  PRIMARY pipeline OS (semantic + rollup + filters + future SLA/automation)
        ↓
Visual State         →  derived presentation (row + pill)
        ↓
Rollup Engine        →  project/client effective status + provenance (“why this bubble?”)
```

**Also separate (unchanged):**

| System | Question |
|--------|----------|
| Task triage labels | Which **tasks** need attention? |
| Tasks / automations | What **action** happens next? |

---

## 1. Four operator concepts (unchanged separation)

| # | Question | System |
|---|----------|--------|
| 1 | What needs **attention**? | Task triage (21–22) |
| 2 | What **stage** is the deal in? | Pipeline stages (12.1) |
| 3 | What **action** is next? | Tasks + automations (future) |
| 4 | Where is the deal **stuck** / what **stands out**? | **Operational status engine (24.1)** |

---

## 2. Locked product decisions (v1 + v2)

### Decision 1 — Default status: never null

| Rule | Value |
|------|--------|
| Every new pipeline file | `statusId` set on insert |
| Default | **`New File`** (`isDefault: true`, `statusCategory: active`) |
| Null `statusId` | Forbidden after backfill |

### Decision 2 — Terminal statuses excluded from rollups

Files whose status has `statusCategory` of **`completed`** or **`closed`** do **not** participate in project/client rollup winner selection.

(`isClosed` remains a **denormalized** boolean synced from category for fast rollup queries — see §3.1.)

### Decision 3 — Status library (`organizationPipelineStatuses`)

| Field | Type | Purpose |
|-------|------|---------|
| `organizationId` | `Id<"organizations">` | Tenant |
| `name` | `string` | “Compliance Hold” |
| `description` | `optional string` | Admin help |
| **`statusCategory`** | **enum** | **`active` \| `waiting` \| `blocked` \| `review` \| `completed` \| `closed`** — drives dashboards, SLA, automations, smart filters |
| `colorToken` | `string` | Theme token |
| `icon` | `string` | Icon key |
| `sortOrder` | `number` | Settings list order **only** |
| `priorityWeight` | `number` | Rollup winner **only** (higher wins) |
| `isClosed` | `boolean` | Denormalized: `true` when category is `completed` or `closed` |
| **`severity`** | **enum** | **`normal` \| `attention` \| `warning` \| `critical`** — alerts, escalation, SLA, notifications (**independent** of category and `priorityWeight`) |
| **`automationEligible`** | **boolean** | Future: “when status becomes X…” / “when status stays X for N days…” |
| `showInFilters` | `boolean` | Hub/table filters |
| `showInDashboard` | `boolean` | Operational dashboard widgets |
| `showInRollups` | `boolean` | Participates in parent bubble selection |
| `isDefault` | `boolean` | One per org — `New File` |
| `isActive` | `boolean` | Assignable in UI |
| `rowColor` | `string` | Visual token |
| `pillColor` | `string` | Visual token |
| `createdAt` / `updatedAt` | `number` | Audit |
| `updatedByUserKey` | `optional string` | Audit |

**Rejected:** `sortOrder` for rollup; operational status as “mostly visual”; nullable file status.

### Decision 4 — Visual treatment derived from status row

No `if (name === 'Compliance Hold')` in UI. Colors/icons come from library fields + `statusCategory` defaults in token registry.

### Decision 5 — Rollup winner: `priorityWeight` only

Eligible file: member can read ∧ `showInRollups` ∧ category ∉ (`completed`, `closed`).

**Ties:** `sortOrder`, then `statusId`.

### Decision 6 — Single renderer

`PipelineOperationalStatusPill` — **only** operational status text/pill renderer.

Rollup rows also use **`PipelineOperationalStatusSourceLine`** (see §7) for “From: …” — not a second status renderer.

### Decision 7 — Future inheritance (reserved)

Direct `statusId` later on: `projects`, `clients`, `events`, `taskTemplates`. Phase 24.1 writes **`pipeline.statusId` only**.

### Decision 8 — Status categories (v2, required)

Every library row **must** have `statusCategory`. Categories are stable product vocabulary for:

- Dashboard widgets (counts by category)
- SLA timers (waiting / blocked aging)
- Automations & event triggers
- Email reminders
- Smart filters (“show all **blocked** deals”)

**Canonical categories:**

| Category | Meaning | Example statuses |
|----------|---------|------------------|
| `active` | In motion, internal work | New File, Submitted, Document Collection |
| `waiting` | Blocked on external party | Waiting On Borrower, Waiting On Lender |
| `blocked` | Internal hold / deficiency | Compliance Hold, Missing Documentation |
| `review` | In review queue | Funding Review, Initial Review |
| `completed` | Successful terminal | Funded, Approved |
| `closed` | Unsuccessful / withdrawn terminal | Declined, Withdrawn |

Category ≠ funnel stage. A file can be stage “Underwriting” and status “Waiting On Borrower” (`waiting`).

### Decision 9 — Status aging (v2)

| Field | Where | Rule |
|-------|-------|------|
| `statusUpdatedAt` | `pipeline` | Set on every `statusId` change (already planned) |
| `daysInStatus` | **UI only** | `floor((now - statusUpdatedAt) / 86400000)` — **no schema field** |

Future (no schema change): red row after X days, escalations, follow-up automation keyed off `statusUpdatedAt` + category.

Optional 24.1b UI: show “12d” beside pill on file workspace.

### Decision 10 — Status ownership (v2, reserved)

| Field | Where | Phase 24.1 |
|-------|-------|------------|
| `statusOwnerUserId` | `pipeline` | **Schema reserved**, optional, not required in UI |

Answers future query: **“Which deals are waiting on me?”** when paired with `waiting` / `blocked` categories.

Mutation `setOperationalStatus` may accept optional `statusOwnerUserId` in 24.2; 24.1 leaves field `undefined`.

### Decision 11 — Rollup provenance (v2, required)

When project/client rows show an effective status, operators must see **why**.

| Field | Where | Type |
|-------|-------|------|
| `effectiveStatusId` | `projects`, `clients` | Winning status |
| `effectiveStatusUpdatedAt` | `projects`, `clients` | Last rollup recompute |
| **`effectiveStatusSourceId`** | `projects`, `clients` | **`Id<"pipeline">`** — file that won the rollup |
| `effectiveStatusSourceKind` | `projects`, `clients` | Literal `"pipeline"` in 24.1 (reserved for future `"projects"`) |

**UI (required in 24.1c):**

```text
Compliance Hold
From: ABC Trucking SBA Loan
```

Component: `PipelineOperationalStatusSourceLine` — reads `effectiveStatusSourceId` → `pipeline.fileName` (and optional project path on client rows).

Rollup algorithm **must** persist source file id when patching `effectiveStatusId`.

### Decision 12 — Locked seed library (v2)

On org create + backfill, seed **exactly** the catalog in §6 (names locked; weights/tokens may be tuned in settings). Admins may add custom statuses later; seed set is non-negotiable for 24.1a.

### Decision 13 — Status severity (v3, required)

**Independent axes** (do not conflate):

| Field | Answers |
|-------|---------|
| `statusCategory` | What **kind** of state (waiting, blocked, …) |
| `priorityWeight` | Which child **wins** rollup |
| **`severity`** | How **urgent** the state is for humans and systems |

```typescript
severity: "normal" | "attention" | "warning" | "critical"
```

| severity | Typical use |
|----------|-------------|
| `normal` | Routine progression (Funding Review, New File) |
| `attention` | Needs follow-up but not escalated (Waiting On Borrower) |
| `warning` | Material risk / deficiency (Missing Documentation) |
| `critical` | Hard stop (Compliance Hold) |

**v3:** `isWarning` from v2 is **not stored** — use `severity !== "normal"` in queries. (No migration — not implemented yet.)

Future: dashboard alert bands, notification priority, SLA escalation tiers — all keyed off `severity` + `statusUpdatedAt` + `statusCategory`.

### Decision 14 — Automation readiness (v3, required)

| Field | Type | Purpose |
|-------|------|---------|
| `automationEligible` | `boolean` | Status may participate in automation rules (Phase 30+) |

When `false`, automation engine **ignores** enter/stay/duration triggers for that status (terminal outcomes).

Examples:

| Status | automationEligible |
|--------|-------------------|
| Waiting On Borrower | `true` |
| Funding Review | `true` |
| Compliance Hold | `true` |
| Funded | `false` |
| Withdrawn | `false` |
| Declined | `false` |

**Future events (no new status-table columns):** `operational_status.entered`, `operational_status.duration_exceeded` — payload includes `statusId`, `severity`, `category`, `fileId`, `statusOwnerUserId`.

### Decision 15 — Implementation gate: Track A before Track B

| Track | Scope | Gate |
|-------|--------|------|
| **A** | Stabilize existing UX (delete modal, hub clipping, task create validation, hierarchy actions) | **Must reach prod-verified stable** before 24.1a |
| **B** | Operational Status Engine (this lock) | Starts only after Track A sign-off + **24.1 architecture approval** + readiness report review |

See `docs/phase24-1-status-engine-final-readiness.md` §0.

---

## 3. Schema lock

### 3.1 `organizationPipelineStatuses`

Indexes:

- `by_organization`
- `by_organization_sort` → `["organizationId", "sortOrder"]`
- `by_organization_category` → `["organizationId", "statusCategory"]` (dashboards / filters)

**Category → `isClosed` sync (on upsert/seed):**

```text
isClosed = (statusCategory === "completed" || statusCategory === "closed")
```

### 3.2 `pipeline`

| Field | Type | Notes |
|-------|------|-------|
| `statusId` | `Id<"organizationPipelineStatuses">` | Required after backfill |
| `statusUpdatedAt` | `number` | Required |
| `statusUpdatedBy` | `string` | Actor key |
| **`statusOwnerUserId`** | **`optional string`** | **Reserved** — future “waiting on me” |

Index: `by_organization_status` → `["organizationId", "statusId"]`  
Optional: `by_status_owner` → `["organizationId", "statusOwnerUserId"]` (24.2)

### 3.3 `projects` / `clients`

| Field | Type |
|-------|------|
| `effectiveStatusId` | `optional Id<"organizationPipelineStatuses">` |
| `effectiveStatusUpdatedAt` | `optional number` |
| **`effectiveStatusSourceId`** | **`optional Id<"pipeline">`** |
| **`effectiveStatusSourceKind`** | **`optional literal "pipeline"`** |

No direct status assignment on project/client in 24.1.

### 3.4 Convex validator for `statusCategory`

```typescript
const operationalStatusCategory = v.union(
  v.literal("active"),
  v.literal("waiting"),
  v.literal("blocked"),
  v.literal("review"),
  v.literal("completed"),
  v.literal("closed"),
);

const operationalStatusSeverity = v.union(
  v.literal("normal"),
  v.literal("attention"),
  v.literal("warning"),
  v.literal("critical"),
);
```

Shared export: `lib/operationalStatus/categories.ts` (+ `severity.ts`).

---

## 4. Rollup engine (with provenance)

### 4.1 Project rollup

```text
ELIGIBLE = files in project, visible, showInRollups, category not in (completed, closed)
IF ELIGIBLE empty → clear effective* fields
ELSE
  WINNER_FILE = argmax(priorityWeight) over ELIGIBLE
  effectiveStatusId = WINNER_FILE.statusId
  effectiveStatusSourceId = WINNER_FILE._id
  effectiveStatusSourceKind = "pipeline"
```

### 4.2 Client rollup

```text
For each project under client:
  use project's effectiveStatusId + effectiveStatusSourceId (already computed)
ELIGIBLE_PROJECTS = projects with defined effectiveStatusId and showInRollups on that status
WINNER = argmax(priorityWeight) among eligible
effectiveStatusId = winner status
effectiveStatusSourceId = winner project's effectiveStatusSourceId (pipeline file id)
effectiveStatusSourceKind = "pipeline"
```

### 4.3 Query map type

```typescript
type OperationalStatusMapEntry = {
  statusId: Id<"organizationPipelineStatuses">;
  visual: VisualStateView;
  daysInStatus?: number; // files only, from statusUpdatedAt
};

type RollupEntry = {
  effectiveStatusId: Id<"organizationPipelineStatuses">;
  effectiveStatusSourceId: Id<"pipeline">;
  sourceFileName: string;
  sourceProjectTitle?: string; // client rows — optional context
};

type OperationalStatusMap = {
  statusesById: Record<string, Doc<"organizationPipelineStatuses">>;
  byFileId: Record<string, OperationalStatusMapEntry>;
  byProjectId: Record<string, RollupEntry>;
  byClientId: Record<string, RollupEntry>;
};
```

---

## 5. Status aging & future SLA (no extra schema)

| Capability | Mechanism |
|------------|-----------|
| Days in status | Client: `(Date.now() - pipeline.statusUpdatedAt) / 86400000` |
| Category dashboards | `statusCategory` index + counts |
| SLA red rows | UI: `daysInStatus > threshold` by category (config in org settings 24.3+) |
| Escalation automation | Webhook on `statusCategory === "waiting"` + `daysInStatus > N` |
| “Waiting on me” | `statusOwnerUserId === viewer` + category `waiting` |

---

## 6. Locked seed library (per org)

Seeded on org create + `seedOperationalStatusesForOrganization` backfill. **Names are product-locked.**

| Name | statusCategory | severity | priorityWeight | automationEligible | showInRollups | Notes |
|------|----------------|----------|----------------|------------------|---------------|-------|
| New File | active | normal | 10 | true | true | **isDefault** |
| Initial Review | review | normal | 40 | true | true | |
| Document Collection | active | normal | 50 | true | true | |
| Submission Ready | active | normal | 60 | true | true | |
| Submitted | active | normal | 70 | true | true | |
| Funding Review | review | normal | 200 | true | true | |
| Waiting On Borrower | waiting | attention | 300 | true | true | |
| Waiting On Broker | waiting | attention | 310 | true | true | |
| Waiting On Lender | waiting | attention | 320 | true | true | |
| Waiting On Vendor | waiting | attention | 330 | true | true | |
| Compliance Hold | blocked | critical | 1000 | true | true | |
| Underwriting Hold | blocked | critical | 950 | true | true | |
| Missing Documentation | blocked | warning | 900 | true | true | |
| Stalled | blocked | warning | 850 | true | true | |
| Approved | completed | normal | 100 | false | false | terminal |
| Funded | completed | normal | 100 | false | false | terminal |
| Declined | closed | normal | 50 | false | false | terminal |
| Withdrawn | closed | normal | 50 | false | false | terminal |

Visual tokens (implementation): map category → default `rowColor` / `pillColor` / `icon`; per-status overrides in seed JSON artifact.

**Admin:** May edit weights, colors, deactivate; **should not rename** seed slugs without migration (optional `slug` field 24.2).

---

## 7. UI lock

| Component | Role |
|-----------|------|
| `PipelineOperationalStatusPill` | Status name + category-aware styling |
| `PipelineOperationalStatusSelect` | File workspace — required |
| `PipelineOperationalStatusSourceLine` | **“From: {fileName}”** on project/client rows |
| `OperationalStatusRowFrame` | Row tint from tokens |
| `OrganizationOperationalStatusesPanel` | Settings — grouped by **category** |

| Surface | Content |
|---------|---------|
| File workspace | Status (required) + optional **days in status** |
| Hub file row | Pill + row frame + days optional |
| Hub project/client row | Pill + **source line** + row frame |
| Filters | By status + by **category** |
| Dashboard | Widgets by **category** + `showInDashboard` |

**Primary copy:** Use “Status” and status **name**, not “color” or “highlight.”

---

## 8. API lock (planned)

| Function | Notes |
|----------|-------|
| `organizationPipelineStatuses.list` | Group by `statusCategory` |
| `organizationPipelineStatuses.upsert` | Validates category; syncs `isClosed` |
| `pipeline.setOperationalStatus` | Sets `statusId`, `statusUpdatedAt`, `statusUpdatedBy`; optional `statusOwnerUserId` (24.2) |
| `operationalStatus.getMap` | Includes rollup provenance + `daysInStatus` for files |
| `operationalStatus.recomputeOrgRollups` | Rewrites effective* + source ids |

---

## 9. Migration

1. Deploy schema (library + pipeline + project/client provenance fields + reserved `statusOwnerUserId`)
2. Seed §6 catalog per org
3. Backfill `pipeline.statusId` → New File
4. `recomputeOrgRollups` (populates `effectiveStatusSourceId`)
5. Enforce non-null `statusId` on create

---

## 10. Implementation phases (after approval)

| Phase | Scope |
|-------|--------|
| **24.1a** | Schema + category enum + full seed + backfill + rollup with **source id** |
| **24.1b** | Settings (by category) + file status select + `daysInStatus` display |
| **24.1c** | Hub pills + row frames + **source line** + category filters |
| **24.1d** | Category dashboard widgets + governance QA + deploy |

---

## 11. Approval checklist (v3)

- [ ] Read **`docs/phase24-1-status-engine-final-readiness.md`**  
- [ ] **Track A** stable in production (delete modal, hub overflow, tasks, hierarchy actions)  
- [ ] Operational status = **primary pipeline OS** (“where stuck?”), not a visual layer  
- [ ] Four systems separate: stage / task label / operational status / visual state  
- [ ] Decisions 1–12 accepted  
- [ ] **Decision 13** — `severity` independent of category and `priorityWeight`  
- [ ] **Decision 14** — `automationEligible` on library row  
- [ ] **Decision 15** — Track B blocked until Track A + architecture approval  
- [ ] **No 24.1a schema** until all boxes checked  

Reply **“24.1 approved”** only after readiness report review → then **24.1a schema** (Track B).

---

## 12. References

| Doc | Role |
|-----|------|
| `migration-reports/phase24-1-status-engine-architecture-lock.json` | Machine-readable lock + full seed payloads |
| `docs/phase22-flexible-triage-labels.md` | Task attention — separate |
| `docs/phase24-pipeline-status-architecture.md` | Superseded 24.0 draft |
