# Phase 25.7b — Multi-Role Schema Upgrade & Referral Hub Parity

## Problem (25.7a)

Phase 25.6 required master `contacts.contactRoleId === referral_partner` for Referral Hub visibility. Linking an existing **Client** as **Referral Partner** on a file only updated `contactFileLinks`, so the hub veto hid the association.

## Solution

Master contacts now store **`contactRoleIds: string[]`**. Legacy `contactRoleId` remains as a mirrored primary field for older readers.

### Schema (`convex/schema.ts`)

- `contactRoleIds: v.optional(v.array(v.string()))` — canonical multi-role storage
- `contactRoleId` — deprecated single field; kept for backward compatibility

`contactFileLinks` is unchanged: one `contactRoleId` per file association.

### Migration

- `convex/migrations/contactMultiRoleMigration.ts` — `migrateContactMultiRole`
- Run: `node scripts/run-contact-multi-role-migration.mjs` (add `--dry-run` first)

### Role helpers (`lib/contact/contactRoles.ts`)

- `effectiveContactRoleIdsFromDoc`, `canonicalContactRoleIdsFromDoc`, `mergeContactRoleIds`
- `contactQualifiesForReferralHub` → `contactRoleIds.includes("referral_partner")`

### Master role append on file link

`contactFileLinks.upsert` calls `appendMasterContactRoleId` when an explicit `contactRoleId` is passed, unioning onto `contactRoleIds` without removing existing roles.

### Hub / graph

- `pipelineGraphPreviewLinks` emits `canonicalContactRoleIds` on referral graph links
- `graphProjection.buildReferralFocusTree` gates on multi-role master arrays

### UI

- **`ContactRoleMultiSelect`** (`components/contacts/ContactRoleMultiSelect.tsx`) — checkbox multi-select on Contacts page master profile
- File workspace keeps **single** `ContactRoleSelect` per link (per-file role)

## Verification

1. Link existing Client as Referral Partner on a pipeline file → master gains `referral_partner` in array → file appears under partner in Referral hub view.
2. Contacts page: tag contact as both Client and Referral Partner → both badges in list; hub filter works.
3. `npm run build` from `lender-app/`
4. Run migration on production Convex after deploy.

## Deployment

From `lender-app/`:

```bash
npm run convex:deploy:prod
node scripts/run-contact-multi-role-migration.mjs
npm run deploy:prod
```
