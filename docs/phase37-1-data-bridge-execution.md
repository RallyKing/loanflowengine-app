# Phase 37.1.B — Database Bridge Execution (Schema & Versioning)

**Date:** 2026-06-22  
**Status:** Schema + API bridge implemented locally  
**Constraint honored:** `pipeline.dealData`, `intakePatchableFields`, and intake validators **unchanged**

---

## Summary

Contact-first relational tables are now defined in Convex schema, with a version log for rollback and a new `contactDataBridge` module for CRUD with automatic `previousState` capture.

---

## 1. Schema additions (`convex/schema.ts`)

### New tables

| Table | Purpose | Key indexes |
|-------|---------|-------------|
| `contactReoProperties` | Schedule of REO per contact | `by_contact`, `by_contact_sort`, `by_organization_contact` |
| `contactFinancialProfiles` | PFS blob per contact (`income[]`, `assets[]`, `liabilities[]`, `netWorth`, `liquidAssets`) | `by_contact`, `by_organization_contact` |
| `contactBusinessEntities` | Legal entity records (org-scoped) | `by_organization`, `by_organization_entity_name` |
| `contactBusinessOwnership` | Junction: contact ↔ entity + `ownershipPercentage`, `title` | `by_contact`, `by_business_entity`, `by_contact_entity` |
| `contactBusinessDebtSchedules` | Debt rows per business entity | `by_business_entity`, `by_business_entity_sort` |
| `contactDataVersions` | Append-only rollback log | `by_contact_at`, `by_contact_entity_type_at` |

All sticky tables include `organizationId` (optional, mirrored from contact) and timestamps where applicable. REO and debt rows support `archivedAt` soft delete.

### Validators module

**`convex/contactStickyData/validators.ts`** — shared validators for schema + bridge (PFS row shapes, REO fields, business/debt fields, `contactDataEntityTypeV`, `libraryDocumentCategoryV`).

### Document metadata

**`libraryDocumentLinks.documentCategory`** (optional):

| Value | Use |
|-------|-----|
| `id` | Government ID |
| `dd214` | DD214 / military discharge |
| `tax_return` | Tax returns |
| `deal_specific` | File-scoped doc still linked to contact |
| `other` | Default / uncategorized |

New index: `by_contact_category` on `["contactId", "documentCategory"]`.

Existing link inserts remain valid (field optional).

---

## 2. API bridge (`convex/contactDataBridge.ts`)

### Queries

| Function | Description |
|----------|-------------|
| `getContactReo` | List REO rows for contact (excludes archived by default) |
| `getContactFinancialProfile` | Single PFS profile or null |
| `getContactBusinessEntities` | Ownership rows + hydrated entities |
| `getContactBusinessDebtSchedule` | Debt rows for a business entity |
| `listContactDataVersions` | Version history (optional `entityType` filter) |

### Mutations (auto-versioning)

| Function | Version `entityType` | Behavior |
|----------|-------------------|----------|
| `saveContactReo` | `reo` | Insert or patch; stores full row in `previousState` before patch |
| `archiveContactReo` | `reo` | Soft archive with version snapshot |
| `saveContactFinancialProfile` | `pfs` | Upsert profile document |
| `saveContactBusinessEntity` | `business` + `business_ownership` | Upsert entity + ownership link |
| `saveContactBusinessDebt` | `business_debt` | Insert or patch debt row |

All mutations call `assertCanMutateContactRow`; queries use `assertCanReadContactRow`.

**Version helper:** `appendContactDataVersion` clones `previousState` via JSON before every mutating write.

---

## 3. Backward compatibility

- No changes to `pipeline`, `dealData`, `intakeSheets`, or `intakePatchable.ts`
- New tables are additive — empty until migration/UI phases
- Library document links without `documentCategory` continue to work

---

## 4. Validation

```bash
cd lender-app
npm run convex:codegen    # schema parse + API bindings — OK
npx tsc --noEmit          # pre-existing e2e test TS errors unrelated to this phase
npm run convex:deploy:prod
```

**Results (2026-06-22):**

- Convex codegen: **OK**
- Convex prod deploy: **OK** → `https://basic-anaconda-984.convex.cloud` (schema validation complete; no indexes deleted)

---

## 6. Files touched

| File | Action |
|------|--------|
| `convex/schema.ts` | Added 6 tables + `libraryDocumentLinks.documentCategory` |
| `convex/contactStickyData/validators.ts` | **New** |
| `convex/contactDataBridge.ts` | **New** |
| `docs/phase37-1-data-bridge-execution.md` | **New** (this file) |

---

## 7. Next phases (not in scope)

- UI: read/write contact sticky data from file workspace with projection to `dealData`
- Migration: backfill from `dealData` per `contactFileLinks`
- Rollback mutation: restore `previousState` from `contactDataVersions`
- Extend `libraryDocuments.ts` to accept `documentCategory` on create/link
