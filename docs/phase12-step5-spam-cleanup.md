# Phase 12.2 Step 5 — Spam Auth & Dangling Org Cleanup

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Operator mutation:** `operator/purgeSpamAuthStep5:purgeSpamAuthStep5`  
**Evidence:** `migration-reports/phase12-step5-result.json`

---

## Summary

Production-safe purge of all remaining spam auth users and empty spam org shells. Protected accounts **unchanged**. E2E Primary **preserved**. Joshua canonical tenant **zero drift**.

---

## Deletion criteria applied

Auth users targeted when **not** protected (`joshua@directlendingconnection.com`, `joshuaeballard@gmail.com`) **and** any of:

| Criterion | Description |
|-----------|-------------|
| No valid membership | No `organizationMembers` row on an existing org for user id/username |
| Dangling `defaultOrganizationId` | Points at deleted org (Class B shells from Step 2) |
| Spam heuristic | Random username, disposable email patterns, non-production test shape |

---

## Before / after counts

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| Auth users | 5 | **2** | −3 |
| Organizations | 3 | **2** | −1 |
| Organization members | 11 | **10** | −1 |
| Auth sessions | 25 | 25 | 0 |
| Saved filter presets | 0 | 0 | 0 |

---

## Deleted auth users

| userId | username | email | deletion reasons |
|--------|----------|-------|------------------|
| `ts7frvg0xec8nrt03sn73kge0x872pv7` | hvswzalyoxbkpcaoj | rif.uk.ahenil.18@gmail.com | no membership, dangling defaultOrg, spam |
| `ts77qy09vpyr3tndvb88h5zr6h87227s` | undzkstebjqhcylurqcmd | o.t.e.zer.adud.08@gmail.com | no membership, dangling defaultOrg, spam |
| `ts74f4n6c006zc5nmtda79e7x987bnce` | cejgdbgxbxbpfejkxhfmkyi | ned.aw.un33.7@gmail.com | spam heuristic |

**Protected (kept):**

| userId | username |
|--------|----------|
| `ts719yfyv2b6020avvctpw0ns586exm6` | joshua@directlendingconnection.com |
| `ts7d3keadq48gay3pa8k6gdwx9878p33` | joshuaeballard@gmail.com |

---

## Deleted org ids

| orgId | name | reason |
|-------|------|--------|
| `mx72n32w4anbyrqnpwehqyatv187bj17` | hsNKMAsUKFiNghRVJluAVOVG | Empty spam shell after auth user purge |

**Preserved:**

| orgId | name |
|-------|------|
| `mx76bxqnc23q76cb99tvrffmy58644pf` | Direct Lending Connection (canonical) |
| `mx7bfa58ty1svx65bt3h8v6v5186kke9` | E2E Primary Organization |

---

## Deleted rows by table

| Table | Deleted |
|-------|--------:|
| `authUsers` | 3 |
| `organizationMembers` | 1 |
| `organizations` | 1 |
| **Total** | **5** |

Satellite rows (sessions, tokens, preferences, notifications) for spam users: **0** present at deletion time.

---

## Integrity verification

### Inline post-purge scan (`purgeSpamAuthStep5`)

| Table | dangling / orphan count |
|-------|------------------------:|
| `authUsers` | 0 |
| `organizationMembers` | 0 |
| `organizations` | — |
| `authSessions` | 0 |
| `pipeline` | 0 |
| `tasks` | 0 |
| `savedFilterPresets` | 0 |
| `activityFeed` (org scope) | 0 |

**Result: `integrityVerification.pass: true`**

### Full `dataMigration:integrityAudit` (post-purge)

| Check | Count |
|-------|------:|
| `danglingOrganizationIds` | 0 |
| `orphanedOrganizationMembers` | 0 |
| `orphanedAuthSessions` | 0 |
| `invalidForeignKeys` | 0 |
| `authUsersWithoutMembership` | 0 |
| `duplicateMembershipGroups` | 0 |
| `staleAuthSessions` | 0 |

---

## Joshua canonical zero-drift proof

| Metric | Before | After | Unchanged |
|--------|-------:|------:|:---------:|
| Pipeline files | 11 | 11 | ✓ |
| Tasks | 56 | 56 | ✓ |
| Members | 2 | 2 | ✓ |
| Activity (org-scoped) | 251 | 251 | ✓ |

**`joshuaOrgVerification.unchanged: true`**

Joshua integrity audit: `found: true`, `SUPER_ADMIN`, canonical org membership intact.

---

## Final production tenant state

### Organizations (2)

1. **Direct Lending Connection** — `mx76bxqnc23q76cb99tvrffmy58644pf`
2. **E2E Primary Organization** — `mx7bfa58ty1svx65bt3h8v6v5186kke9`

### Auth users (2)

1. `joshua@directlendingconnection.com` → Joshua canonical org
2. `joshuaeballard@gmail.com` → Joshua canonical org (Sales member, kept per Step 4)

### Members (10)

- Joshua canonical: 2 (Joshua owner + eballard member)
- E2E Primary: 8 synthetic `e2e_*` personas

---

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** → `basic-anaconda-984` |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** — https://dlcfunds.vercel.app |

---

## Operator commands

```bash
cd lender-app

node scripts/run-phase12-step5-spam-cleanup.mjs --dry-run
node scripts/run-phase12-step5-spam-cleanup.mjs

npx convex run dataMigration:integrityAudit \
  '{"adminSecret":"$DATA_MIGRATION_ADMIN_SECRET"}'
```

---

## Certification

Phase 12.2 Step 5 spam cleanup is **complete**.

- **3 spam auth users** hard-deleted with dangling org references cleared
- **1 empty spam org** removed
- **Zero dangling FKs** across auth, members, orgs, tasks, pipeline, saved views, activity, sessions
- **Joshua canonical org** unchanged — zero tenant drift
- **E2E Primary** untouched
- Build, Convex deploy, and auth validation **green**

**Awaiting next instruction.**
