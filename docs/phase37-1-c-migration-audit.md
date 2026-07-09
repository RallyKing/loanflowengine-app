# Phase 37.1.C — Data Migration & Backfill Audit

**Date:** 2026-06-22  
**Status:** Read-only audit — **migration NOT executed**  
**Prerequisite:** Phase 37.1.B tables deployed (`contactReoProperties`, `contactFinancialProfiles`, etc.)

---

## Executive summary

Historical sticky data lives in **`pipeline.dealData`** (intake-shaped JSON). New tables are **empty**. This audit defines:

1. Field-level mapping from `dealData` → contact tables  
2. **Primary borrower** resolution (no `borrowerId` exists in deal JSON today)  
3. **Duplicate-safe merge** when one contact has multiple pipeline files  
4. A proposed **`convex/migrations/backfillContactStickyData.ts`** with mandatory **`dryRun`** and **`contactDataVersions`** audit rows  

**Recommended policy:** Backfill **file-level** schedules (REO, assets, liabilities, business entity) to the **primary borrower contact only**; split **income rows** by `incomeRows[].borrower` tag; **never replicate** identical REO rows across co-borrowers.

---

## 1. Source data shapes (`dealData`)

Resolved via `getDealForEditor` / `pickIntakeShapedPreviewPayload` — same shape as `intakeSheets` (`convex/intakeSchemaPart.ts`, `convex/intakePatchable.ts`).

### 1.1 Schedule of REO — `dealData.reo[]`

| Legacy key (`reoRow`) | New column (`contactReoProperties`) |
|-----------------------|-------------------------------------|
| `address` | `propertyAddress` |
| `propertyType` | `propertyType` |
| `usage` | `usage` |
| `state` | `state` |
| `purchasedDate` | `purchasedDate` |
| `marketValue` | `marketValue` |
| `balance` | `mortgageBalance` |
| `mortgagePayment` | `monthlyPayment` |
| `rate` | `rate` |
| `position` | `position` |
| `taxes`, `insurance`, `hoa`, `escrow` | same |
| `grossRent`, `netRent` | same |
| `apn`, `invested`, `latLong` | same |

**Note:** REO is **file-level** in deal JSON (not per-borrower array).

### 1.2 Personal financial statement — PFS

| Legacy key | Target | Notes |
|------------|--------|-------|
| `incomeRows[]` | `contactFinancialProfiles.income[]` | Each row has optional `borrower: "Borrower 1" \| "Borrower 2"` |
| `assets[]` | `contactFinancialProfiles.assets[]` | File-level |
| `liabilities[]` | `contactFinancialProfiles.liabilities[]` | File-level |
| `guarantors[].liquidAssets`, `guarantors[].netWorth` | `liquidAssets`, `netWorth` on **primary** profile only if profile fields empty | Optional enrichment |
| Root: `citizenship`, `bkHistory`, etc. | **Out of scope** for 37.1.C profile table (future `contactFinancialProfile` header extension) | Document only |

Array element shapes match `contactSticky*RowV` validators (same as intake).

### 1.3 Business / entity — `dealData.business`

| Legacy (`businessState`) | New |
|--------------------------|-----|
| `legalName` | `contactBusinessEntities.entityName` |
| `dba`, `ein`, `entityType` | same names |
| `stateOfFormation` | `state` |
| `formationDate` | `formationDate` |
| `business.owners[]` | `contactBusinessOwnership` rows + optional second contacts |

| Legacy (`businessOwner`) | New (`contactBusinessOwnership`) |
|--------------------------|----------------------------------|
| `name` | Match/create contact; link via junction |
| `title` | `title` |
| `ownershipPct` | `ownershipPercentage` |

Business entity is **file-level** (one `business` object per deal).

### 1.4 Guarantors — `dealData.guarantors[]`

| Legacy (`guarantor`) | Target |
|----------------------|--------|
| Name match | `contacts` + `contactBusinessOwnership` or future guarantor profile |
| `ownershipPct` | `ownershipPercentage` on ownership link to file's business entity |

**37.1.C scope:** Link guarantors to **business entity** when `business.legalName` present; store ownership % on junction. Full guarantor PII migration deferred if no entity.

### 1.5 Business debt — no legacy table

