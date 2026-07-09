# Phase 25.1a — Contact Roles & Labels Audit (read-only)

**Date:** 2026-05-28  
**Track:** C — Core CRM Architecture  
**Scope:** Static analysis only. No schema, backend, or UI changes in this phase.

**Target state (Phase 25+):** Purge free-form `contacts.labels` and replace with a **globally managed, settings-based contact role** catalog (e.g. Client, Referral Partner, Deal Partner, Lender Rep).

---

## Executive summary

The CRM uses **three parallel “role/label” concepts** today:

| Concept | Storage | Managed? | Overlaps Phase 25 target? |
|--------|---------|----------|---------------------------|
| **Free-form labels** | `contacts.labels: string[]` | User-typed per contact; org-wide suggestion list via query | **Yes — primary purge target** |
| **CRM relationship types** | `contacts.crmRelationshipTypes` + optional `relationshipType` on `contactFileLinks` / `contactLenderLinks` | Fixed enum in schema (`client`, `referral`, `lender_rep`) — **not** settings-driven | **Partial** — closest to “roles” but incomplete vs desired four roles |
| **Per-link role string** | `contactFileLinks.role`, `contactLenderLinks.role` | Free-text per file/lender link (e.g. “co-signer”, “referral partner”) | **Related** — not the same field as `contacts.labels` |

There is **no** `roleId` on `contacts`. There is **no** tenant table for CRM contact roles. `organizationSettings` holds **task color presets only**, not contact roles.

**`PipelineHubProjectionView.tsx`** does not render contact labels or CRM relationship types (graph/projection UI only).

---

## 1. Database schema (`contacts` and related)

### 1.1 `contacts` table (`lender-app/convex/schema.ts`)

Canonical standalone CRM contacts (`defineTable` ~lines 2100–2201):

| Field | Type | Purpose |
|-------|------|---------|
| `name` | `string` | Display name |
| `email`, `phone` | `string` | Legacy scalars (kept in sync with arrays) |
| `emails`, `phones` | optional arrays | Multi-method entries (Phase 24) |
| `notes` | `string` | Free text |
| **`labels`** | **`optional array(string)`** | **User-defined tags — arbitrary strings (legacy / free-form)** |
| `companyName`, `companyKey` | optional | Company grouping / dedupe |
| **`crmRelationshipTypes`** | **optional array(union)** | **`"client" \| "referral" \| "lender_rep"`** — contact-level profile |
| `preferredEmailId`, `preferredPhoneId`, `preferredContactMethod` | optional | Communication prefs (schema-only) |
| `emailKey` | optional | Dedupe within org |
| `organizationId` | optional `Id<"organizations">` | Tenancy |
| `globalSearchText` | optional | Search index blob |
| `createdAt`, `updatedAt` | `number` | Timestamps |

**Not present:** `roleId`, `role`, `contactRole`, or settings FK for roles.

### 1.2 Link tables (roles on associations, not on contact doc)

**`contactFileLinks`** (~2223–2244):

- `role: string` — required free-text per link (e.g. co-signer)
- `relationshipType: optional` — `"client" | "referral" | "lender_rep"`
- `notes`, timestamps, indexes

**`contactLenderLinks`** (~2250–2267):

- Same pattern: `role: string`, optional `relationshipType` (same 3 literals)
- Default on upsert when omitted: `"lender_rep"` (`convex/contactLenderLinks.ts`)

### 1.3 Legacy / non-CRM “contacts” (do not confuse with `contacts` table)

| Location | Meaning |
|----------|---------|
| `lenders.contacts[]` | Embedded lender contact rows (`name`, `titleRole`, `phone`, `email`, `notes`) — not `contacts.labels` |
| `pipeline.contacts[]` | Legacy per-file contact array on pipeline row — migrated into standalone contacts via `contactMigration` |

### 1.4 Graph “relationship” types (loan clients — separate product model)

Tables such as `fileClients`, `loanClients`, `fileReferralPartners`, etc. use `relationshipType` values like `primary`, `coborrower`, `referral`, `assignee`. These describe **indexed graph / loan client placement**, not CRM `contacts.labels` or `crmRelationshipTypes`.

