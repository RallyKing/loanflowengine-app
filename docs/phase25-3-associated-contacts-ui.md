# Phase 25.3 — Pipeline File Associated Contacts UI Refactor

**Track:** Core CRM Architecture  
**Status:** Complete  
**Depends on:** Phase 25.1 (org `contactRoles` catalog), Phase 25.2b (link-level `contactRoleId` routing)

## Problem

After Phase 25.2b fixed backend referral routing, the **Pipeline File** “Associated Contacts” block still used free-text inputs for “Role” when linking or creating contacts. That diverged from the Contacts page and Settings-driven CRM roles, and users could not pick `referral_partner` (etc.) at link time.

## Solution

Replaced legacy open-text role fields with **single-select** dropdowns populated from `organizationSettings.contactRoles` (already loaded in `PipelineFileWorkspace` via `api.organizationSettings.getContactRoles`).

### Components updated

| File | Change |
|------|--------|
| `lender-app/components/pipeline/blocks/FileContactsBlock.tsx` | `ContactRoleSelect`; link/create forms use `contactRoleId`; existing links edit CRM role via dropdown; display uses link-level role with contact fallback |
| `lender-app/components/PipelineFileWorkspace.tsx` | `onLink` / `onCreateAndLink` / `onUpdateLink` pass explicit `contactRoleId`; `role` string on link set to role **display name** for schema compatibility |

### Data contract

- **Single `contactRoleId` per `contactFileLinks` row** — no multi-select; schema unchanged.
- **`contactFileLinks.role`** (required string) is still written: set to the selected role’s **display name** (e.g. “Referral Partner”) so activity summaries and legacy readers keep a human label.
- **New contacts** created from the file workspace receive `contacts.contactRoleId` from the same dropdown at create time.
- **Link existing:** user can override the contact’s default CRM role for this file via the dropdown before linking.

### Multi-selection

Not implemented. `contactFileLinks` and `contacts` each store one `contactRoleId`. Multiple CRM roles per contact on one file would require schema and hub projection changes — out of scope for 25.3.

### Queries

No new Convex API. Roles flow: `getContactRoles` → `workspaceContactRoles` → `FileContactsBlock` `contactRoles` prop.

## Verification

1. Open a pipeline file → Associated Contacts.
2. **Link existing:** choose contact + CRM role from dropdown → link appears with correct role badge; Referral Partner hub view includes link when role is `referral_partner`.
3. **Create & link:** new contact gets selected CRM role on contact + link.
4. **Edit linked row:** change “CRM role on this file” dropdown → `contactFileLinks.upsert` updates `contactRoleId`.

## Deployment

- `npm run build` (from `lender-app/`)
- Production: `npm run deploy:prod` or `npx vercel deploy --prod --yes` (project: loanflowengine)
