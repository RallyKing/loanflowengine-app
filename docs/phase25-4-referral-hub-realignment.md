# Phase 25.4 — Pipeline Referral Projection & Search Realignment

**Date:** 2026-06-03  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-3-associated-contacts-ui.md](./phase25-3-associated-contacts-ui.md), [phase25-2b-referral-link-fix.md](./phase25-2b-referral-link-fix.md)

---

## Problem

After Phase 25.3, file workspace forms persist correct `contactRoleId: referral_partner` on `contactFileLinks`. The **Pipeline Hub → Referral Partner Focus** view still mis-grouped files because:

1. Graph preview merged **stale** `fileReferralPartners` junction rows without validating CRM role.
2. Referral detection used loose `link OR contact` logic that could include non-referral link roles.
3. Hub search only matched top-level partner labels and dropped nested files when filtering.

---

## Solution

### Shared referral association rule (`lib/contact/contactRoles.ts`)

- `isReferralPartnerFileAssociation` — link `contactRoleId` wins; empty link role falls back to `effectiveContactRoleIdFromDoc(contact)`; legacy `relationshipType` referral/broker/introducer still honored during migration.
- `isReferralPartnerGraphLink` — client-side filter on `graphLinks.referrals` rows (expects `relationshipType: referral_partner`).

### Server graph builder (`convex/pipelineGraphPreviewLinks.ts`)

1. **Primary source:** `contactFileLinks` per file via `isReferralPartnerFileAssociation`.
2. **Secondary:** `fileReferralPartners` only when the contact is a referral partner **and** not already added from CFL (avoids orphan junction clutter).
3. All referral graph links emit `relationshipType: referral_partner`.

### Convex edge sync (`convex/indexedGraphEdgeSync.ts`)

- `isReferralContactFileLink` delegates to `isReferralPartnerFileAssociation` (same rule as hub + `syncFileReferralEdgeFromContactLink`).

### Client hub projection (`lib/pipeline/graphProjection.ts`)

- `buildReferralFocusTree` rebuilds `referralToFileIds` from active table rows using strict graph-link filtering; `buildEntityFocusNodes` excludes partners with **zero** files in the current filtered set.
- `filterReferralFocusTree` — partner name match keeps **all** nested loans; file-name match shows partner with matching loans only.

### Pipeline page (`app/pipeline/PipelinePageClient.tsx`)

- Referral mode uses `filterReferralFocusTree` instead of generic `filterEntityFocusTree`.

---

## Multi-select / schema

Unchanged: one `contactRoleId` per `contactFileLinks` row. Hub groups by **contact id** (one partner node per person).

---

## Verification

1. Link a `referral_partner` contact to an active file (file workspace dropdown).
2. Pipeline Hub → **Referral Partner Focus** → partner appears with that file nested.
3. Partners with no files in the current hub filter set do **not** appear.
4. Search partner name → partner row remains with all referred files visible.
5. `npm run build` from `lender-app/`.

---

## Deployment

- **Convex** (graph preview + edge sync): `npm run convex:deploy:prod` when backend files change.
- **Vercel:** `npm run deploy:prod` (project: loanflowengine).

---

*End of Phase 25.4.*
