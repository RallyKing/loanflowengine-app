# Phase 12.2 Step 2 — Safe Tenant Cleanup

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Operator mutation:** `operator/cleanupClassBTenants:cleanupClassBTenants`  
**Evidence:** `migration-reports/phase12-cleanup-step2-result.json`

Scope: **Class B items only** per `docs/phase12-tenant-audit.md`, plus global stale session purge.

---

## Actions performed

| # | Action | Status |
|---|--------|--------|
| 1 | Purge stale / revoked `authSessions` | **Done** — 483 rows deleted |
| 2 | Delete Class B empty organizations | **Done** — 3 orgs deleted |
| 3 | Delete Class B auth users | **Skipped** — audit classified **0** auth users as Class B |
| 4 | Delete related memberships / settings / sessions | **Done** for org shells (members, roles, stages) |

### Explicitly not touched (forbidden)

- Joshua canonical org `mx76bxqnc23q76cb99tvrffmy58644pf`
- `joshua@directlendingconnection.com`
- `joshuaeballard@gmail.com`
- Duplicate DLC org `mx77ssc8sjpgwapfehx8yhz5kd86epd3` (Class C)
- E2E Primary org `mx7bfa58ty1svx65bt3h8v6v5186kke9` (Class C)
- Class C spam auth users (`ts7frvg0…`, `ts77qy09…`)
- `activityFeed` (318 rows unchanged)
- Permissions model

---

## Before / after counts

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| Auth users | 4 | 4 | 0 |
| Auth sessions (total) | 506 | 23 | −483 |
| Auth sessions (active) | 23 | 23 | 0 |
| Auth sessions (stale) | 477 | 0 | −477 |
| Organizations | 6 | 3 | −3 |
| Organization members | 14 | 11 | −3 |
| Activity feed (global) | 318 | 318 | 0 |

### Joshua org verification (`mx76bxqnc23q76cb99tvrffmy58644pf`)

| Metric | Before | After | Unchanged |
|--------|-------:|------:|:---------:|
| Pipeline files | 11 | 11 | ✓ |
| Tasks | 56 | 56 | ✓ |
| Members | 2 | 2 | ✓ |
| Activity (org-scoped) | 251 | 251 | ✓ |

**`joshuaOrgVerification.unchanged: true`** — mutation aborts if these drift in live mode.

---

## Deleted rows by table

| Table | Deleted |
|-------|--------:|
| `authSessions` | 483 |
| `organizationMembers` | 3 |
| `organizationPipelineStages` | 24 |
| `organizationRoles` | 3 |
| `organizations` | 3 |
| **Total** | **516** |

### Deleted organizations (Class B)

| orgId | Name (from audit) |
|-------|-------------------|
| `mx702ra7pxsdy65s0qsnrzq8ws86km7w` | E2E Secondary Organization |
| `mx71kt2er69es02ra1fjxdnz4s87353k` | dMsrKFrsMsUrbJIxbxCtyJ (spam shell) |
| `mx75p8a8rjm9kargv7a7rr2kmx873fee` | kPoduUdlvrxByRaiQCLyjPb (spam shell) |

Each org was verified empty (0 pipeline, 0 tasks, 0 lenders, 0 contacts) before deletion.

### Session purge detail

483 sessions removed = 477 expired + 6 revoked-but-retained rows. All **23 active** sessions preserved (Joshua: 22, joshuaeballard: 1).

### Auth users

**0** deleted. Spam users remain Class C for Step 3+ review. They now have **dangling `defaultOrganizationId`** pointing at deleted spam orgs — expected; fix in a later Class C step.

---

## Remaining tenant state

| orgId | Name | Class | Notes |
|-------|------|-------|-------|
| `mx76bxqnc23q76cb99tvrffmy58644pf` | Direct Lending Connection | **A** | Canonical production tenant |
| `mx77ssc8sjpgwapfehx8yhz5kd86epd3` | Direct Lending Connection | **C** | Empty duplicate — merge in Step 3 |
| `mx7bfa58ty1svx65bt3h8v6v5186kke9` | E2E Primary Organization | **C** | QA fixtures + 1 task |

Auth users unchanged: 4 (Joshua, joshuaeballard, 2 spam Class C).

---

## Validation

| Check | Result |
|-------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** → `basic-anaconda-984` |
| Dry-run (`dryRun: true`) | **PASS** — counts matched plan |
| Live execute (`dryRun: false`) | **PASS** |
| Joshua org invariant | **PASS** |

Vercel app deploy skipped — no user-facing route/UI changes in this step; Convex production functions updated in place.

---

## Operator commands

```bash
cd lender-app

# Dry-run
node scripts/run-phase12-cleanup-step2.mjs --dry-run

# Execute (already run for Step 2)
node scripts/run-phase12-cleanup-step2.mjs

# Re-audit
npx convex run operator/auditTenantIsolation:auditTenantIsolation \
  '{"adminSecret":"$DATA_MIGRATION_ADMIN_SECRET"}'
```

---

## Next steps (Step 3+, not executed)

1. Merge duplicate DLC org membership (`mx77ssc8…` → Joshua canonical)
2. Class C spam user removal + `defaultOrganizationId` repair
3. E2E Primary isolation decision
4. `activityFeed` tenant scoping backfill (engineering)

---

## Certification

Phase 12.2 Step 2 safe tenant cleanup is **complete**. Production state reduced from 6 → 3 organizations; session table cleaned; Joshua org data counts **unchanged**.
