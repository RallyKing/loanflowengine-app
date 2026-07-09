# Phase 12.2 Step 3 — Class C Forensic Review (READ ONLY)

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Evidence:** `migration-reports/phase12-step3-forensic-raw.json`  
**Method:** Production inline queries + `operator/auditTenantIsolation` (no mutations, no deploys)

---

## Scope

Manual-review (Class C) entities remaining after Step 2 cleanup:

1. Duplicate DLC org `mx77ssc8sjpgwapfehx8yhz5kd86epd3`
2. E2E Primary org `mx7bfa58ty1svx65bt3h8v6v5186kke9`
3. Auth user `joshuaeballard@gmail.com` (`ts7d3keadq48gay3pa8k6gdwx9878p33`)

**Note:** A new post–Step 2 spam signup (`ts74f4n6…` / org `mx72n32w…`) appeared during this review window. It is **out of Step 3 scope** but listed in Appendix A — treat in Step 4 spam hardening.

---

## 1. Duplicate DLC org

### Identity

| Field | Duplicate (`mx77ssc8…`) | Canonical Joshua (`mx76bxq…`) |
|-------|-------------------------|-------------------------------|
| **orgId** | `mx77ssc8sjpgwapfehx8yhz5kd86epd3` | `mx76bxqnc23q76cb99tvrffmy58644pf` |
| **name** | Direct Lending Connection | Direct Lending Connection |
| **createdAt** | 1778382868211 (~2026-04-09) | 1778020860456 (~2026-04-05) |
| **updatedAt** | 1778382868211 (never updated) | 1779567174445 (active branding) |
| **plan** | *(null)* | `enterprise` |
| **branding** | *(none)* | logo, colors, appName set |
| **slug** | *(null)* | *(null)* |
| **demoWorkspaceBundleId** | *(null)* | *(null)* |

### Owner & members

| | Duplicate | Canonical |
|--|-----------|-----------|
| **Owner** | `ts719yfy…` (Joshua SUPER_ADMIN) | `ts719yfy…` (Joshua SUPER_ADMIN) |
| **Members** | 1 | 2 |
| **Member rows** | Joshua only (owner) | Joshua (owner) + joshuaeballard (member/Sales) |

Joshua holds **redundant owner membership** on the duplicate — same `userKey` as canonical owner.

### Data counts

| Resource | Duplicate | Canonical |
|----------|----------:|----------:|
| Tasks | 0 | 56 |
| Pipeline files | 0 | 11 |
| Activity (org-scoped) | 0 | 251 |
| Contacts | 0 | 18 |
| Lenders | 0 | 737 |
| Saved views | 0 | 0 |
| Nav policy rows | 0 | 1 |
| Permissions overlays | 0 | 0 |
| Custom domains | 0 | 0 |

### Stages & substages

| | Duplicate | Canonical |
|--|-----------|-----------|
| **Parent stages** | 8 (default seed slugs) | 8 (same slug names) |
| **Substages** | **0** | **6** (incl. Phase 12 cert substages) |
| **Stage IDs** | Different Convex ids | Different Convex ids |

Duplicate stage slugs match canonical defaults (`confirm_interest` … `paid_paying`) but are **orphan seed copies** — no pipeline rows reference them. Canonical org has **6 custom substages** under Confirm Interest that do not exist on the duplicate.

### Roles

| | Duplicate | Canonical |
|--|-----------|-----------|
| System roles | 3 (admin, manager, user) | 7 (admin, manager, user, processor, sales, viewer, external_partner) |

Duplicate has only the minimum seeded trio; canonical has full product RBAC presets.

### Field-by-field org document diff

| Field | Match? |
|-------|--------|
| `name` | ✓ same string |
| `plan` | ✗ canonical only |
| `branding` | ✗ canonical only |
| `slug`, `demoWorkspaceBundleId`, `clerkOrganizationId`, Stripe fields | ✓ both null |

### Verdict: **Duplicate shell only**