UI: `LinkedClientsEditor`, `ClientRelationshipBadge`, `PipelineHubHierarchyView` — **out of scope for label purge** unless Phase 25 explicitly merges models.

### 1.5 Settings / tenant configuration tables

| Table | CRM contact roles? | Actual contents |
|-------|-------------------|-----------------|
| **`organizationSettings`** | **No** | `taskColorPresets` (8 fixed color ids), `updatedAt`, `updatedByUserKey` |
| **`organizationTriageLabels`** | **No** | **Task** triage labels (file workspace tasks), not CRM contacts |
| **`organizationRoles`** | **No** | **RBAC** membership roles (`assignedRoleId` on org members) — unrelated to contact persona |
| **`organizations`** | Branding, plan, etc. | No contact role catalog |

**Conclusion:** No existing schema for **tenant-managed CRM contact roles**. Phase 25 will need a new settings artifact (table or `organizationSettings` extension) plus migration from `labels` + alignment with `crmRelationshipTypes`.

---

## 2. Shared taxonomy (`lib/crmRelationship.ts`)

Hardcoded today (not loaded from settings):

```ts
CRM_RELATIONSHIP_TYPES = ["client", "referral", "lender_rep"]
CRM_RELATIONSHIP_LABELS = {
  client: "Client",
  referral: "Referral",
  lender_rep: "Lender rep",
}
```

**Gap vs Phase 25 target roles:**

| Target role | Current equivalent |
|-------------|------------------|
| Client | `client` ✓ |
| Referral Partner | `referral` (display “Referral”) ✓ partial naming |
| Deal Partner | **Missing** — no enum value |
| Lender Rep | `lender_rep` ✓ |

---

## 3. Backend (Convex) — `contacts.labels` and filters

### 3.1 `convex/contacts.ts` (primary CRM API)

| Export | Labels behavior |
|--------|----------------|
| `normalizeLabels` / `labelsOnDoc` | Dedupe trim, case-insensitive |
| **`list`** | Optional **`labelFilter`** — exact match (case-insensitive) against `contacts.labels[]` |
| **`listDistinctLabels`** | Aggregates all distinct label strings in org for UI datalist/filter |
| **`create`** | Accepts `labels?: string[]`, stores normalized |
| **`update`** | Accepts `labels?: string[]`, patches normalized |
| **`list`** | Also **`relationshipTypeFilter`** on `crmRelationshipTypes` + link `relationshipType` |

Permissions: `contacts.view` / mutate via `assertCanMutateContactRow`.

### 3.2 Other Convex modules touching `contacts.labels`

| File | Usage |
|------|--------|
| `convex/contactMigration.ts` | Sets `labels: [candidate.label]` when creating contacts from legacy pipeline/lender data; infers roles like `"referral partner"`, `"co-signer"`, `"client"` |
| `convex/lenderContactMigration.ts` | Appends migration label **`"lender contact"`** via `normalizeLabelsForPatch` |
| `convex/demoWorkspace.ts` | Seed labels: `"Demo workspace"`, `"Borrower"`, `"Referral partner"` |
| `convex/integrationHttp.ts` | HTTP list passes through `labelFilter` query param to `contacts.list` |
| `convex/testingSeed.ts` | Uses `crmRelationshipTypes`, not `labels`, for seeded personas |

### 3.3 Search / indexing

| File | Usage |
|------|--------|
| `convex/globalSearchSync` (via `refreshContactGlobalSearchText`) | Rebuilds search blob on contact CRUD |
| `lib/globalSearchText.ts` | Includes `...(row.labels ?? [])` and `...(row.crmRelationshipTypes ?? [])` in search text |
| `lib/contact/contactMethods.ts` | `contactSearchHaystack` includes `labels` for client-side filtering |

### 3.4 Backend using `crmRelationshipTypes` (not `labels`, but role migration relevant)

| File | Behavior |
|------|----------|
| `convex/contactFileLinks.ts` | `relationshipType` on upsert; search haystack includes link role + type |
| `convex/contactLenderLinks.ts` | Same; default `lender_rep` |
| `convex/indexedGraphAnalyze.ts`, `indexedGraphBackfill.ts`, `indexedGraphEdgeSync.ts` | Referral detection via `crmRelationshipTypes` / links |
| `convex/pipelineGraphPreviewLinks.ts` | Referral participation |
| `convex/globalSearch.ts` | May surface `matchedRelationship` from **loan client** links, not contact labels |

