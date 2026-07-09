# Phase 25.6 — Referral Hub Lender Leak Surgical Fix

**Date:** 2026-06-03  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-5-strict-referral-enforcement.md](./phase25-5-strict-referral-enforcement.md)

---

## Root cause

Phase 25.5 stopped **legacy inference** but still allowed **link-level `contactRoleId: referral_partner`** to win over the contact row. After the Phase 25.1b migration, many `contactFileLinks` rows inherited `referral_partner` from deprecated link `relationshipType: "referral"` while the **contact** remained (or should remain) `lender_rep` — e.g. entities named **"Has 9 lenders"** and **"A-Paper Lender"**.

Secondary amplifier: the hub graph **merged `fileReferralPartners` junction rows** without re-validating canonical contact role, which could keep stale referral edges alive.

There was **no cross-wiring** from `contactLenderLinks` or `lenders` table IDs into `gl.referrals`. Production audit (2026-06-03) confirmed:

| Contact | Stored `contactRoleId` (before fix) | `contactFileLinks` with `referral_partner` | `fileReferralPartners` edges |
|---------|-------------------------------------|--------------------------------------------|------------------------------|
| A-Paper Lender | `referral_partner` (wrong) | 0 | 1 |
| Has 9 lenders | `referral_partner` (wrong) | 0 | 1 |

Hub rows were driven by **stale `fileReferralPartners` junction** + **mis-tagged contact rows**, not CFL referral links.

---

## Fixes

### 1. Role engine (`lib/contact/contactRoles.ts`)

- `contactQualifiesForReferralHub` — canonical `contacts.contactRoleId` must be exactly `referral_partner`.
- `isReferralPartnerFileAssociation` — **contact veto first**; link tag must agree.
- `isReferralPartnerGraphLink` — rejects rows when `canonicalContactRoleId` is not `referral_partner`.

### 2. Graph builder (`convex/pipelineGraphPreviewLinks.ts`)

- Referrals built **only from `contactFileLinks`** when `contactQualifiesForReferralHub(contact)`.
- Each referral graph link carries `canonicalContactRoleId` from the contact row.
- **`fileReferralPartners` junction disabled** for hub preview (empty pass).

### 3. Client projection (`lib/pipeline/graphProjection.ts`)

- `buildReferralFocusTree` / `filterReferralFocusTree` require both link role and **canonical** `referral_partner` on nodes.

### 4. Data cleanup (`convex/migrations/referralHubLenderLeakFix.ts`)

- `auditReferralHubLenderLeak` — inspect flagged contacts (name patterns + role/link mismatch).
- `fixReferralHubLenderLeak` — set lender contacts to `lender_rep`, downgrade stray `contactFileLinks.contactRoleId`, delete orphan `fileReferralPartners` edges.

**Operator script:** `node scripts/run-referral-hub-lender-leak-fix.mjs audit|fix [--dry-run]`

---

## Production cleanup (executed 2026-06-03)

- `fixReferralHubLenderLeak`: patched 2 contacts `referral_partner` → `lender_rep`, removed 2 `fileReferralPartners` edges.

## Verification

1. Run audit on prod; confirm `"Has 9 lenders"` / `"A-Paper Lender"` roles and links.
2. Run `fix` (dry-run, then live).
3. Pipeline Hub → Referral Partner Focus → only true referral partners (e.g. Ryan Suetrong).

---

## Deployment

- Convex: `npm run convex:deploy:prod` + run fix mutation
- Vercel: `npm run deploy:prod` → https://dlcfunds.vercel.app

---

*End of Phase 25.6.*
