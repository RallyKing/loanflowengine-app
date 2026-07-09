# Contact search validation (Phase 24.5.2)

Date: 2026-05-28

## Server index (`globalSearchText` + `searchIndex`)

**Builder:** `lib/globalSearchText.ts` → `buildContactGlobalSearchText`

Indexed per contact (lowercased blob):

| Source | Included? |
|--------|-----------|
| Primary email (scalar + primary array entry) | Yes — via `allContactEmailStrings` |
| Secondary / tertiary emails | Yes — all `emails[]` values |
| Primary phone | Yes — via `allContactPhoneStrings` |
| Secondary phones | Yes — all `phones[]` values |
| Email labels (Work, Personal, Billing, Assistant, Other) | Yes — `emails[].label` |
| Phone labels (Mobile, Work, Home, Direct, Office, Fax, Assistant, Emergency, Other) | Yes — `phones[].label` |
| Name, notes, company, free labels, CRM relationship types | Yes |

**Refresh triggers:** `contacts.create` / `update`, `contactMultiMethodsMigration`, `lenderContactMigration` (after 24.5.2 patch), manual `refreshContactGlobalSearchText`.

**Global search UI:** `convex/globalSearch.ts` uses search index on `globalSearchText`; subtitle shows `resolvePrimaryEmail` (display only — match uses full blob).

---

## Client list search (`/contacts`)

**Function:** `contactSearchHaystack` in `lib/contact/contactMethods.ts`  
**Used by:** `app/contacts/page.tsx` → `contactMatchesSearchTokens`

Token examples that must match:

| Query | Must hit contact with |
|-------|---------------------|
| `john@secondary.com` | Non-primary email in `emails[]` |
| `5552222222` | Non-primary phone in `phones[]` |
| `fax` | Phone label `Fax` |
| `assistant` | Label on email or phone |
| `work` | Email label `Work` |

---

## Task drawer contact picker

**Before:** `(c.email ?? "")` only.  
**After 24.5.2:** `contactSearchHaystack(c)` — all emails, phones, labels.

---

## Org duplicate detection (search-adjacent)

**`assertNoDuplicateEmailsInOrg`:** every `allContactEmailStrings` value — secondary emails block duplicate creates/updates.

---

## Not in CRM search (by design)

- Lender catalog search (`lenderSearchText.ts`) — embedded lender contacts only  
- Discovery candidate search — separate table  
- Pipeline file embedded `contacts[]` — not synced to CRM search unless linked/migrated  

---

## Manual validation checklist

1. Create contact: primary Work email + secondary Personal email + Fax phone.  
2. `/contacts` search: each address, each label token.  
3. Header global search: secondary email substring.  
4. Task drawer → relate contact: search secondary email.  
5. After `migrateContactMultiMethods`: legacy-only row still findable via resolver-backed blob refresh.

**Status:** Code paths verified; automated Playwright spec not added (out of scope 24.5.2).
