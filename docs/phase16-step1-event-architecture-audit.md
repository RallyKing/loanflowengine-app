# Phase 16 Step 1 — Owner-scoped Events architecture audit

**Status:** Architecture specification only — **STOP** (no schema, no prod writes, no deploy, no UI)  
**Date:** 2026-05-25  
**Evidence:** `migration-reports/phase16-step1-event-architecture-audit.json`  
**Prerequisite:** Phase 15 Step 15 canonical sharing certification (`docs/phase15-step15-sharing-certification.md`)

---

## Executive summary

This document defines the **canonical architecture** for a new **owner-scoped Events** domain in Direct Lending Connection. Events are **private by default**: only the row owner sees them unless explicitly shared through **`resourceShares`** (same philosophical model as Tasks and Pipeline Files after Phase 12.2 Step 8B).

Events are **not** the existing `activityEvents` feed (org-wide / entity-participant visibility). They are a new product surface with:

- Unlimited collapsible **sections** and structured **items**
- A two-tab inbox: **Events** vs **Ideas + Invitations**
- Calendar projections, print packs, templates, optional Task linkage, and future **relation junctions that never grant visibility**

**Operator gate:** Do not implement Step 2+ until this spec is reviewed.

---

## Constraints acknowledged (governance)

| Constraint | Application |
|------------|-------------|
| Single scroll owner | Event detail uses `AppChrome` `<main>` scroll; no nested full-page scrollports (`docs/scroll-architecture-rules.md`) |
| Mobile QA | Required before any shipped UI (Steps 4+) |
| Canonical ACL | `resourceShares` only — **no** `sharedWithIds`, org-wide lists, or hierarchy inheritance |
| No shadow systems | Extend `resourceAccess.ts`; do not fork a parallel share table |
| Convex cost | Single-flight subscriptions per route (`lib/convexCostBudget.ts`) |

---

## Template source analysis

### Uploaded template

**No event-planning template file was found in the repository** (searched `docs/`, `migration-reports/`, `docs/enterprise-modernization/Uploaded/`, workspace attachments). The user brief references an uploaded template; operator should attach the source artifact before Step 2 schema lock.

### Derived canonical template (from brief + print surfaces)

The required print outputs imply the following **master planning structure**, mapped 1:1 to default sections:

| Print output | Primary section(s) | Typical items |
|--------------|-------------------|---------------|
| Master event plan | All sections (rollup) | — |
| Execution day checklist | Day-of execution | checkbox, time, assignee, status |
| Guest sheet | Guest list & RSVPs | note, status, link (RSVP), attachment |
| Budget sheet | Budget & finance | note, number/currency fields via note+meta, status |
| Timeline sheet | Timeline & run of show | date, dependency, assignee, status |
| Vendor sheet | Vendors & contracts | link, note, attachment, assignee |
| Packing checklist | Packing & post-event | checkbox, priority |
| Custom print templates | User-defined section filter | configurable in `printProfile` |

**Recommended default sections** (order, icon key, default collapsed):

1. `overview` — Overview & goals  
2. `budget` — Budget & finance  
3. `guests` — Guest list & RSVPs  
4. `venue` — Venue & logistics  
5. `catering` — Catering & bar  
6. `vendors` — Vendors & contracts  
7. `timeline` — Timeline & run of show  
8. `travel` — Travel & accommodation  
9. `decor` — Décor & flowers  
10. `attire` — Attire & beauty  
11. `entertainment` — Entertainment & program  
12. `communications` — Invitations & communications  
13. `legal` — Legal & insurance  
14. `day_of` — Day-of execution  
15. `packing` — Packing & post-event  
16. `notes` — Notes & capture  

Platform expansion (DLC context, **link-only**, no ACL bleed): optional empty sections `clients`, `lenders`, `referrals`, `pipeline` hidden until user adds a relation or enables section.

---

## 1. Event object model

### 1.1 Naming collision

| Existing | Purpose | Events domain |
|----------|---------|---------------|
| `activityEvents` | Org/entity activity feed | **Do not reuse** |
| `lib/activity/eventTypes.ts` | Feed typing | **Do not reuse** |
| **New `events` table** | Owner-scoped event shell | Canonical product entity |

### 1.2 Canonical tables (Step 2 — specification only)

#### `events` (shell)

