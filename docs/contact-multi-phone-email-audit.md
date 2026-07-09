# CRM Contacts — multi email / phone audit (Phase 1)

Date: 2026-05-28  
Scope: Standalone `contacts` table and CRM surfaces (not embedded `lenders.contacts[]`).

## Current schema (after Phase 2)

Table: `contacts` (`lender-app/convex/schema.ts`)

| Field | Type | Role |
|-------|------|------|
| `email` | `string` | Legacy primary scalar; **kept** and synced from primary `emails[]` entry |
| `phone` | `string` | Legacy primary scalar; synced from primary `phones[]` entry |
| `emails` | optional array | `{ id, label, email, isPrimary }` |
| `phones` | optional array | `{ id, label, number, isPrimary }` |
| `emailKey` | optional string | Dedup index on primary email (unchanged) |
| `globalSearchText` | optional string | Built via `buildContactGlobalSearchText` (all methods + labels) |

**Email labels:** Work, Personal, Billing, Assistant, Other  
**Phone labels:** Mobile, Work, Home, Direct, Office, Fax, Assistant, Emergency, Other  

**Rules:** At most one `isPrimary` per collection; normalization in `lib/contact/contactMethods.ts`.

Rollback log table: `contactMultiMethodsMigrationLog`.

## Pre-change state (historical)

- Single `email` and `phone` strings per contact.
- UI: one email + one phone field on `/contacts`.
- Search: client list filtered on `c.email` only; server global search index used `globalSearchText` (scalar email only in blob builder).

## Migration requirements

1. **Data migration** (`convex/migrations/contactMultiMethodsMigration.ts`):
   - For rows with legacy `email` / `phone` but missing corresponding arrays, append primary entries (`label: "Other"`, `isPrimary: true`).
   - Do **not** clear legacy scalars; keep them aligned with primary.
   - Idempotent: skip when array already populated for that side.
   - `dryRun` + `contactMultiMethodsMigrationLog` for rollback.

2. **Runtime reads:** `resolveContactEmails` / `resolveContactPhones` fall back to legacy scalars until migration runs.

3. **Writes:** `contacts.create` / `contacts.update` accept `emails` / `phones`; `normalizeContactMethods` + `contactMethodsToConvexFields` sync scalars and `emailKey`.

## Mutations & import flows

| Surface | Path | Status |
|---------|------|--------|
| Create | `convex/contacts.ts` `create` | Accepts `emails` / `phones`; duplicate check uses `allContactEmailStrings` |
| Update | `convex/contacts.ts` `update` | Same |
| Demo insert | `insertDemoWorkspaceContact` | Uses `resolveMethodsFromArgs` |
| Pipeline → standalone | `convex/contactMigration.ts` | New contacts use `normalizeContactMethods` |
| Operator migration | `convex/migrations/contactMultiMethodsMigration.ts` | New |

**Not changed (out of CRM scope):** `lenders.contacts[]`, CSV lender import, discovery candidates — still scalar lender contact shapes.

## UI surfaces impacted

| Surface | File | Change |
|---------|------|--------|
| CRM list + editor | `app/contacts/page.tsx` | Multi editor, detail panel, search all methods |
| Contact methods UI | `components/contacts/ContactMethodsEditor.tsx` | New |
| Contact detail | `components/contacts/ContactMethodsDetail.tsx` | New |
| File contacts block | `components/pipeline/blocks/FileContactsBlock.tsx` | Primary email/phone display |
| Global search subtitle | `convex/globalSearch.ts` | `primaryContactEmail` |
| Search blob | `lib/globalSearchText.ts` | All emails/phones + labels |

## Search

- **Client** (`contactMatchesSearchTokens`): `allContactEmailStrings` + `allContactPhoneStrings`.
- **Server** (`globalSearchText` + `searchIndex`): rebuilt on create/update/migration via `refreshContactGlobalSearchText`.

## Validation checklist (Phase 7)

- [ ] Create contact with multiple emails/phones
- [ ] Edit: add/remove/set primary
- [ ] List search matches non-primary email/phone
- [ ] Global search matches secondary addresses
- [ ] Run `migrateContactMultiMethods` (dry-run then apply)
- [ ] Rollback one log row (staging)
- [ ] Legacy rows without arrays still display via resolvers

## Deploy notes

- Push Convex schema + functions before Vercel.
- Run data migration with admin secret after deploy.
- `npm run qa:governance` + `npm run deploy:prod` from `lender-app/`.