| Legacy source | New (`contactBusinessDebtSchedules`) |
|---------------|--------------------------------------|
| `weightedInterest[]` rows | `creditor` ← `account`, `balance`, `monthlyPayment`, `position` ← `note` |
| `weightedInterestInstances[].data.rows` | Same mapping per instance (flatten) |
| `liabilities[]` where description matches business/MCC pattern | Optional Phase 37.1.C+ heuristic |

Requires parent `contactBusinessEntities` row from file's `business.legalName`.

---

## 2. Contact resolution (there is no `borrowerId` today)

`dealData` does **not** store Convex `contacts` IDs. Resolution order for each pipeline file:

### Step A — Load deal payload

```typescript
const linked = file.intakeSheetId ? await ctx.db.get(file.intakeSheetId) : null;
const embedded = embeddedDealPayloadIsSubstantive(file.dealData)
  ? file.dealData
  : null;
const deal = pickIntakeShapedPreviewPayload(embedded, linked, file.updatedAt);
if (!deal) skip("no_substantive_deal");
```

### Step B — Primary contact for file-level sticky data

Priority (first match wins):

| Priority | Source | Rule |
|----------|--------|------|
| 1 | `contactFileLinks` | Link where `contactRoleId === client` OR `role` matches `/client/i` and not `/co-sign/i` |
| 2 | `contactFileLinks` | Earliest link on file if multiple clients (lowest `createdAt`) |
| 3 | Name match | `deal.clientName` or `borrowers[0]` full name → `contacts` by `emailKey` then normalized name within `file.organizationId` |
| 4 | `contactMigration` parity | `cover.borrowers` first token (comma/and split) |
| 5 | Skip | Log `unresolved_primary_contact` — **do not invent data** |

**Co-borrower contacts** (for income split only):

| Source | Rule |
|--------|------|
| `borrowers[1..]` names | Match `contactFileLinks` with role `co-signer` / co-borrower role id |
| `contactFileLinks` | All non-primary client links on file |
| Name match | Same as `contactMigration.personNameFromBorrowerRow` |

### Step C — Primary borrower convention in existing code

| Location | Convention |
|----------|--------------|
| `convex/contactMigration.ts` | `borrowers[0]` → role `"client"`; index > 0 → `"co-signer"` |
| `convex/contactMigration.ts` | `cover.borrowers` first parsed name → client |
| `dealData.clientName` | Display borrower / file identity (`pipeline.ts` table preview) |
| `FileContactsBlock` | CRM links use `contactRoleId`; primary role id = `DEFAULT_CONTACT_ROLE_IDS.client` |
| `projectClients` / hub | `"primary"` relationship type on **clients** hub — separate from CRM `contacts` |

**There is no explicit `isPrimaryBorrower` flag on `dealData.borrowers[]`.** Index `0` is the de-facto primary.

### Multi-borrower backfill policy (recommended)

| Data domain | Assign to |
|-------------|-----------|
| `reo[]`, `assets[]`, `liabilities[]`, `business`, `weightedInterest*` | **Primary contact only** |
| `incomeRows[]` | Row's `borrower` tag → primary (`Borrower 1` / empty) or matched co-borrower contact; unmapped → primary |
| `guarantors[]`, `business.owners[]` | Matched contact by name/email; create **ownership** links to file's business entity |
| Co-borrower | **Do not copy** full REO/PFS file-level arrays (avoids triple-counting across 3 files) |

---

## 3. Duplicate mitigation strategy

### 3.1 Idempotency gates (skip if already migrated)

Before writing for contact `C`:

| Check | Action |
|-------|--------|
| `contactFinancialProfiles` exists for `C` **and** migration marker present | Skip PFS merge for `C` unless `forceRemerge` |
| Any `contactDataVersions` with `modifiedBy === "__migration_37_1_c__"` for `C` | Treat contact as migration-touched; use merge mode not blind insert |
| Per-row REO fingerprint already on `C` | Skip insert |

**Proposed marker:** Add optional `contacts.stickyDataBackfillAt` (number) in a future schema micro-patch, **or** infer from version log only (no schema change required for 37.1.C).

### 3.2 Fingerprints (dedupe keys)

