# Phase 25.5 — Referral Filter Strict Enforcement

**Date:** 2026-06-03  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-4-referral-hub-realignment.md](./phase25-4-referral-hub-realignment.md)

---

## Leaks identified (root causes)

| # | Location | What allowed non-referral rows through |
|---|----------|----------------------------------------|
| 1 | `isReferralPartnerGraphLink` (25.4) | Returned **`true` when `relationshipType` was empty** — any row in `graphLinks.referrals` without a tag was treated as a referral partner. |
| 2 | `isReferralPartnerFileAssociation` (25.4) | Fell back to **`effectiveContactRoleIdFromDoc`** (legacy `labels` / `crmRelationshipTypes` inference) and legacy link `relationshipType` tokens (`referral`, `broker`, …). |
| 3 | `pipelineGraphPreviewLinks` junction pass | `contactReferralFlags` used **effective** role, so label-inferred “referral” contacts entered via stale `fileReferralPartners` edges. |
| 4 | `contacts.list` + hub filter (missing) | No dedicated referral filter; **`contactMatchesRoleFilter`** matched contacts with **any** file link carrying `referral_partner`, even when the contact’s stored role was `client`. |
| 5 | `buildGraphProjectionIndex` | Indexed **all** `gl.referrals` entries into `referralToFileIds` without strict tagging (secondary index pollution). |

---

## Fixes

### `lib/contact/contactRoles.ts`

- Added `canonicalContactRoleIdFromDoc` (stored field only).
- Added `isReferralPartnerRoleId` (exact `referral_partner` match).
- **`isReferralPartnerFileAssociation`** — link role OR canonical contact role only; no legacy inference.
- **`isReferralPartnerGraphLink`** — requires explicit `contactRoleId` or `relationshipType` === `referral_partner`; **never defaults to true**.

### `convex/pipelineGraphPreviewLinks.ts`

- Referral graph links include **`contactRoleId`** on each entry.
- CFL pass uses strict association helper; junction pass requires **canonical** `contact.contactRoleId === referral_partner`.

### `convex/contacts.ts`

- `contacts.list` arg **`strictCanonicalRoleMatch`** — when true, filter uses **`contact.contactRoleId` only** (no file-link or legacy inference).

### `lib/pipeline/graphProjection.ts`

- `buildGraphProjectionIndex` skips non-strict referral graph links.
- **`buildReferralFocusTree`** — requires `referral_partner` on each link; nodes carry `contactRoleId`; post-filter drops non-referral entity ids.
- **`filterReferralFocusTree`** — pre-filters to nodes with `contactRoleId === referral_partner`.
- **`projectionSearchHaystack`** (referral mode) — only strict referral link labels.

### `app/pipeline/PipelinePageClient.tsx`

- **`api.contacts.list`** with `contactRoleIdFilter: referral_partner` + **`strictCanonicalRoleMatch: true`** for the Referral Partner dropdown.
- Dropdown **`pipeline-referral-partner-filter`** when Referral Partner Focus is active.
- Tree narrowed by `filterEntityKey` when a partner is selected.

### `convex/indexedGraphEdgeSync.ts`

- `isReferralContactFileLink` delegates to strict `isReferralPartnerFileAssociation` (no legacy link-type bypass).

---

## End state

- Referral Partner Focus tree nodes only represent contacts with **`contactRoleId === referral_partner`** on the link or stored contact row.
- Hub referral filter dropdown lists **canonical referral partners only** (not clients/lender reps inferred from labels or per-file links).
- Partners with zero active files in the current hub row set remain hidden from the tree (25.4 behavior preserved).

---

## Deployment

- `npm run build` (from `lender-app/`)
- Convex: `npm run convex:deploy:prod`
- Vercel: `npm run deploy:prod` → https://dlcfunds.vercel.app

---

*End of Phase 25.5.*
