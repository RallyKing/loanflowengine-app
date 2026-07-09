# Phase 12.2 Step 1 — Tenant / User Audit (READ ONLY)

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Canonical Joshua org:** `mx76bxqnc23q76cb99tvrffmy58644pf` (Direct Lending Connection)

This audit is **read-only**. No mutations, migrations, repairs, deletes, or deploys were performed.

**Operator query (repo):** `convex/operator/auditTenantIsolation.ts` → `operator/auditTenantIsolation:auditTenantIsolation`  
**Evidence artifact:** `lender-app/migration-reports/tenant-audit-raw.json`  
**Supporting:** `dataMigration:integrityAudit` via `node scripts/run-integrity-audit.ts`

---

## 1. Raw counts

| Entity | Count |
|--------|------:|
| Auth users | 4 |
| Auth sessions (total) | 506 |
| Auth sessions (active) | 23 |
| Auth sessions (stale / expired) | 477 |
| Organizations | 6 |
| Organization members | 14 |
| Pipeline files | 11 |
| Tasks | 57 |
| Activity feed rows | 318 |
| Pipeline file activity rows | 232 |
| Contacts | 20 |
| Lenders | 738 |

**Joshua production org (`mx76bxqnc23q76cb99tvrffmy58644pf`):**

| Metric | Count |
|--------|------:|
| Members | 2 |
| Pipeline files | 11 |
| Tasks | 56 |
| Activity feed (org-scoped) | 0 |

All 11 pipeline files and 56 of 57 tasks are scoped to the Joshua org. One task belongs to E2E Primary.

---

## 2. Auth users

| userId | username | normalizedUsername | email | globalRole | defaultOrganizationId | credentialVersion | activeSessions | Class |
|--------|----------|-------------------|-------|------------|----------------------|------------------:|---------------:|-------|
| `ts719yfyv2b6020avvctpw0ns586exm6` | joshua@directlendingconnection.com | joshua@directlendingconnection.com | joshua@directlendingconnection.com | SUPER_ADMIN | `mx76bxqnc23q76cb99tvrffmy58644pf` | 5 | 22 | **A** |
| `ts7frvg0xec8nrt03sn73kge0x872pv7` | hvswzalyoxbkpcaoj | hvswzalyoxbkpcaoj | rif.uk.ahenil.18@gmail.com | standard | `mx71kt2er69es02ra1fjxdnz4s87353k` | 1 | 0 | **C** |
| `ts77qy09vpyr3tndvb88h5zr6h87227s` | undzkstebjqhcylurqcmd | undzkstebjqhcylurqcmd | o.t.e.zer.adud.08@gmail.com | standard | `mx75p8a8rjm9kargv7a7rr2kmx873fee` | 1 | 0 | **C** |
| `ts7d3keadq48gay3pa8k6gdwx9878p33` | joshuaeballard@gmail.com | joshuaeballard@gmail.com | *(null)* | standard | `mx76bxqnc23q76cb99tvrffmy58644pf` | 1 | 1 | **C** |

**Joshua account notes:**

- `SUPER_ADMIN` + `isGlobalAdmin` — GodMode tenant switcher explains 6 orgs visible in UI.
- Second membership on duplicate empty org `mx77ssc8sjpgwapfehx8yhz5kd86epd3` (same name, zero data).
- All 4 auth users have ≥1 org membership (integrity audit: `authUsersWithoutMembershipCount: 0`).

---

## 3. Duplicate / case collision check (NFKC lowercase)

| Check | Result |
|-------|--------|
| Username NFKC collisions | **0** |
| Email NFKC collisions | **0** |

No two `authUsers` rows normalize to the same username or email key.

**Near-duplicate org names (not NFKC collision):**

- `mx76bxqnc23q76cb99tvrffmy58644pf` — Direct Lending Connection (canonical, **A**)
- `mx77ssc8sjpgwapfehx8yhz5kd86epd3` — Direct Lending Connection (empty duplicate, **C**)

---

## 4. Organizations