| Field group | Fields | Notes |
|-------------|--------|-------|
| Identity | `organizationId`, `title`, `slug?`, `description?` | Org scope for membership checks only — **not** visibility |
| Ownership | `ownerUserId`, `ownerUserKey` | Mirror tasks/pipeline (`ownerFieldsForInsert`) |
| Lifecycle | `status`: `draft` \| `active` \| `completed` \| `archived` | `archivedAt?`, `completedAt?` |
| Calendar | `timezone` (IANA), `startsAt?`, `endsAt?`, `allDay`, `multiDayKey?` | See §5 |
| Ordering | `listSortKey` (fractional), `calendarSortAt` (denormalized = `startsAt` \|\| `createdAt`) | List + calendar indexes |
| Template | `templateId?`, `templateVersion?`, `clonedFromEventId?` | Provenance |
| Print | `defaultPrintProfileId?` | Pointer to `eventPrintProfiles` |
| Conversion | `provenance?`: `{ sourceKind, sourceId, convertedAt, convertedByUserKey }` | See §4 |
| Audit | `createdAt`, `updatedAt`, `createdByUserKey` | |

**Indexes (required):**

- `by_org_owner_status_sort` → `[organizationId, ownerUserId, status, calendarSortAt]`  
- `by_org_owner_list` → `[organizationId, ownerUserId, listSortKey]`  
- `by_org_owner_starts` → `[organizationId, ownerUserId, startsAt]` (calendar window queries)

#### `eventMetadata` (optional 1:1 extension)

Large or rarely queried fields: `coverStorageId`, `locationLabel`, `locationGeo?`, `tags[]`, `colorKey`, `customFields` (bounded JSON). Keeps hot list rows small.

#### `eventPrintProfiles`

Per-event or per-template print configuration: `kind` (master, day_of, guest, …), `sectionIds[]`, `layout`, `header/footer`, `paperSize`.

### 1.3 Ownership semantics

- **Owner** = `ownerUserId` on row (full control).  
- **Co-owner / editor / viewer** = **`resourceShares` only** with extended role (§9).  
- **No** `organizationMembers` visibility, **no** `files.view_all`, **no** client/project/pipeline inheritance (contrast `pipelineVisibleViaHierarchy` in `resourceAccess.ts`).

### 1.4 Status lifecycle

```
draft → active → completed → archived
         ↘ (cancel) archived
```

| Transition | Who |
|------------|-----|
| draft → active | owner, co-owner, editor |
| active → completed | owner, co-owner, editor |
| * → archived | owner, co-owner |
| archived → active (restore) | owner, co-owner |
| delete (hard) | **owner only** (after archive recommended) |

### 1.5 Archive lifecycle

- Archived events: hidden from default Events tab; visible via filter.  
- Sections/items soft-archive with `archivedAt`; restore cascades optionally (owner choice in UI).  
- Shares remain until owner revokes (archived ≠ auto-revoke).

---

## 2. Section architecture

### 2.1 Table: `eventSections`

| Field | Type | Notes |
|-------|------|-------|
| `eventId` | `Id<"events">` | Parent |
| `organizationId` | org id | Denormalized for index safety |
| `key` | string | Stable id for template mapping (e.g. `budget`) |
| `title` | string | Rename target |
| `iconKey` | string | Lucide/catalog key; hover label = `title` |
| `sortKey` | number | Fractional ordering |
| `collapsedDefault` | boolean | Default **true** (collapsed) |
| `archivedAt` | optional number | Soft archive |
| `sourceTemplateSectionId` | optional | Template lineage |

**Operations:** rename, reorder (`sortKey`), duplicate (deep copy items), archive/restore, custom icon.

### 2.2 UI behavior (spec)

- Icon rail + expand-on-click; **hover labels** via tooltip (`duration-dlc-short`, `shellZIndexStyle("tooltip")`).  
- Unlimited sections; virtualize item list when section > 100 items.  
- Default collapsed per `collapsedDefault` and per-user override stored in **client localStorage** keyed by `eventId` (not Convex — avoids write churn).

### 2.3 Section bundle query

One query returns sections ordered by `sortKey` for an event id; items loaded per expanded section (lazy) or batched in workspace bundle (§10).

---

## 3. Section item model

### 3.1 Table: `eventSectionItems`

