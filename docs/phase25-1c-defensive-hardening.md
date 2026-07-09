# Phase 25.1c — Contacts query defensive hardening

**Date:** 2026-05-28  
**Track:** C — Core CRM Architecture  
**Follows:** [phase25-1b-contact-roles-execution.md](./phase25-1b-contact-roles-execution.md)

---

## Problem

After Phase 25.1b, the Contacts tab could fail with *"Could not load contacts (Convex deployment mismatch…)"* when:

1. **Convex schema** no longer declared legacy fields (`labels`, `crmRelationshipTypes`, link `relationshipType`) but production rows still contained them → document validation failure on read.
2. **`contactRoleId`** was missing on unmigrated contacts while filters/UI assumed it was always present.

`contactRoleId` was already `v.optional(v.string())` in schema; the primary crash vector was **extra legacy fields** on stored documents, not a required `contactRoleId`.

---

## Fixes

### 1. Schema (`convex/schema.ts`)

Re-added **optional deprecated** fields so unmigrated documents validate:

| Table | Legacy fields (optional) |
|-------|----------------------------|
| `contacts` | `labels`, `crmRelationshipTypes` |
| `contactFileLinks` | `relationshipType` |
| `contactLenderLinks` | `relationshipType` |

`contactRoleId` remains optional on all tables.

### 2. Query layer (`convex/contacts.ts`)

- `effectiveContactRoleIdFromDoc` (via `lib/contact/contactRoles.ts`) resolves role from `contactRoleId` → legacy CRM enum → legacy labels → default `client`.
- `normalizeContactForClient()` — every `list` / `get` response includes a resolved `contactRoleId`.
- `contactMatchesRoleFilter()` uses effective role on contacts and links (including legacy `relationshipType` on links).

### 3. Frontend fallbacks

| File | Behavior |
|------|----------|
| `lib/contact/contactRoles.ts` | `effectiveContactRoleIdFromDoc()` exported |
| `lib/contact/contactMethods.ts` | Search haystack uses effective role + legacy tokens |
| `app/contacts/page.tsx` | Draft/list display via effective role |
| `components/pipeline/blocks/FileContactsBlock.tsx` | Always shows role line with fallback |

---

## Deploy order (required)

**Vercel alone is not sufficient.** The running Convex deployment must include the relaxed schema and hardened `contacts.list` / `contacts.get`.

From `lender-app/` (use `.env.convex.prod` for `CONVEX_DEPLOY_KEY` or `npx convex login`):

```bash
npm run convex:deploy:prod
node scripts/run-contact-roles-migration.mjs --dry-run
node scripts/run-contact-roles-migration.mjs
```

**Executed 2026-05-28:** deploy OK; dry-run + live migration updated **20 contacts**, **15 file links**, **1 lender link** across **3 orgs**.

Then confirm Contacts loads and run Vercel production deploy if not already current.

---

## Verification

- `npm run build` — passed (2026-05-28).
- Contacts page should load with unmigrated data; roles display as Client / inferred legacy mapping until migration runs.
- After migration, legacy fields are stripped from documents; optional schema fields remain harmless.

---

## End state

Contacts **must not** fatal-error when migration has not run. Missing `contactRoleId` is filled at read time; legacy fields remain readable until the one-time migration purges them.
