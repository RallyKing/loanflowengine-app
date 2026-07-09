# CRM contact import / export audit

Date: 2026-05-28  

---

## Executive summary

| Capability | Exists today? | Multi-email/phone + labels? |
|------------|---------------|-----------------------------|
| CRM contacts CSV export | **No** | — |
| CRM contacts CSV import | **No** | — |
| Lender CSV import/export | **Yes** (`lib/csv.ts`) | **No** — single email/phone per embedded contact row |
| Pipeline contact export | **No** dedicated format | — |
| Convex bulk API | Partial (`integrationHttp`) | Full document JSON |

**Risk:** Users exporting/importing **lenders** or using **scalar create** paths will **lose** secondary CRM methods unless new columns or JSON bundles are added.

---

## 1. Lender CSV (`lib/csv.ts`)

**Used by:** `LenderTable.tsx`, `LendersWorkspaceClient.tsx`, `convex/lenders.ts` bulk upsert.

### Primary columns

Standard `LENDER_FIELDS` include scalar:

- `Contact Name`, `Phone`, `Email` (one each on lender row)

### Structured columns

| Header | Format | Contact shape |
|--------|--------|---------------|
| `Additional Contacts (JSON)` | JSON array | `{ name, titleRole?, phone?, email?, notes? }` — **one phone, one email per object** |
| `Additional Phones (JSON)` | JSON array | `{ label?, phone }` — lender-level extra phones, not CRM |

### Parse (`parseContactList`)

```ts
email: String(obj.email ?? "").trim()
phone: String(obj.phone ?? "").trim()
```

No `emails[]`, `phones[]`, labels beyond lender `phoneNumbers` pattern.

### Export (`serializeContactList`)

Round-trips same single-value shape. **Labels on CRM email types (Work/Personal) are not represented.**

### Dedupe (`dedupeKey`)

Uses lender scalar `email` or `contactName` — not CRM multi-method.

**Verdict:** Lender CSV is **orthogonal** to CRM `contacts.emails[]`. Importing lenders does not populate CRM multi-method arrays.

---

## 2. CRM contacts — no CSV module

**Workspace:** `app/contacts/page.tsx`

- No Export CSV button
- No Import CSV flow
- Data entry: UI editor + Convex mutations only

**Verdict:** Secondary methods are safe from CSV loss **only because there is no CRM CSV path yet**.

---

## 3. Scalar create/import paths (data loss on input)

These write **at most one** email/phone per contact (normalized to primary):

| Path | File | Fields |
|------|------|--------|
| Pipeline create+link | `PipelineFileWorkspace.tsx` | `email`, `phone` optional strings |
| Intake dashboard | `components/intake/Dashboard.tsx` | `row.email`, `row.phone` |
| New pipeline file dialog | `components/NewPipelineFileDialog.tsx` | same |
| Lender contact migration | `convex/lenderContactMigration.ts` | scalar insert |
| Pipeline → CRM migration | `convex/contactMigration.ts` | **OK** — `normalizeContactMethods` on insert |

---

## 4. Proposed CRM CSV format (not implemented)

### Export columns (flat)

| Column | Example |
|--------|---------|
| Name | Jane Doe |
| Company | Acme LLC |
| Email 1 | jane@work.com |
| Email 1 Label | Work |
| Email 1 Primary | yes |
| Email 2 | jane@gmail.com |
| Email 2 Label | Personal |
| Phone 1 | 5551111111 |
| Phone 1 Label | Mobile |
| Phone 1 Primary | yes |
| Phone 2 | 5552222222 |
| Phone 2 Label | Fax |
| Notes | … |
| Labels | client; referral |

Support **Email 1..N** / **Phone 1..N** with configurable max (e.g. 10) or alternate **JSON column**:

`Contact Methods (JSON)` → `{ emails: [...], phones: [...] }` matching Convex shape.

### Import rules

1. Parse all `Email *` / `Phone *` columns into arrays.
2. Exactly one `* Primary = yes` per type (else first non-empty wins).
3. Run `normalizeContactMethods` + `assertNoDuplicateEmailsInOrg`.
4. Never blank existing secondaries on partial row update — **merge** by email/phone key unless `Import Mode=replace`.

### Export rules

1. Emit primary row first (Email 1 / Phone 1 = primary).
2. Preserve labels verbatim.
3. Include legacy scalar columns `Primary Email` / `Primary Phone` for Excel users.

---

## 5. Other export surfaces

| Surface | Includes CRM contacts? |
|---------|------------------------|
| Pipeline table CSV | File rows, not contact methods |
| Tasks CSV | Task fields |
| Ledger CSV | Funding rows |
| Intake XLSX/CSV | Deal sheet, not CRM |
| Print / PDF | Deal terms |

---

## 6. Communication preferences (schema-only)

New optional fields on `contacts` (no import/export yet):

- `preferredEmailId`, `preferredPhoneId`, `preferredContactMethod` (`email` | `phone` | `sms`)

Resolvers default to primary when unset — see `resolvePreferredEmail` in `lib/contact/contactMethods.ts`.

Future CSV columns: `Preferred Contact Method`, `Preferred Email Id` (or map from Email 2 + label).

---

## Recommended implementation order

1. `lib/contact/csv.ts` — `parseContactCsv` / `buildContactCsv` with Email 1..3 / Phone 1..3 + labels  
2. `/contacts` — Import / Export buttons (org permission gated)  
3. Extend lender CSV only if lender embedded contacts gain multi-method shape  
4. Update `contactMigration` + `lenderContactMigration` to emit arrays on import  

---

## Verification checklist

- [ ] Export contact with 3 emails → re-import → 3 emails + labels restored  
- [ ] Import row with only Email 2 set → becomes primary or secondary per rules  
- [ ] Duplicate Email 2 across org → rejected with clear error  
- [ ] Lender CSV round-trip unchanged (regression)