- **Zero** tasks, pipeline files, contacts, lenders, activity, saved views.
- Only recoverable artifacts: default stage rows (duplicate of canonical slugs), 3 system roles, 1 redundant Joshua membership.
- **No unique production data** — anything meaningful lives on `mx76bxqnc23q76cb99tvrffmy58644pf`.
- Likely created accidentally when Joshua auth user was bootstrapped (duplicate `createdAt` matches Joshua user `1778382868211`).

---

## 2. E2E Primary org

### Identity

| Field | Value |
|-------|-------|
| **orgId** | `mx7bfa58ty1svx65bt3h8v6v5186kke9` |
| **name** | E2E Primary Organization |
| **slug** | `e2e-primary` |
| **createdAt** | 1778595028792 (~2026-04-11) |
| **updatedAt** | 1778595028792 (seed-time only) |
| **plan / branding** | none |

### Members (8 synthetic — no `authUsers` rows)

| userKey | role | assignedRole preset |
|---------|------|---------------------|
| `e2e_super_admin_v1` | owner | — |
| `e2e_org_owner_v1` | owner | — |
| `e2e_team_member_v1` | member | user |
| `e2e_loan_officer_v1` | member | manager |
| `e2e_processor_v1` | member | manager |
| `e2e_referral_partner_v1` | member | user |
| `e2e_lender_rep_v1` | member | user |
| `e2e_read_only_v1` | member | user |

All keys match `lib/testing/e2eUserCatalog.ts` / `convex/testingSeed.ts` — **synthetic E2E personas**, not native auth identities.

### Data counts

| Resource | Count |
|----------|------:|
| Tasks | 1 (`E2E — Follow up on scenario match`) |
| Pipeline files | 0 |
| Activity (org-scoped) | 0 |
| Contacts | 2 (seed borrowers) |
| Lenders | 1 (seed) |
| Saved views | 0 |
| Stages | 8 (default seed) |
| Substages | 0 |

### Real auth user linkage

**`e2eAuthUserLinkage: []`** — no production `authUsers` row has membership on this org.

All 5 current auth users:

| User | defaultOrganizationId | E2E member? |
|------|----------------------|-------------|
| joshua@directlendingconnection.com | Joshua canonical | No |
| joshuaeballard@gmail.com | Joshua canonical | No |
| spam users (×2) | deleted Class B orgs | No |
| new spam (post–Step 2) | new spam org | No |

GodMode / SUPER_ADMIN can **see** E2E org, but no real login account is scoped to it.

### Playwright / QA dependency

- Catalog: `E2E_ORG_PRIMARY_SLUG = "e2e-primary"`
- Tests gate on `E2E_ORG_PRIMARY_ID` env (`tests/regression/tenant-isolation.spec.ts`)
- Seeded by `convex/testingSeed.ts` for automated QA

### Safe to delete?

| Criterion | Assessment |
|-----------|------------|
| Production business data | **No** — only seed fixtures |
| Real user tenancy | **No** |
| Automated test dependency | **Yes** — prod Playwright/tenant-isolation may reference this org id |
| Recoverable unique data | **No** — 1 task + 2 contacts + 1 lender are disposable test rows |

### Verdict

- **Not safe to delete from production immediately** without repointing E2E env vars to a staging deployment.
- **Should move to staging-only** long term; until then, **keep isolated on prod** and hide from non-operator GodMode picker.
- Data is test-only; no merge into Joshua org warranted.

---

## 3. joshuaeballard@gmail.com

### Identity

| Field | Value |
|-------|-------|
| **userId** | `ts7d3keadq48gay3pa8k6gdwx9878p33` |
| **displayUsername** | `joshuaeballard@gmail.com` |
| **normalizedUsername** | `joshuaeballard@gmail.com` |
| **email** | *(null — not set on auth row)* |
| **globalRole** | standard (not SUPER_ADMIN) |
| **defaultOrganizationId** | `mx76bxqnc23q76cb99tvrffmy58644pf` (Joshua canonical) |
| **credentialVersion** | 1 |
| **createdAt** | 1779557803897 (~2026-05-22) |
| **updatedAt** | 1779557851447 |

### Sessions