### 3.5 `convex/pipeline.ts`

Pipeline list joins lender display strings; **does not** read `contacts.labels`.

---

## 4. Frontend — forms, filters, display

### 4.1 Contact create/edit (labels + CRM types)

| File | Labels | CRM relationship types | Per-link role |
|------|--------|------------------------|---------------|
| **`lender-app/app/contacts/page.tsx`** | **Full UI:** add/remove tags, datalist from `listDistinctLabels`, list chips, **`labelFilter` dropdown**, search haystack | Toggle pills `CRM_RELATIONSHIP_TYPES`; filter dropdown; save on create/update | Read-only display of `link.role` + `link.relationshipType` on associated files/lenders |
| `lender-app/components/contacts/ContactMethodsEditor.tsx` | No | No | No |
| `lender-app/components/contacts/ContactMethodsDetail.tsx` | No | No | No |

### 4.2 Pipeline file workspace

| File | Contact labels | Notes |
|------|----------------|-------|
| **`lender-app/components/PipelineFileWorkspace.tsx`** | Indirect via `FileContactsBlock` | Hardcodes **`relationshipType: "client"`** on every `contactFileLinks.upsert` / update (does not expose CRM type or labels in UI) |
| **`lender-app/components/pipeline/blocks/FileContactsBlock.tsx`** | **Renders `contact.labels`** as “Labels: …” | **Free-text `role`** per link (`InlineText`); no `relationshipType` editor |
| `lender-app/components/pipeline/PipelineHubProjectionView.tsx` | **None** | Projection/graph only |

### 4.3 Other contact touchpoints (no `contacts.labels` UI)

| File | Role/label notes |
|------|------------------|
| `lender-app/components/LenderDrawer.tsx` | Link/create contacts; **per-link `role`** string only |
| `lender-app/components/NewPipelineFileDialog.tsx` | `contacts.list` / `create` — no labels in grep |
| `lender-app/components/intake/Dashboard.tsx` | `contacts.list` / `create`; link with `relationshipType: "client"` |
| `lender-app/components/TaskDrawer.tsx` | `contacts.list` for picker |
| `lender-app/hooks/usePipelineFileWorkspaceData.ts` | Loads `contacts.list` for file workspace |

### 4.4 Help / docs strings

| File | Mention |
|------|---------|
| `lender-app/lib/helpCenterContent.ts` | Documents “labels and relationship types” for end users |

---

## 5. Does a CRM Settings UI already exist?

| UI | Path | Contact roles? |
|----|------|----------------|
| Organization settings | `app/settings` → `OrganizationSettingsPanel.tsx` | Branding, plan, team — **no contact roles** |
| Task triage labels | `OrganizationTriageLabelsPanel.tsx`, `app/settings/tasks/library` | **Tasks only** |
| Contacts page filters | `app/contacts/page.tsx` | Uses **dynamic label strings** from data, not admin-defined catalog |

**Answer:** **No** settings UI or schema for globally managed CRM contact roles today.

---

## 6. Hardcoded label / role strings (contact-relevant)

### 6.1 CRM relationship enum labels (`lib/crmRelationship.ts`)

- `"Client"`, `"Referral"`, `"Lender rep"` (UI display for `client`, `referral`, `lender_rep`)

### 6.2 Migration / seed literals written to `contacts.labels`

| String | Source |
|--------|--------|
| `"lender contact"` | `convex/lenderContactMigration.ts` (`MIGRATION_LABEL`) |
| `"Demo workspace"`, `"Borrower"`, `"Referral partner"` | `convex/demoWorkspace.ts` |
| Inferred from migration: `"client"`, `"co-signer"`, `"referral partner"` | `convex/contactMigration.ts` (`inferRoleFromLegacyContact`, lender referral extraction) |

### 6.3 UI copy / placeholders (not stored as enum)