```typescript
function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function reoFingerprint(row: ReoRow): string {
  return norm(row.address) + "|" + norm(row.apn) + "|" + norm(row.state);
}

function assetFingerprint(row: AssetRow): string {
  return norm(row.description) + "|" + norm(row.estimatedValue);
}

function liabilityFingerprint(row: LiabilityRow): string {
  return norm(row.description) + "|" + norm(row.balance) + "|" + norm(row.monthlyPayment);
}

function incomeFingerprint(row: IncomeRow): string {
  return norm(row.borrower) + "|" + norm(row.source) + "|" + norm(row.description) + "|" + norm(row.monthlyAmount);
}

function businessEntityFingerprint(orgId: string, legalName: string, ein?: string): string {
  return norm(orgId) + "|" + norm(ein) || norm(legalName);
}
```

When processing file `F2` after `F1` for same contact:

- **REO / assets / liabilities / income:** Insert only if fingerprint ∉ existing set for that contact  
- **Conflicting values** (same fingerprint, different balance): Log warning; keep **existing** (first-seen-wins) unless `preferNewestFile` flag and `F2.updatedAt > F1.updatedAt`

### 3.3 File ordering

Process pipeline files **`updatedAt` descending** per organization so the **most recently edited file** seeds data first (optional flag `preferNewestFirst: true`, default **true**).

### 3.4 Dry run (mandatory first pass)

Mirror `contactMultiMethodsMigration` / `contactMigration`:

```typescript
args: {
  adminSecret: v.string(),
  dryRun: v.boolean(),      // default true when omitted in operator docs
  limit: v.optional(v.number()),
  organizationId: v.optional(v.id("organizations")),
  cursor: v.optional(v.string()), // pipeline _id continuation
  createMissingContacts: v.optional(v.boolean()), // default false
}
```

**Dry run output** (return value + console):

```typescript
type BackfillSummary = {
  dryRun: boolean;
  scannedFiles: number;
  skippedNoDeal: number;
  skippedNoPrimaryContact: number;
  wouldInsertReo: number;
  wouldInsertPfs: number;
  wouldMergePfs: number;
  wouldInsertBusiness: number;
  wouldInsertDebt: number;
  skippedDuplicateReo: number;
  skippedDuplicateLiability: number;
  sampleWarnings: string[]; // cap 50
};
```

**Do not write** when `dryRun === true`. Operator runs dry run → reviews summary → runs `dryRun: false`.

---

## 4. `contactDataVersions` audit requirement

Every **insert** (and optional merge patch) must append:

```typescript
await ctx.db.insert("contactDataVersions", {
  organizationId: contact.organizationId,
  contactId: contact._id,
  entityType: "reo" | "pfs" | "business" | "business_debt" | "business_ownership",
  entityId: insertedRowId,
  previousState: {
    _migration: "37.1.c",
    phase: "backfill",
    sourceFileId: file._id,
    sourceDealKey: "reo[2]" | "assets" | "business" | ...,
    fingerprint: "...",
    dryRun: false,
  },
  modifiedBy: "__migration_37_1_c__",
  modifiedAt: Date.now(),
});
```

- `previousState: null` is **insufficient** for traceability — wrap metadata as above (insert still has `previousState: null` for true creates, but **must** include migration wrapper with `sourceFileId`).  
- Recommended: use wrapper `{ _migration, sourceFileId, payload: null }` for creates and `{ _migration, sourceFileId, payload: <full prior row> }` for merges.

---

## 5. Proposed migration module

**Path:** `convex/migrations/backfillContactStickyData.ts`  
**Pattern:** Follow `contactMultiMethodsMigration.ts` + `contactMigration.ts`  
**Auth:** `assertDataMigrationAdmin(args.adminSecret)`  
**Export:** `export const backfillContactStickyData = mutation({ ... })`

### 5.1 High-level algorithm