| orgId | name | owner userKey(s) | members | tasks | pipeline | activity | createdAt | Class |
|-------|------|------------------|--------:|------:|---------:|---------:|-----------|-------|
| `mx76bxqnc23q76cb99tvrffmy58644pf` | Direct Lending Connection | `ts719yfy…` | 2 | 56 | 11 | 0 | 2026-03 | **A** |
| `mx77ssc8sjpgwapfehx8yhz5kd86epd3` | Direct Lending Connection | `ts719yfy…` | 1 | 0 | 0 | 0 | 2026-04 | **C** |
| `mx7bfa58ty1svx65bt3h8v6v5186kke9` | E2E Primary Organization | `e2e_super_admin_v1`, `e2e_org_owner_v1` | 8 | 1 | 0 | 0 | 2026-04 | **C** |
| `mx702ra7pxsdy65s0qsnrzq8ws86km7w` | E2E Secondary Organization | — | 1 | 0 | 0 | 0 | 2026-04 | **B** |
| `mx71kt2er69es02ra1fjxdnz4s87353k` | dMsrKFrsMsUrbJIxbxCtyJ | `ts7frvg0…` | 1 | 0 | 0 | 0 | 2026-05 | **B** |
| `mx75p8a8rjm9kargv7a7rr2kmx873fee` | kPoduUdlvrxByRaiQCLyjPb | `ts77qy09…` | 1 | 0 | 0 | 0 | 2026-05 | **B** |

---

## 5. Cross-tenant leak check

### Data plane (tasks / pipeline / activity)

| Check | Result |
|-------|--------|
| Pipeline rows with dangling `organizationId` | **0** |
| Pipeline rows missing `organizationId` | **0** |
| Tasks with dangling `organizationId` | **0** |
| Tasks missing `organizationId` | **0** |
| Activity feed rows with dangling `organizationId` | **0** |
| Legacy Clerk / vendor user keys on pipeline | **0** |
| Legacy vendor org scope hits | **0** |
| Invalid FK sample (integrity audit) | **0** |

**No production file or task is assigned to a foreign org or missing org scope.**

### Identity plane (memberships)

| Finding | Count | Severity |
|---------|------:|----------|
| E2E synthetic `userKey` members (`e2e_*`) not backed by `authUsers` | 8 | Expected test fixtures — isolate from prod UX |
| Non-E2E members without `authUsers` row | **0** | — |
| Orphan auth sessions | **0** | — |
| Duplicate membership groups | **0** | — |

E2E members (not cross-tenant data leaks; synthetic keys in E2E Primary org):

```
e2e_super_admin_v1, e2e_org_owner_v1, e2e_team_member_v1, e2e_loan_officer_v1,
e2e_processor_v1, e2e_referral_partner_v1, e2e_lender_rep_v1, e2e_read_only_v1,
e2e_demo_sandbox_v1
```

### Activity feed tenant scoping gap

All **318** `activityFeed` rows report **zero** `organizationId` at the org rollup level — activity appears **global/unscoped** in storage rather than cross-assigned to wrong tenants. This is a **scoping debt** item for Phase 12.2 (not an active cross-org read leak in query paths that filter by `organizationId` on pipeline/tasks).

---

## 6. Orphan check

| Orphan type | Count |
|-------------|------:|
| Pipeline without org | 0 |
| Tasks without org | 0 |
| Members with missing org | 0 |
| Sessions with missing user | 0 |
| Auth users without membership | 0 |
| Pipeline file activity without pipeline file | 0 |

**Integrity audit:** `danglingOrganizationIds: 0`, `invalidForeignKeys: 0`, `orphanedOrganizationMembers: 0`

---

## 7. Classification summary

| Class | Meaning | Orgs | Users |
|-------|---------|-----:|------:|
| **A** | Consolidate into / keep as Joshua canonical tenant | 1 | 1 |
| **B** | Safe delete after backup (empty spam / empty E2E secondary) | 3 | 0 |
| **C** | Manual review required | 2 | 3 |

### A — Joshua org (keep)

- Org: `mx76bxqnc23q76cb99tvrffmy58644pf`
- User: `ts719yfyv2b6020avvctpw0ns586exm6`

### B — Safe delete candidates (empty)