Normalized **one row per item** with discriminated `itemType`:

| `itemType` | Stored fields (in addition to common) |
|------------|--------------------------------------|
| `checkbox` | `completedAt?` |
| `note` | `body` (markdown plain) |
| `date` | `dateAt` (UTC ms), `dateEndAt?`, `dateAllDay?` |
| `priority` | `priority` (0–3) |
| `assignee` | `assigneeUserKey?` (display resolve via `displayIdentity`) |
| `dependency` | `dependsOnItemId?` |
| `attachment` | `storageId`, `fileName`, `mime?` |
| `link` | `url`, `linkLabel?` |
| `status` | `statusKey` (enum string per section template) |
| `recurrence` | `recurrenceRule` (RFC5545 subset JSON), `recurrenceParentItemId?` |

**Common columns:** `eventId`, `sectionId`, `organizationId`, `title`, `sortKey`, `archivedAt?`, `createdAt`, `updatedAt`, `createdByUserKey`.

**Indexes:**

- `by_section_sort` → `[sectionId, sortKey]`  
- `by_event` → `[eventId]` (count/bulk archive)  
- `by_linked_task` → `[linkedTaskId]` (optional sparse)

### 3.2 Why normalized rows (not JSON blob)

| Approach | Verdict |
|----------|---------|
| Single JSON blob per section | Poor pagination, hot-row writes, hard task linking |
| **Normalized items** | Scales to 10k+ items, indexed sorts, selective subscriptions |

### 3.3 Recurrence

- Store rule on item; **expand instances** lazily for calendar (materialized `eventCalendarOccurrences` table in Step 7 if needed).  
- Editing “this vs series” follows standard calendar semantics (spec for Step 7).

---

## 4. Two-tab model: Events vs Ideas + Invitations

### 4.1 Table: `eventStubs` (unified pre-event inbox)

| Field | Notes |
|-------|-------|
| `kind` | `idea` \| `invitation` |
| `organizationId`, `ownerUserId` | Same privacy as events |
| `title`, `body?`, `capturedAt` | User content |
| `invitationMeta?` | `{ host?, venue?, receivedAt?, respondBy? }` |
| `status` | `open` \| `converted` \| `dismissed` |
| `convertedToEventId?` | Set on conversion |
| `provenance` | Immutable after convert |

**ACL:** Same as events — owner-only + `resourceShares` with `resourceType: "event_stub"` **or** reuse `resourceType: "event"` with `resourceId` prefixed `stub:` — **recommended:** separate type `event_stub` in union for clarity.

### 4.2 Conversion: idea → event

1. Owner/co-owner invokes `eventStubs.convertToEvent`.  
2. Create `events` row (`status: draft`, copy title/body → description).  
3. Seed sections from **platform default template** or user-selected `eventTemplateId`.  
4. Optional: map stub body → first `notes` section item (`note`).  
5. Write `eventConversionLog` row.  
6. Patch stub: `status: converted`, `convertedToEventId`, `convertedAt`.  
7. **Do not delete** stub (provenance); hide from open Ideas list.

### 4.3 Conversion: invitation → event

Same as idea, plus:

- Copy `invitationMeta` into `eventMetadata.customFields` and/or dedicated `guests` / `communications` section items.  
- Set `provenance.sourceKind: "invitation"`.  
- Pre-populate `startsAt` from `invitationMeta.receivedAt` only if user confirms (no silent dates).

### 4.4 `eventConversionLog` (append-only)

```ts
{
  organizationId,
  fromStubId,
  toEventId,
  convertedByUserKey,
  convertedAt,
  snapshot: { stubTitle, kind, templateId? },
}
```

### 4.5 History & lineage UI

Event detail shows “Created from invitation · {date}” linking read-only stub snapshot (query `eventConversionLog` + stub doc if owner can read stub).

---

## 5. Calendar system

### 5.1 Ordering

| View | Sort |
|------|------|
| Event list | `listSortKey` asc, tie-break `calendarSortAt` |
| Upcoming | `calendarSortAt >= now`, asc |
| Past | `calendarSortAt < now`, desc |

### 5.2 Projections

| Mode | Data source |
|------|-------------|
| Month / week / day | Query `events` in `[rangeStart, rangeEnd]` on `by_org_owner_starts` + owner/share filter |
| List | Same shells, client groups by day bucket using `timezone` |