| String | File |
|--------|------|
| `"Examples: client, co-signer, referral partner"` | `app/contacts/page.tsx` |
| `"client, co-signer, referral partner…"` | `FileContactsBlock.tsx` placeholder |
| Search placeholder mentions “labels” | `app/contacts/page.tsx` |

### 6.4 Hardcoded link `relationshipType` in app code

| Value | File |
|-------|------|
| `"client"` | `PipelineFileWorkspace.tsx`, `Dashboard.tsx`, `NewPipelineFileDialog.tsx` (file link upsert) |
| `"lender_rep"` | Default in `contactLenderLinks` upsert when omitted |

### 6.5 Per-link `role` strings (free text, common values from migrations)

- `"Primary contact"`, `"Lender contact"`, `"Company phone"`, `"co-signer"`, `"referral partner"`, `"client"` — from migration/helpers, not a closed enum

---

## 7. File paths referencing **`contacts.labels`** (exact purge dependency list)

All paths below read, write, filter, index, or display the **`contacts.labels`** field (not task triage labels):

- `lender-app/convex/schema.ts`
- `lender-app/convex/contacts.ts`
- `lender-app/convex/contactMigration.ts`
- `lender-app/convex/lenderContactMigration.ts`
- `lender-app/convex/demoWorkspace.ts`
- `lender-app/convex/integrationHttp.ts` (`labelFilter` query param)
- `lender-app/lib/globalSearchText.ts`
- `lender-app/lib/contact/contactMethods.ts`
- `lender-app/app/contacts/page.tsx`
- `lender-app/components/pipeline/blocks/FileContactsBlock.tsx`
- `lender-app/lib/helpCenterContent.ts`

---

## 8. Adjacent files (CRM roles / relationships — likely Phase 25.1b+ touch)

Not `contacts.labels`, but required when replacing labels with settings-based roles:

- `lender-app/lib/crmRelationship.ts`
- `lender-app/convex/contactFileLinks.ts`
- `lender-app/convex/contactLenderLinks.ts`
- `lender-app/convex/indexedGraphAnalyze.ts`
- `lender-app/convex/indexedGraphBackfill.ts`
- `lender-app/convex/indexedGraphEdgeSync.ts`
- `lender-app/convex/pipelineGraphPreviewLinks.ts`
- `lender-app/convex/testingSeed.ts`
- `lender-app/components/PipelineFileWorkspace.tsx` (hardcoded `relationshipType: "client"`)
- `lender-app/components/LenderDrawer.tsx`
- `lender-app/components/intake/Dashboard.tsx`
- `lender-app/components/NewPipelineFileDialog.tsx`

---

## 9. Explicit non-dependencies (similar words, different domain)

Do **not** conflate with contact labels purge:

| Domain | Examples |
|--------|----------|
| Task triage | `organizationTriageLabels`, `FileTaskTriageFeedRow`, `TaskTriageLabelManagerSheet` |
| Org RBAC | `organizationRoles`, `assignedRoleId` |
| Pipeline stage/status copy | `pipeline.ts` “status labels” comments |
| Loan client graph | `ClientRelationshipBadge`, `pipelineMultiClientMutations`, `relationshipType: "primary"` |
| Email/phone method labels | `emails[].label`, `phones[].label` unions (Work, Mobile, etc.) |

---

## 10. Recommended Phase 25 follow-ups (informational only)

1. **Schema:** Add org-scoped contact role definitions (settings table or JSON on `organizationSettings`); add `contactRoleId` or replace `crmRelationshipTypes` + drop `labels`.
2. **Migration:** Map `contacts.labels` + common `contactFileLinks.role` strings → canonical role ids; dedupe with existing `crmRelationshipTypes`.
3. **API:** Remove `labelFilter`, `listDistinctLabels`, `normalizeLabels`; extend `list`/`create`/`update` for role ids.
4. **UI:** Replace free-form label editor on `app/contacts/page.tsx`; role picker on `FileContactsBlock` / lender links; stop hardcoding `relationshipType: "client"` in `PipelineFileWorkspace.tsx`.
5. **Settings UI:** New panel under Organization Settings for role catalog (four defaults + extensibility policy TBD).

---

## 11. Audit constraints

- **No code, schema, or component mutations** were made in Phase 25.1a.
- This document is the sole deliverable for the audit step.