| orgId | name | Rationale |
|-------|------|-----------|
| `mx702ra7pxsdy65s0qsnrzq8ws86km7w` | E2E Secondary Organization | 0 tasks, 0 files, 1 member |
| `mx71kt2er69es02ra1fjxdnz4s87353k` | dMsrKFrsMsUrbJIxbxCtyJ | Spam signup shell, 0 data |
| `mx75p8a8rjm9kargv7a7rr2kmx873fee` | kPoduUdlvrxByRaiQCLyjPb | Spam signup shell, 0 data |

Associated spam auth users (`ts7frvg0…`, `ts77qy09…`) → delete **after** org removal review.

### C — Manual review

| Entity | Rationale |
|--------|-----------|
| `mx77ssc8sjpgwapfehx8yhz5kd86epd3` | Duplicate DLC org name; merge membership into canonical then delete |
| `mx7bfa58ty1svx65bt3h8v6v5186kke9` | E2E Primary — 8 synthetic members + 1 task; keep isolated for QA or migrate off prod |
| `ts7d3keadq48gay3pa8k6gdwx9878p33` | Extra user on Joshua org; no email — merge or revoke |
| Spam users | Review abuse; disable signup vector if unintended |

---

## 8. Recommended migration plan (Phase 12.2 Step 2+ — **not executed**)

Ordered, dry-run first, Joshua org as sole production tenant:

### Step 2 — Session hygiene (low risk)

1. Dry-run count stale sessions (`477` expired).
2. Purge expired `authSessions` only (no active session impact on Joshua: 22 active).

### Step 3 — Duplicate org consolidation

1. Dry-run: move Joshua membership off `mx77ssc8sjpgwapfehx8yhz5kd86epd3` → retain only `mx76bxqnc23q76cb99tvrffmy58644pf`.
2. Delete empty duplicate org `mx77ssc8sjpgwapfehx8yhz5kd86epd3`.

### Step 4 — Remove spam tenants (class B)

1. Revoke + delete auth users `ts7frvg0…`, `ts77qy09…`.
2. Delete orgs `mx71kt2er69es02ra1fjxdnz4s87353k`, `mx75p8a8rjm9kargv7a7rr2kmx873fee`.
3. Delete empty `mx702ra7pxsdy65s0qsnrzq8ws86km7w` (E2E Secondary).

### Step 5 — E2E Primary isolation (class C)

1. Decision: **keep on prod for Playwright** vs **move to dedicated staging deployment**.
2. If keeping: hide from GodMode picker for non-operator roles; ensure E2E keys never resolve real org data.
3. If removing: migrate/delete 1 task, remove 8 `e2e_*` memberships, delete org.

### Step 6 — Extra Joshua user (class C)

1. Review `joshuaeballard@gmail.com` (`ts7d3keadq48gay3pa8k6gdwx9878p33`) — merge into primary Joshua auth row or deactivate.

### Step 7 — Activity feed tenant scoping (engineering)

1. Backfill `activityFeed.organizationId` from linked pipeline/task where missing.
2. Enforce org filter on all activity queries (align with `tenant-isolation-policy.md`).

### Step 8 — GodMode / tenant picker UX

1. Default production session to `mx76bxqnc23q76cb99tvrffmy58644pf` only.
2. Show E2E / spam orgs only when `SUPER_ADMIN` + explicit operator mode.

---

## 9. Operator commands (read-only)

```bash
# Integrity scan (deployed)
cd lender-app
node scripts/run-integrity-audit.ts

# Inline read-only dumps (no deploy)
npx convex run --prod --inline-query "return await ctx.db.query('authUsers').collect()"
# … repeat for organizations, organizationMembers, pipeline, tasks, activityFeed, authSessions

# Compile report from dumps
node scripts/compile-tenant-audit-report.mjs

# After next Convex deploy — canonical operator query
npx convex run operator/auditTenantIsolation:auditTenantIsolation \
  '{"adminSecret":"$DATA_MIGRATION_ADMIN_SECRET"}'
```

---

## 10. Certification statement

Phase 12.2 Step 1 tenant audit is **complete (read-only)**.

- Production multi-tenant state captured on `basic-anaconda-984`.
- **No cross-tenant pipeline/task assignment leaks** detected.
- **No NFKC username/email collisions** among auth users.
- **Canonical Joshua org holds all 11 production pipeline files.**
- Follow-on work: duplicate org merge, spam tenant removal, E2E isolation, activity feed org scoping — **planned only, not executed**.