**Status overlays:** `draft` (outline), `active` (solid), `completed` (muted check), `archived` (hidden unless filter).

### 5.3 Timezone

- Shell stores **IANA** `timezone` (e.g. `America/Chicago`).  
- Instants stored **UTC ms**; display converts in UI via `Intl`.  
- `allDay` events: store `startsAt` as start-of-day in event timezone converted to UTC; `endsAt` exclusive end.

### 5.4 Multi-day

- `multiDayKey` optional UUID ties segments; or single row with `startsAt`/`endsAt` spanning days.  
- Month grid renders bar across days (client calculation).  
- Recurrence exceptions use `eventCalendarExceptions` (Step 7) if materialized occurrences adopted.

---

## 6. Print architecture

### 6.1 Print kinds (canonical)

| `printKind` | Sections default |
|-------------|------------------|
| `master_plan` | All non-archived |
| `execution_checklist` | `day_of` |
| `guest_sheet` | `guests` |
| `budget_sheet` | `budget` |
| `timeline_sheet` | `timeline` |
| `vendor_sheet` | `vendors` |
| `packing_checklist` | `packing` |
| `custom` | `eventPrintProfiles.sectionIds` |

### 6.2 Pipeline

1. Client requests `events.printBundle` with `eventId`, `printKind`.  
2. Server verifies read ACL; returns **serializable DTO** (no HTML in DB).  
3. Client renders print CSS (`@media print`) — **no second scroll owner** (print window).  
4. Large events: paginate sections in print layout.

### 6.3 Complexity controls

- Max items per print job: 2000 (configurable); truncate with notice.  
- Attachments: links only in print, not binary embed (v1).

---

## 7. Template engine

### 7.1 Tables

- `eventTemplates` — org-scoped or **owner-private** (`ownerUserId` set, not org-visible).  
- `eventTemplateSections` / `eventTemplateItems` — mirror live event shape.

### 7.2 Clone workflow

`events.createFromTemplate(templateId)`:

1. Create shell with `templateId` + `templateVersion`.  
2. Deep copy sections/items with new ids, preserve `key` mapping.  
3. Owner = actor.

### 7.3 Recurrence compatibility

Templates may include `recurrence` items; on instantiate, **do not expand** until user enables schedule on shell.

### 7.4 Inheritance rules

| Rule | Behavior |
|------|----------|
| Org template | Visible to org members for **clone only** if owner shares template via `resourceShares` on `resourceType: "event_template"` |
| Private template | Owner only |
| Template update | Does not mutate existing events; version bump on template row |
| Event fork | `clonedFromEventId` optional; no auto-sync |

---

## 8. Task integration boundary

### 8.1 Principle

**Tasks remain canonical** for matrix/quadrant workflow. Event items may **link** to tasks, not duplicate task state machines.

### 8.2 Table: `eventItemTaskLinks`

| Field | Notes |
|-------|-------|
| `eventItemId`, `taskId` | Unique pair |
| `linkPolicy` | `reference_only` \| `sync_complete` (only checkbox ↔ task `done`) |
| `createdByUserKey`, `createdAt` | |

### 8.3 Creation flow

`eventItems.promoteToTask(itemId)`:

1. Assert edit on event.  
2. Create `tasks` row with `ownerUserId` = **event owner** (not actor unless actor is owner).  
3. Set `tasks.sourceEventItemId` (new optional field).  
4. Insert link row.  
5. **Do not** copy description both ways bi-directionally after creation (single writer per field).

### 8.4 ACL preservation

- Task visibility follows **task** ACL (owner + task shares).  
- Event visibility independent — linking does **not** grant event access to task-only users.  
- UI shows “Linked task” only if viewer can read both; else “Linked task (no access)”.

---

## 9. Permission matrix

### 9.1 Extending `resourceShares` (Step 2 schema)

Current union: `permission: view | edit` only. Events require **co-owner**.

**Recommended schema addition (events only):**

```ts
collaboratorRole: v.optional(
  v.union(
    v.literal("viewer"),    // permission view
    v.literal("editor"),    // permission edit
    v.literal("co_owner"),  // permission edit + share management
  ),
)
```

Migration: map legacy task/file rows: `view` → viewer, `edit` → editor, absent → editor.

