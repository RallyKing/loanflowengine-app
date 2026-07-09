# Phase 25.1b — Contact Roles Migration & Label Purge (execution)

**Date:** 2026-05-28  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-1a-contact-roles-audit.md](./phase25-1a-contact-roles-audit.md)

---

## Summary

Phase 25.1b replaces free-form `contacts.labels` and the fixed `crmRelationshipTypes` enum with a **settings-driven CRM contact roles catalog** stored on `organizationSettings.contactRoles`. Contacts and CRM link rows reference roles via stable string ids (`contactRoleId`). Legacy fields are removed from the Convex schema; a one-time internal migration strips deprecated data from existing documents.

---

## Database / schema

### `organizationSettings`

| Field | Type | Notes |
|-------|------|--------|
| `contactRoles` | optional array of `{ id, displayName, isSystemDefault }` | Seeded on create / `ensureOrganizationSettings` |

**Default roles (stable ids):**

| id | displayName | isSystemDefault |
|----|-------------|-----------------|
| `client` | Client | yes |
| `referral_partner` | Referral Partner | yes (migrated from legacy `referral`) |
| `deal_partner` | Deal Partner | yes (new) |
| `lender_rep` | Lender Rep | yes (migrated from legacy `lender_rep`) |

### `contacts`

- **Removed:** `labels`, `crmRelationshipTypes`
- **Added:** `contactRoleId` (optional string; server defaults to `client` when unset/invalid)

### `contactFileLinks` / `contactLenderLinks`

- **Removed:** `relationshipType` (CRM enum on link)
- **Added:** `contactRoleId` (optional string)
- **Unchanged:** free-text `role` per link (e.g. “co-signer”) — still separate from CRM category

### Shared library

- `lender-app/lib/contact/contactRoles.ts` — defaults, normalization, legacy inference, display helpers

---

## Convex API

| Module | Changes |
|--------|---------|
| `organizationSettings.ts` | `getContactRoles`, `updateContactRoles`; seed/backfill `contactRoles` |
| `contacts.ts` | `contactRoleId` on create/update; `contactRoleIdFilter` on `list`; removed `labelFilter`, `listDistinctLabels` |
| `contactFileLinks.ts` / `contactLenderLinks.ts` | `contactRoleId` on upserts; referral graph sync uses `referral_partner` |
| `migrations/contactRolesMigration.ts` | **`migrateContactRolesAndPurgeLabels`** (internal mutation) |

### Migration mapping (contacts)

| Legacy signal | New `contactRoleId` |
|---------------|---------------------|
| enum `client` or label “client” / borrower-like | `client` |
| enum `referral` or label “referral” / partner-like | `referral_partner` |
| label “deal partner” | `deal_partner` |
| enum `lender_rep` or label “lender” | `lender_rep` |
| (fallback) | `client` |

Link rows: legacy `relationshipType` on file/lender links mapped to the same ids; field removed on patch.

**Run on production Convex (after `convex deploy`):**

Load `.env.convex.prod` (or `npx convex login`), then:

```bash
cd lender-app
# Recommended (handles JSON + admin secret on Windows/macOS/Linux):
node scripts/run-contact-roles-migration.mjs --dry-run
node scripts/run-contact-roles-migration.mjs

# Or manual (requires adminSecret + valid JSON quoting):
npx convex run migrations/contactRolesMigration:migrateContactRolesAndPurgeLabels \
  '{"adminSecret":"<DATA_MIGRATION_ADMIN_SECRET>","dryRun":true}'
```

---

## UI & frontend (11 audited paths — purge complete)

| # | Path | Change |
|---|------|--------|
| 1 | `app/contacts/page.tsx` | Role dropdown from `getContactRoles`; filter by `contactRoleIdFilter`; labels/CRM toggles removed |
| 2 | `components/pipeline/blocks/FileContactsBlock.tsx` | Shows role display name via `contactRoles` prop |
| 3 | `components/PipelineFileWorkspace.tsx` | Loads `getContactRoles`; passes `contactRoles` to block; upserts use `contactRoleId: "client"` |
| 4 | `components/intake/Dashboard.tsx` | New file contact link uses `contactRoleId` |
| 5 | `components/NewPipelineFileDialog.tsx` | Same |
| 6 | `components/settings/OrganizationContactRolesPanel.tsx` | **New** — CRM Contact Roles settings section |
| 7 | `components/OrganizationSettingsPanel.tsx` | Wires contact roles panel |
| 8 | `lib/globalSearchText.ts` | Indexes `contactRoleId` (not labels) |
| 9 | `lib/contact/contactMethods.ts` | Search haystack includes role id |
| 10 | `lib/helpCenterContent.ts` | Copy updated (roles, not labels) |
| 11 | `convex/integrationHttp.ts` | List filter param → `contactRoleIdFilter` |

**Also updated (backend/support):** `demoWorkspace.ts`, `testingSeed.ts`, `contactMigration.ts`, `lenderContactMigration.ts`, `indexedGraphEdgeSync.ts`, `indexedGraphAnalyze.ts`, `indexedGraphBackfill.ts`, `indexedGraphCompat.ts`, `pipelineGraphPreviewLinks.ts`, operator graph proof steps.

**Out of scope (unchanged):** Loan client graph `relationshipType` (`primary`, `coborrower`, etc.), task triage labels, `lib/crmRelationship.ts` email normalization helpers.

---

## Build & deploy

- **Build:** `npm run build` from `lender-app/` — passed (2026-05-28).
- **Convex:** Deploy backend with `npm run convex:deploy:prod` before running the migration on live data.
- **Vercel:** `npm run deploy:prod` or `npx vercel deploy --prod --yes --project loanflowengine`.

---

## Post-deploy checklist

1. Convex deploy + run migration (dry-run then apply).
2. Settings → confirm **CRM Contact Roles** lists four defaults; add a custom role smoke test.
3. Contacts → create/edit contact with role select; filter by role.
4. Pipeline file workspace → contacts block shows role names.
5. Production smoke: login, contacts, pipeline file, mobile scroll (per governance).

---

## Migration results

Migration was **not executed** in the agent session (requires operator `convex run` against production). After running, record counts from the mutation return payload (`contactsUpdated`, `fileLinksUpdated`, `lenderLinksUpdated`, `orgsProcessed`) in this section.