| Metric | Value |
|--------|------:|
| Active sessions | 1 |
| Total sessions | 1 |
| Last login | 1779557851569 (success) |
| Last session activity | `lastSeenAt` 1779588917634 (recent) |
| IP hint | 70.39.30.21 |

### Memberships

| orgId | org name | role | assignedRole |
|-------|----------|------|--------------|
| `mx76bxqnc23q76cb99tvrffmy58644pf` | Direct Lending Connection | member | **Sales** (`sales` preset) |

No membership on duplicate DLC or E2E orgs.

### Owned / attributed data

| Resource | Count |
|----------|------:|
| Tasks owned/assigned | 0 |
| Pipeline files owned | 0 |
| Activity as actor | 0 |
| User preferences | 1 (default empty drawer prefs) |
| Navigation config | 0 |
| Onboarding | 0 |
| Workflows / templates | 0 |

All 11 pipeline files and 56 Joshua-org tasks are owned by `ts719yfy…` (Joshua primary).

### Org linkage

- Points at **Joshua canonical org only** (correct tenant).
- Invited as **Sales** team member — distinct from Joshua SUPER_ADMIN owner row.
- Account is **live** (active session, recent `lastSeenAt`) but **data-silent** (no created content).

### Classification options

| Option | Fit |
|--------|-----|
| **A — Keep as secondary operator** | Plausible if deliberate non-admin login for RBAC/UX testing |
| **B — Merge into Joshua canonical** | Strong fit: same operator family, zero owned data, redundant second login on same org |
| **C — Safe delete** | **Not recommended** — active session + intentional Sales membership |

### Verdict

**Recommend MERGE (B)** into `joshua@directlendingconnection.com` unless Joshua explicitly wants a standing Sales-role test account (**A**). **Do not delete (C)** while session is active and membership is intentional.

---

## Final recommendation matrix

| ENTITY | KEEP | MERGE | DELETE | REASON |
|--------|:----:|:-----:|:------:|--------|
| **Duplicate DLC org** `mx77ssc8…` | | ✓ | ✓ | Duplicate shell only — zero unique data; remove Joshua redundant membership then delete org + seed stages/roles |
| **E2E Primary org** `mx7bfa58…` | ✓* | | ✓† | Synthetic members only; no real auth linkage; test fixtures (1 task, 2 contacts, 1 lender). *Keep on prod until E2E env repointed to staging. †Delete from prod after staging migration |
| **joshuaeballard@gmail.com** `ts7d3ke…` | ○ | ✓ | | Zero owned data; member of Joshua org only; active but data-silent. Merge into primary Joshua identity unless deliberate Sales-role sandbox (○ = optional keep) |

**Legend:** ✓ = recommended action · ○ = acceptable alternative · † = deferred until staging cutover · * = temporary prod retention

---

## Recommended Step 4 sequence (planning only — not executed)

1. **Duplicate DLC:** Remove membership `ms787c0a956wegznmkr9z32afd86e0e5` → delete org shell (stages, roles, org row).
2. **joshuaeballard:** Revoke session → reassign/remove Sales membership → merge auth row into Joshua primary (or keep if ○ chosen).
3. **E2E Primary:** Point `E2E_ORG_PRIMARY_ID` at staging Convex → re-seed → delete prod E2E org + fixtures.
4. **Spam hardening:** Block/disable public signup vector; purge post–Step 2 spam (`ts74f4n6…`) in Class C follow-up.

---

## Appendix A — Post–Step 2 drift (informational)

Observed during this read-only pass (not Step 3 scope):

| Entity | Detail |
|--------|--------|
| New auth user | `ts74f4n6c006zc5nmtda79e7x987bnce` / `ned.aw.un33.7@gmail.com` |
| New org | `mx72n32w4anbyrqnpwehqyatv187bj17` (empty spam shell) |
| Created | 1779587832376 (after Step 2 cleanup) |

Indicates signup abuse continues — prioritize signup gate before further tenant merges.

---

## Certification

Phase 12.2 Step 3 Class C forensic review is **complete (read-only)**. No mutations, merges, deletes, or deploys were performed.

**Operator replay:**

```bash
cd lender-app
node scripts/run-phase12-forensic-review.mjs
```