**Alternative (if union extension rejected):** store co-owner as `permission: "edit"` + `capabilities: ["manage_shares"]` in optional `shareMetadata` JSON on `resourceShares` — still one table.

### 9.2 Action matrix

| Action | Owner | Co-owner | Editor | Viewer |
|--------|:-----:|:--------:|:------:|:------:|
| Read event | ✓ | ✓ | ✓ | ✓ |
| Edit sections/items | ✓ | ✓ | ✓ | — |
| Comment (future) | ✓ | ✓ | ✓ | — |
| Share / revoke | ✓ | ✓ | — | — |
| Promote editor → co-owner | ✓ | — | — | — |
| Transfer ownership | ✓ | — | — | — |
| Archive / restore event | ✓ | ✓ | — | — |
| Delete event | ✓ | — | — | — |
| Manage print profiles | ✓ | ✓ | ✓ | — |
| Convert stub → event | ✓ | ✓ | ✓ | — |
| Manage templates (own) | ✓ | ✓ | — | — |

**Mirrors task/file philosophy:** only **owner** manages sharing on tasks today (`taskShares.ts`); events extend co-owner to reduce owner bottleneck.

### 9.3 `resourceAccess.ts` changes (Step 3)

- Add `ResourceType` `"event"` | `"event_stub"` | `"event_template"`.  
- `filterEventRowsForMember` — **no hierarchy merge** (copy `filterTaskRowsForMember`, omit pipeline hierarchy).  
- `resolveEventAccessLevel` — owner → edit; share → view/edit/co_owner capabilities.  
- `assertCanManageEventShares` — owner or co_owner.  
- **Explicit deny** org impersonation unless superuser impersonation already grants org edit (existing `impersonationGrantsOrgResourceVisibility`).

---

## 10. Scalability model

### 10.1 Volume targets

| Entity | Target | Pattern |
|--------|--------|---------|
| Events per owner | 1,000+ | Index by owner + sort; paginate list 50/page |
| Items per owner | 10,000+ | Section-scoped fetch; virtualize UI |
| Calendar query | 90-day window | Single indexed range query |

### 10.2 Convex query budget (per route)

| Route | Subscriptions | Query |
|-------|---------------|-------|
| `/events` list | **1** | `listEventShells` (paginated) |
| `/events/ideas` | **1** | `listEventStubs` |
| `/events/[id]` | **1** | `getEventWorkspaceBundle` (shell + sections; items lazy) |
| Calendar overlay | **0 extra** | Derive from list cache or extend bundle with `calendarRange` arg |

Use `"skip"` when tab hidden (`useDocumentTabVisible` pattern from communications panel).

### 10.3 Write amplification

- Batch item reorder in one mutation (max 100 ops).  
- Denormalized `event.sectionCount` / `itemCount` for list badges (maintain in mutations).

### 10.4 Duplicate subscription guard

- Central `useEventsWorkspaceData` hook (mirror `usePipelineFileWorkspaceData`).  
- `useConvexSubMountTrace` in dev/QA builds.

---

## 11. Event relation graph (future — additive only)

### 11.1 Table: `eventRelations`

| Field | Notes |
|-------|-------|
| `eventId` | |
| `targetType` | `client` \| `project` \| `pipeline` \| `lender` \| `referral` \| `team_member` \| `task` |
| `targetId` | string id |
| `role?` | `related` \| `vendor` \| `guest` \| … |
| `createdByUserKey` | |

**Hard rule:** Junction **does not** call `pipelineVisibleViaHierarchy` or project/client shares. User with pipeline access but no event share **cannot** see event.

### 11.2 UI

Relation chips on event header open **existing** inspectors (overlay) if user has access to target entity; else show locked chip.

---

## 12. UI navigation proposal

### 12.1 Placement

Insert in `navigationCatalog.ts` after **Tasks** (`order: 15`):

| id | href | label |
|----|------|-------|
| `events` | `/events` | Events |
| (tabs inside page) | `/events?tab=events` \| `?tab=ideas` | Events · Ideas + Invitations |

Mobile primary: optional `false` initially (medium priority).

### 12.2 Route map

| Route | Owner |
|-------|-------|
| `app/events/page.tsx` | Tab shell + list |
| `app/events/[eventId]/page.tsx` | Detail workspace |
| `app/events/ideas/page.tsx` | Optional alias → `?tab=ideas` |