```
FOR each pipeline file (paginated, optional org filter):
  resolve deal payload
  resolve primaryContact + coBorrowerContacts[]
  IF no primaryContact:
    IF createMissingContacts: create + link (like contactMigration) ELSE skip + log

  // REO → primary only
  FOR each row in deal.reo ?? []:
    IF fingerprint exists on primary: skipDuplicate++
    ELSE IF dryRun: wouldInsertReo++
    ELSE insert contactReoProperties + contactDataVersions

  // PFS → primary + income split
  build income/assets/liabilities from deal
  split income rows by borrower tag to co-borrowers
  IF primary has no contactFinancialProfiles:
    insert profile OR merge arrays with dedupe
  ELSE merge with dedupe fingerprints
  append contactDataVersions (entityType: pfs)

  // Business
  IF deal.business?.legalName:
    find or create contactBusinessEntities (by org + ein || legalName fingerprint)
    upsert contactBusinessOwnership for primary + owners/guarantors by name match
    append versions

  // Debt
  FOR each weightedInterest row (and instances):
    insert contactBusinessDebtSchedules under entity
    append versions

RETURN BackfillSummary
```

### 5.2 Proposed code skeleton (NOT deployed — reference only)

```typescript
// convex/migrations/backfillContactStickyData.ts
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { embeddedDealPayloadIsSubstantive } from "../../lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "../pipeline"; // or extract shared helper

const MIGRATION_ACTOR = "__migration_37_1_c__";

function mapReoRow(row: Record<string, unknown>, sortOrder: number) {
  return {
    sortOrder,
    propertyAddress: str(row.address),
    propertyType: str(row.propertyType),
    usage: str(row.usage),
    state: str(row.state),
    purchasedDate: str(row.purchasedDate),
    marketValue: str(row.marketValue),
    mortgageBalance: str(row.balance),
    monthlyPayment: str(row.mortgagePayment),
    rate: str(row.rate),
    position: str(row.position),
    taxes: str(row.taxes),
    insurance: str(row.insurance),
    hoa: str(row.hoa),
    escrow: str(row.escrow),
    grossRent: str(row.grossRent),
    netRent: str(row.netRent),
    apn: str(row.apn),
    invested: str(row.invested),
    latLong: str(row.latLong),
  };
}

export const backfillContactStickyData = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    limit: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    cursor: v.optional(v.id("pipeline")),
    createMissingContacts: v.optional(v.boolean()),
    preferNewestFirst: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const summary = { dryRun: args.dryRun, /* ... */ };

    // Paginate pipeline; filter org via file.organizationId
    // ... implementation per algorithm above

    return summary;
  },
});
```

### 5.3 Explicit non-goals (37.1.C)

- **Does not** modify or delete `pipeline.dealData`  
- **Does not** remove duplicate data from deal JSON  
- **Does not** migrate library documents (separate pass for `documentCategory`)  
- **Does not** run automatically on deploy  

---

## 6. Pre-flight checklist (before `dryRun: false`)

1. Run `contactMigration` / ensure `contactFileLinks` exist for files with substantive deals  
2. `dryRun: true` on staging prod snapshot or limited `limit: 50`  
3. Review `skippedNoPrimaryContact` — should be near zero for active files  
4. Review `skippedDuplicateReo` — high count is OK (idempotency working)  
5. Spot-check 3 contacts in dashboard after small `limit` live run  
6. Full org run off-peak with `organizationId` filter per tenant  

---

## 7. Operator commands (future — do not run until approved)

```bash
# Dry run (safe)
npx convex run migrations/backfillContactStickyData:backfillContactStickyData \
  '{"adminSecret":"<secret>","dryRun":true,"limit":100}'

# Live pilot
npx convex run migrations/backfillContactStickyData:backfillContactStickyData \
  '{"adminSecret":"<secret>","dryRun":false,"limit":50,"organizationId":"<org>"}'
```

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| Wrong contact gets REO | Primary resolution priority + dry run logs per file |
| Triple-count REO across 3 files | Fingerprint dedupe on contact |
| Co-borrower loses income | Split `incomeRows` by borrower tag |
| Business entity duplicated across files | Org + EIN/legalName fingerprint |
| Untraceable backfill | Mandatory `contactDataVersions` with `_migration` wrapper |
| Overwrite existing manual edits | Skip contacts with non-migration versions newer than backfill marker |

---

## 9. Audit constraints

- **No migration executed** in Phase 37.1.C  
- **No changes** to `pipeline.dealData` or intake validators  
- Proposed script path only: `convex/migrations/backfillContactStickyData.ts`
