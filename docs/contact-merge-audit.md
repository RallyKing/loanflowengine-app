# Contact merge & dedupe audit

Date: 2026-05-28  
Scope: Standalone CRM `contacts` table, lender↔contact migration, org duplicate email policy, lender merge (embedded contacts).

Canonical helpers: `lib/contact/contactMethods.ts` — `allContactEmailStrings`, `allContactPhoneStrings`, `normalizeContactMethods`.

---

## Executive summary

| Area | Evaluates all `emails[]` / `phones[]`? | Merge preserves secondary methods? |
|------|----------------------------------------|-------------------------------------|
| `contacts.create` / `update` duplicate guard | **Yes** (emails) | N/A (single-row write) |
| `contactMigration` (pipeline → CRM) | **Yes** (lookup maps) | N/A (match or insert) |
| `lenderContactMigration` | **No** — primary scalar only | **No** — fills empty scalar only |
| Legacy backfill migrations | **No** — `c.email` only | N/A |
| Lender `mergeContactsAndPhones` | N/A (lender embedded rows) | **Partial** — unions embedded rows, one email/phone per row |
| CRM contact merge mutation | **Does not exist** | **Does not exist** |

**Risk:** Secondary CRM emails are enforced on **create/update** but several **lookup/dedupe maps** still index only `contact.email` / `contact.phone`. A secondary address can create a duplicate contact or miss an existing match.

---

## 1. CRM org duplicate email detection

**File:** `lender-app/convex/contacts.ts` — `assertNoDuplicateEmailsInOrg`

**Behavior:**

- Iterates every normalized key from `allContactEmailStrings({ email, emails })` for the incoming row.
- Checks `by_organization_emailKey` index (`emailKey` = primary email only).
- Scans all org contacts with `allContactEmailStrings(other).includes(key)`.

**Verdict:** **Correct** for multi-email — any address in `emails[]` (or legacy scalar) blocks duplicates.

**Gap:** `emailKey` index still reflects **primary only**. Two contacts could theoretically share a secondary email if primary keys differ — the full-org scan catches this on write, but not on index-only lookups elsewhere.

**Phone dedupe:** No org-level duplicate-phone guard on CRM contacts.

---

## 2. Pipeline → standalone contact import

**File:** `lender-app/convex/contactMigration.ts`

| Step | Multi-email aware? |
|------|-------------------|
| `byEmail` map build | **Yes** — `allContactEmailStrings(c)` per existing contact |
| New contact insert | **Yes** — `normalizeContactMethods` + `contactMethodsToConvexFields` |
| Candidate dedupe key | **No** — single `candidate.email` string in `pushCandidate` |

**Verdict:** Existing contact matching can miss when pipeline only has a **second** email that already lives on a CRM contact’s non-primary slot (rare for import candidates).

---

## 3. Lender contact migration

**File:** `lender-app/convex/lenderContactMigration.ts`

**Index maps (lines ~175–181):**

```ts
const e = normEmailKey(c.email);   // primary scalar only
const d = normPhoneDigits(c.phone); // primary scalar only
```

**Reuse patch (lines ~274–278):** Fills empty `email` / `phone` scalars only; does **not** append to `emails[]` / `phones[]`.

**New contact insert (lines ~253–260):** Scalar `email` / `phone` only — no `emails[]` / `phones[]` arrays.

**Verdict:** **Fails** multi-method audit. Re-run after CRM migration should call `normalizeContactMethods` on insert/patch and build maps from `allContactEmailStrings` / `allContactPhoneStrings`.

---

## 4. Legacy data migrations

| File | Dedupe key |
|------|------------|
| `migrations/backfillLegacyOrgScope.ts` | `normalizeEmailKey(c.email)` |
| `migrations/rebindJoshuaExplicitGraph.ts` | `normalizeEmailKey(c.email ?? "")` |
| `migrations/singleTenantConsolidateAllData.ts` | `normalizeEmailKey(c.email)` |

**Verdict:** Primary scalar only. Safe if scalars stay synced with primary (normalization on write). Unsafe if rows have secondary emails not mirrored to `email`.

---

## 5. Lender merge (not CRM)

**File:** `lender-app/convex/lenders.ts` — `mergeContactsAndPhones`, `contactDedupeKey`

- Merges **embedded** `lenders.contacts[]` rows (each row: one `email`, one `phone`).
- Unions `phoneNumbers[]` with labels.
- Does **not** read CRM `contacts.emails[]`.

**Verdict:** Separate system. No CRM array merge.

---

## 6. CRM contact merge

**Search result:** No `mergeContacts` / `mergeContact` mutation for `contacts` table.

**Implication:** Product merge (if added) must:

1. Union `emails[]` / `phones[]` with stable ids, `enforceSinglePrimary`.
2. Re-run `assertNoDuplicateEmailsInOrg` on combined email set.
3. Refresh `globalSearchText`, `emailKey`, legacy scalars via `contactMethodsToConvexFields`.
4. Re-point `contactFileLinks`, `contactLenderLinks`, tasks `relatedContactId`, library links, migration logs.

---

## 7. Analysis / reporting

**File:** `lender-app/convex/lenderContactMigrationAnalysis.ts` — duplicate email **groups across lenders** (not CRM merge).

---

## Recommended fixes (priority)

1. **`lenderContactMigration.ts`** — Build `byEmail` / `byPhone` from `allContactEmailStrings` / `allContactPhoneStrings`; insert/patch via `normalizeContactMethods`.
2. **Optional `emailKeys[]` or secondary index** — If index-only dedupe needed without full table scan.
3. **Future `contacts.merge`** — Explicit array union + duplicate assert + link rewiring (spec before implementation).
4. **Phone dedupe policy** — Decide org-level uniqueness for normalized phone digits across `phones[]`.

---

## Verification checklist

- [ ] Create contact A with primary `a@x.com`, secondary `b@x.com`
- [ ] Create contact B with primary `c@y.com` — should **fail** if `b@x.com` reused
- [ ] Re-run `migrateLenderContacts` dry-run after map fix — no duplicate CRM rows for secondary emails
- [ ] Document operator procedure until CRM merge exists
