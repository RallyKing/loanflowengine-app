# Phase 25.2b — Referral link hardcoding fix & hub alignment

**Date:** 2026-05-28  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-2a-referral-contacts-audit.md](./phase25-2a-referral-contacts-audit.md)

---

## Problem

`contactFileLinks.upsert` callers passed **`contactRoleId: "client"`** unconditionally, overriding contacts tagged `referral_partner`. Hub Referral Partner projection reads link/contact roles via `batchGraphLinksForPipelineLinks` → empty referral groups.

---

## Changes

### Frontend — removed hardcoded `"client"`

| File | Change |
|------|--------|
| `components/PipelineFileWorkspace.tsx` | `onLink` / `onUpdateLink` use `effectiveContactRoleIdFromDoc(contact)` from `workspaceContactById`; `onCreateAndLink` omits `contactRoleId` (server inherits from new contact row) |
| `components/NewPipelineFileDialog.tsx` | Existing-contact rows pass `effectiveContactRoleIdFromDoc(existingContact)`; new contacts omit arg |
| `components/intake/Dashboard.tsx` | Same as new-file dialog |

### Backend

| File | Change |
|------|--------|
| `convex/contactFileLinks.ts` | `resolvedContactRoleId` = explicit arg if provided, else `effectiveContactRoleIdFromDoc(contact)` |
| `convex/pipelineGraphPreviewLinks.ts` | Referral detection: `link.contactRoleId === "referral_partner"` **or** contact’s effective role is `referral_partner` (heals stale `client` on link rows); contact flags use `effectiveContactRoleIdFromDoc` |

---

## Removed strings

All instances of **`contactRoleId: "client"`** in file-link upsert paths listed above (3 in `PipelineFileWorkspace.tsx`, 1 each in `NewPipelineFileDialog.tsx` and `intake/Dashboard.tsx`).

Per-file free-text `role` (e.g. “primary borrower”) is unchanged — that is not the CRM catalog role.

---

## Hub projection repair

1. **New links** store the contact’s CRM `contactRoleId` on `contactFileLinks`.  
2. **`syncFileReferralEdgeFromContactLink`** runs with `referral_partner` when appropriate → `fileReferralPartners` junction stays in sync.  
3. **`listTablePreview` graph links** include referrals when either the link or the contact is a referral partner.

---

## Existing data with wrong link role

Links already saved as `client` while the contact is `referral_partner`:

- **Hub:** Should appear immediately after Convex deploy (graph builder honors contact role).  
- **Link row:** Re-save the association from the file workspace (edit per-file role or notes) to persist `referral_partner` on the link, or run a one-off repair mutation.

---

## Verification

- `npm run build` — passed (2026-05-28).
- Manual: link Referral Partner to file → Pipeline Hub → Referral Partner Focus → file grouped under partner name.

---

*End of Phase 25.2b.*
