# Phase 12.2 Step 4 — Class C Resolution

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Operator choice:** **KEEP** `joshuaeballard@gmail.com`  
**Evidence:** `migration-reports/phase12-step4-result.json`

---

## Operator decision

| Question | Answer |
|----------|--------|
| What should happen to `joshuaeballard@gmail.com`? | **KEEP** |

---

## Actions executed

### 1. Duplicate DLC shell deleted ✓

**Org removed:** `mx77ssc8sjpgwapfehx8yhz5kd86epd3`

**Pre-delete verification (empty shell):**

| Resource | Count |
|----------|------:|
| Tasks | 0 |
| Pipeline files | 0 |
| Activity (org-scoped) | 0 |
| Saved views | 0 |
| Nav policy | 0 |
| Contacts / lenders | 0 |

**Redundant membership removed:** Joshua (`ts719yfy…`) owner row on duplicate org only — **canonical Joshua membership on `mx76bxq…` preserved.**

**Hard-deleted rows:**

| Table | Deleted |
|-------|--------:|
| `organizationMembers` | 1 |
| `organizationPipelineStages` | 8 |
| `organizationRoles` | 3 |
| `organizations` | 1 |
| **Total** | **13** |

### 2. E2E Primary org preserved ✓

**Untouched:** `mx7bfa58ty1svx65bt3h8v6v5186kke9` — 8 synthetic members, seed fixtures, no membership edits.

### 3. joshuaeballard@gmail.com — KEEP ✓

| Check | Result |
|-------|--------|
| Auth row exists | `ts7d3keadq48gay3pa8k6gdwx9878p33` |
| Case normalized | ✓ `normalizedUsername` = `joshuaeballard@gmail.com` |
| Membership valid | ✓ member on Joshua canonical org (`mx76bxq…`), Sales role |
| `defaultOrganizationId` | Joshua canonical |
| Mutations applied | **None** |

---

## Before / after counts

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| Organizations | 4 | 3 | −1 |
| Auth users | 5 | 5 | 0 |
| Organization members | 12 | 11 | −1 |

---

## Joshua canonical integrity

| Metric | Before | After | Unchanged |
|--------|-------:|------:|:---------:|
| Pipeline files | 11 | 11 | ✓ |
| Tasks | 56 | 56 | ✓ |
| Members | 2 | 2 | ✓ |
| Activity (org-scoped) | 251 | 251 | ✓ |

**`joshuaOrgVerification.unchanged: true`**

---

## Post-action validation

| Check | Result |
|-------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** |
| `npm run auth:validate` (Joshua canonical) | **ALL_CHECKS_PASSED** — https://dlcfunds.vercel.app |

Auth validation confirms login, session persistence, org resolution, permissions, tasks access, and logout/relogin for `joshua@directlendingconnection.com`.

---

## Final remaining organizations

| orgId | name | class |
|-------|------|-------|
| `mx76bxqnc23q76cb99tvrffmy58644pf` | Direct Lending Connection | **A** (canonical) |
| `mx7bfa58ty1svx65bt3h8v6v5186kke9` | E2E Primary Organization | **C** (QA — preserved) |
| `mx72n32w4anbyrqnpwehqyatv187bj17` | hsNKMAsUKFiNghRVJluAVOVG | spam (post–Step 2 drift) |

---

## Final remaining auth users

| userId | username | defaultOrg | notes |
|--------|----------|------------|-------|
| `ts719yfy…` | joshua@directlendingconnection.com | Joshua canonical | SUPER_ADMIN |
| `ts7d3ke…` | joshuaeballard@gmail.com | Joshua canonical | **KEPT** — Sales member |
| `ts7frvg0…` | hvswzalyoxbkpcaoj | *(deleted Class B org)* | spam — dangling FK |
| `ts77qy09…` | undzkstebjqhcylurqcmd | *(deleted Class B org)* | spam — dangling FK |
| `ts74f4n6…` | cejgdbgxbxbpfejkxhfmkyi | spam org | post–Step 2 signup |

---

## Tenant drift confirmation

| Scope | Drift |
|-------|-------|
| **Joshua canonical org** (`mx76bxq…`) | **Zero** — pipeline, tasks, members, activity unchanged |
| **E2E Primary** | **Zero** — untouched |
| **joshuaeballard account** | **Zero** — kept as-is |
| **Global spam / dangling FKs** | **Present** — 3 spam auth users reference deleted or spam orgs; out of Step 4 scope |

---

## Operator commands

```bash
cd lender-app

# Dry-run
node scripts/run-phase12-step4-resolution.mjs --dry-run

# Execute (KEEP — completed)
node scripts/run-phase12-step4-resolution.mjs

# MERGE variant (not run)
node scripts/run-phase12-step4-resolution.mjs --merge
```

---

## Certification

Phase 12.2 Step 4 Class C resolution is **complete**.

- Duplicate DLC shell **deleted** with redundant Joshua membership removed safely.
- E2E Primary **preserved** untouched.
- `joshuaeballard@gmail.com` **kept** with valid membership and normalized casing.
- Joshua canonical tenant integrity **verified** — zero data drift.
- Convex deployed; build and auth validation **green**.

**Recommended follow-up (Step 5+):** purge spam auth users/orgs, disable public signup abuse vector, migrate E2E Primary to staging.