### 12.3 Event detail layout

```
[Header: title, dates, status, ownership badge, share, print menu]
[Icon section rail | Section content pane (single scroll in main)]
[Relation chips row]
[Task link callouts inline in items]
```

- **Sharing panel:** reuse `ResourceAccessDetails` + `TaskSharingSection` pattern → `EventSharingSection`.  
- **Print actions:** header dropdown → print preview route or modal (overlay, not nested scroll).  
- **Section drawer:** on mobile, bottom sheet (`RecordInspectorShell` / Vaul) for section picker only.

### 12.4 Scroll

- List + detail: `AppChrome` main scroll.  
- **No** `data-pipeline-workspace-scroll` on events routes.

---

## 13. Risk audit

| Risk | Severity | Mitigation |
|------|----------|------------|
| Subscription explosion | High | Single bundle query; lazy items; tab skip |
| ACL leakage via relations | Critical | No inherited visibility; explicit tests in Step 10 |
| ACL leakage via org membership | Critical | Never list org-wide events; audit queries |
| Co-owner vs edit ambiguity | Medium | `collaboratorRole` column; matrix tests |
| Template duplication drift | Medium | Versioned templates; no live sync |
| Calendar scaling | Medium | Windowed queries; materialize occurrences only if needed |
| Ownership transfer | High | Atomic mutation: patch owner + reassign co-owner shares + audit log; revoke old owner share if present |
| Print serialization | Medium | Server DTO caps; paginate |
| `activityEvents` naming confusion | Low | Docs + code review gate |
| Legacy `task.sharedWithIds` | Medium | Do not copy pattern; events shares-only |
| Pipeline hierarchy habit | High | Code review: forbid `pipelineVisibleViaHierarchy` in event filters |

---

## Codebase reference (current ACL)

| Artifact | Path |
|----------|------|
| ACL core | `lender-app/convex/resourceAccess.ts` |
| Shares table | `lender-app/convex/schema.ts` → `resourceShares` |
| Task shares API | `lender-app/convex/taskShares.ts` |
| Share target resolution | `lender-app/convex/shareTargetResolve.ts` |
| Canonical identity | `lender-app/convex/auth/canonicalIdentity.ts` |
| Phase 15 cert | `lender-app/convex/operator/phase15Step15SharingCertification.ts` |

**Gap vs requirements:** Tasks/files use `permission: view|edit` only; **co-owner** and **transfer ownership** are not first-class in `taskShares.ts` (cert patches owner directly). Events Step 3 must implement formal transfer + co-owner promotion mutations.

---

## Recommended phased implementation plan

| Step | Scope | Deliverables |
|------|-------|--------------|
| **2 — Schema foundation** | Tables: `events`, `eventSections`, `eventSectionItems`, `eventStubs`, `eventConversionLog`, `eventTemplates`*, `eventPrintProfiles`, `eventRelations` (empty), extend `resourceShares` union + role | Schema + indexes only; codegen |
| **3 — Owner ACL + sharing** | `resourceAccess` event resolvers; `eventShares.ts`; transfer + promote mutations; denial logging | Parity with Phase 15 identity |
| **4 — Event shell CRUD** | List/create/patch/archive; ownership presentation | `/events` tab shell only |
| **5 — Sections/items engine** | Section CRUD, item types, reorder batch | Detail workspace |
| **6 — Ideas/invitations** | Stub CRUD, conversion flows, provenance UI | Second tab |
| **7 — Calendar projections** | Range queries, month/week/day UI, timezone | Calendar toggle on list |
| **8 — Print engine** | Print DTO query + print CSS layouts | Print menu |
| **9 — Task integration** | `sourceEventItemId`, promote/link policies | Item row action |
| **10 — Hard certification** | Operator harness: ACL matrix, 3-account symmetry, scale smoke, mobile governance | Docs + JSON report |

---

## Validation (Step 1)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` (substitute for missing `npm run convex`) | **PASS** |
| `npm run build` | **PASS** |

**Not run:** `deploy:prod`, `convex:deploy:prod`, schema mutation, production writes.

---

## STOP gate

**Phase 16 Step 1 complete.** Awaiting operator review of this spec and attachment of the source event-planning template before Step 2.
