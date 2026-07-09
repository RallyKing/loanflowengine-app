# Phase 24.1a — Operational Status Engine (kickoff)

**Date:** 2026-05-29  
**Track:** **B** — schema + library foundation (no hub UI rollout in 24.1a)  
**Track A:** Closed — native browser chrome conflict accepted; structural armor retained (24.4L, 24.4P, 24.4Q, 24.4R on pipeline hub).  
**Sanitized prod:** https://lender-app-zeta.vercel.app — `dpl_7yHvusbTtszvjyCeK7Ycdfq1x11J` (2026-05-29).

**Canonical specs:**

- `docs/phase24-1-status-engine-architecture-lock.md` (v3 lock)
- `docs/phase24-1-status-engine-final-readiness.md`
- `migration-reports/phase24-1-status-engine-architecture-lock.json` (must stay in sync)

---

## Product question (locked)

> **Where is this deal stuck?**

| System | Answers | Today in schema |
|--------|---------|-----------------|
| **Funnel stage** | Where in the lending funnel | `organizationPipelineStages`, `pipeline.stageId`, legacy `pipeline.status` string |
| **Task triage** | Which tasks need attention | `organizationTriageLabels`, `tasks.triageLabelId` |
| **Operational status** (24.1) | Stuck / waiting / blocked / done | **Not implemented** — target of 24.1a |

Operational status is **not** row color, not stage alone, not task labels.

---

## Current schema (baseline)

### Exists today

| Table | Relevant fields |
|-------|-----------------|
| `organizationPipelineStages` | Org funnel stages (`name`, `slug`, `order`, `color`, `icon`) |
| `organizationPipelineSubStages` | Nested under parent stage |
| `pipeline` | `status` (legacy string), `stageId`, `subStageId`, `projectId`, `clientId` (via graph), no `statusId` |
| `projects` | Hierarchy parent — **no** `effectiveStatusId` yet |
| `clients` | Hierarchy parent — **no** `effectiveStatusId` yet |
| `organizationTriageLabels` | Task labels only |

### Does not exist (24.1a deliverable)

| Table / fields | Purpose |
|--------------|---------|
| **`organizationPipelineStatuses`** | Per-org status library (18 locked seeds + admin CRUD) |
| **`pipeline.statusId`** | FK to library; required after backfill |
| **`pipeline.statusUpdatedAt`**, **`statusUpdatedBy`** | Aging + audit |
| **`pipeline.statusOwnerUserId`** | Optional reserve (24.1 lock) |
| **`projects.effectiveStatus*`** | Rollup winner + provenance |
| **`clients.effectiveStatus*`** | Rollup winner + provenance |

---

## 24.1a scope (schema only)

Per lock § “24.1 approved → then **24.1a schema only**”:

1. **Convex schema** — `organizationPipelineStatuses` table + indexes  
2. **`pipeline` extensions** — `statusId`, timestamps, optional owner  
3. **`projects` / `clients` extensions** — `effectiveStatusId`, `effectiveStatusUpdatedAt`, `effectiveStatusSourceId`, `effectiveStatusSourceKind`  
4. **Seed mutation** — 18 locked statuses on org create (names/categories/weights from lock §6)  
5. **Backfill script** — map legacy `pipeline.status` / stage heuristics → default `New File` where needed; **no silent data loss**  
6. **Migration report** — `migration-reports/phase24-1a-status-engine-schema.md`  
7. **No UI** in 24.1a — no hub pill, no settings manager, no rollup recompute jobs in prod UI  

### Explicitly out of 24.1a

- `setOperationalStatus` mutation (24.1b)
- `PipelineOperationalStatusPill` (24.1c)
- Rollup recompute on every patch (24.1b+)
- Dashboard widgets / SLA / automations (24.2+)

---

## Code map (implementation targets)

| Layer | Path | Notes |
|-------|------|-------|
| Schema | `lender-app/convex/schema.ts` | New table + field validators |
| Org lifecycle | `lender-app/convex/organizations.ts` (or seed helper) | Call status seed after org create |
| Stage/status separation | `lender-app/lib/pipelineStatus.ts` | Today = **funnel** stages; do not overload for operational status |
| New module (proposed) | `lender-app/lib/pipelineOperationalStatus.ts` | Tokens, category helpers, severity — read-only types first |
| Convex API (24.1b) | `lender-app/convex/pipelineOperationalStatus.ts` | CRUD library + `setOperationalStatus` — **after** 24.1a |
| Hub UI (24.1c) | `PipelineHubHierarchyView`, `PipelineTableRow`, `PipelinePageClient` | Filters on `statusId` / category |
| Settings (24.1d) | `settings/pipeline-stages` sibling route | **Statuses** manager, not stages |

---

## Rollup rules (for 24.1b — document now, implement later)

```text
Eligible file = readable ∧ status.showInRollups ∧ category ∉ {completed, closed}
Project/client winner = max(priorityWeight); tie-break sortOrder, then statusId
Write effectiveStatusId + effectiveStatusSourceId (winning pipeline row)
```

Terminal statuses (`completed`, `closed`) display on file but do not bubble to parents.

---

## Verification checklist (24.1a done)

- [ ] `npm run build` green from `lender-app/`
- [ ] Convex deploy / schema push documented in migration report
- [ ] New org receives 18 seeded statuses + default `New File`
- [ ] Backfill: every pipeline row has non-null `statusId`
- [ ] `grep organizationPipelineStatuses` in schema + generated types
- [ ] No hub/UI imports of half-built status APIs
- [ ] Lock JSON artifact version bumped if schema fields differ from v3 draft

---

## Track A closure note

Diagnostics removed or disabled in production sanitize pass (2026-05-29):

- 24.4M neon nav paint **off**
- Viewport pinch-zoom **restored** (`maximumScale: 5`)
- 24.4Q `addEventListener` interception **off**
- **Kept:** 24.4L DOM mount lock, 24.4P header lock, 24.4Q viewport freeze, 24.4N overscroll, 24.4R native document scroll on pipeline hub

---

## Suggested implementation order (24.1a → 24.1d)

| Step | Phase | Deliverable |
|------|-------|-------------|
| 1 | **24.1a** | Schema + seed + backfill + migration report |
| 2 | 24.1b | `setOperationalStatus` + rollup recompute mutation |
| 3 | 24.1c | `PipelineOperationalStatusPill` + hub filters + source line |
| 4 | 24.1d | Admin status library UI + org settings route |

**Recommended first PR for Track B:** 24.1a schema-only — smallest blast radius, unblocks all Convex and UI work.
