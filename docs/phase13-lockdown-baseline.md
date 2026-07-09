# Phase 13 — Infrastructure Lockdown Baseline

**Date:** 2026-05-21  
**Status:** FROZEN — change only on regression evidence  
**Scope:** Auth, ownership, ACL, impersonation, display normalization, visibility enforcement, write-budget protections

---

## Production deployment URLs

| Surface | URL |
|---------|-----|
| **Production app (alias)** | https://dlcfunds.vercel.app |
| **Convex production** | https://basic-anaconda-984.convex.cloud |
| **Joshua org** | `mx76bxqnc23q76cb99tvrffmy58644pf` |
| **Joshua user** | `ts719yfyv2b6020avvctpw0ns586exm6` |
| **Eballard user** | `ts7d3keadq48gay3pa8k6gdwx9878p33` |

---

## Frozen systems (regression-only changes)

These layers are **locked** for Phase 13 product work. Modify only when a regression is proven (operator proof script, prod smoke, or failing governance gate).

| System | Canonical owner modules |
|--------|-------------------------|
| **Auth canonicalization** | `lender-app/lib/auth/normalizeUsername.ts`, `lender-app/convex/auth/canonicalIdentity.ts`, `lender-app/convex/auth/loginBridge.ts`, `lender-app/convex/auth/usersInternal.ts`, `lender-app/app/api/auth/login/route.ts`, `lender-app/convex/shareTargetResolve.ts` |
| **ownerUserId ownership model** | `lender-app/convex/resourceAccess.ts` (`resolveRowOwnerUserId`, `ownerFieldsForInsert`), `lender-app/convex/schema.ts` (`ownerUserId` / bridge `ownerUserKey`), `lender-app/convex/operator/ownerAclStep8B.ts` |
| **resourceShares ACL engine** | `lender-app/convex/resourceAccess.ts`, `lender-app/convex/taskShares.ts`, `lender-app/convex/pipelineFileShares.ts`, `lender-app/convex/organizationAccess.ts` (delegates to resourceAccess) |
| **Superuser impersonation** | `lender-app/convex/auth/superuserAllowlist.ts`, `lender-app/convex/superuserImpersonation/*`, `lender-app/app/api/auth/impersonation/*`, `lender-app/components/SuperuserImpersonationBanner.tsx`, `lender-app/components/SuperuserImpersonationPanel.tsx` |
| **Tenant display normalization** | `lender-app/lib/auth/canonicalDisplayUsername.ts`, `lender-app/convex/auth/displayIdentity.ts`, `lender-app/convex/displayIdentity.ts`, `lender-app/lib/useOrgMemberDisplayLabel.ts`, `lender-app/convex/operator/displayNormalizationStep8C.ts` |
| **Pipeline/task visibility enforcement** | `lender-app/convex/resourceAccess.ts` (`filterTaskRowsForMember`, `filterPipelineRowsForMember`, `resolve*AccessLevel`), `lender-app/convex/tasks.ts` (query filters), `lender-app/convex/pipeline.ts` (query filters), `lender-app/convex/globalSearch.ts` |
| **Convex write-budget protections** | `lender-app/lib/convexCostBudget.ts`, `lender-app/lib/convexWriteStormGovernance.ts`, `lender-app/lib/convexCostGovernance.ts`, `lender-app/tests/e2e/pipeline-idle-write-budget.spec.ts`, `docs/pipeline-file-write-forensics.md` |

---

## Auth credentials validation proof

**Validated:** 2026-05-21 (`npm run auth:validate` against https://dlcfunds.vercel.app)

| Account | Login | Result |
|---------|-------|--------|
| Joshua (prod) | `joshua@directlendingconnection.com` / `simple@123` | **ALL_CHECKS_PASSED** |
| Eballard (prod, prior session) | `joshuaeballard@gmail.com` / `Phase12Step8A!Reinvite2026` | **ALL_CHECKS_PASSED** |

Checks passed: login HTTP 200, session persistence, refresh persistence, org scope in localStorage, logout, relogin, settings/Organization nav, `/tasks` access.

**Note:** `.env.local` credentials (`Joshua@DirectLendingConnection.com` / `DirectLending@123`) return **401** on production — prod canonical login is lowercase email + `simple@123`.

---

## Ownership counts (Joshua org)

Source: `docs/phase12-step8B-owner-acl.md`, `migration-reports/phase12-step8B-owner-acl.json`

| Metric | Count |
|--------|------:|
| Joshua org tasks | **56** |
| Joshua org pipeline files | **11** |
| Tasks owned by Joshua (`ownerUserId`) | **56** |
| Files owned by Joshua (`ownerUserId`) | **11** |
| Null task owners | **0** |
| Null file owners | **0** |
| Task owner drift | **0** |
| File owner drift | **0** |

---

## ACL proof matrix (live production)

Source: `operator/ownerAclStep8B:runLiveAclProof`

| Viewer | Tasks visible | Files visible |
|--------|-------------:|--------------:|
| **Joshua** (default) | 56 | 11 |
| **Eballard** (default) | 0 | 0 |
| **Eballard** (after share) | 1 (view) | 1 (edit) |
| **Eballard** (after revoke) | 0 | 0 |

Access enforcement:

| Check | Result |
|-------|--------|
| Eballard task edit denied when shared view-only | PASS |
| Eballard file edit allowed when shared edit | PASS |
| Joshua zero drift post-proof | PASS |
| `runLiveAclProof` overall | **`pass: true`** |

---

## Share/revoke proof

Source: `docs/phase12-step8B1-share-forensics.md`, `migration-reports/phase12-step8B1-share-forensics.json`

| Path | Mechanism | Result |
|------|-----------|--------|
| Task share by email | `taskShares.upsert` → `resourceShares` | PASS |
| Pipeline share by email | `pipelineFileShares.upsertShare` → `resourceShares` dual-write | PASS |
| Email variant resolution | `joshuaeballard@gmail.com` / mixed case → `ts7d3keadq48gay3pa8k6gdwx9878p33` | PASS |
| Revoke task share | Eballard tasks 1 → 0 | PASS |
| Revoke file share | Eballard files 1 → 0 | PASS |
| Joshua counts unchanged | 56 tasks / 11 files | PASS |

Proof task: `k1756kdab4397w64ty4m64xn8h85gb9z`  
Proof file: `jx73q1xrywyg8mfmag0hmd95g185qm11`

---

## Idle write budget proof

Source: `docs/pipeline-file-write-forensics.md`, `docs/phase12-custom-stage-certification.md`, `lender-app/lib/convexCostBudget.ts`

| Budget constant | Value |
|-----------------|------:|
| `FILE_IDLE_MAX_WRITES_PER_MIN` | 2 |
| `PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES` (5 min soak) | 2 |
| `PRESENCE_MAX_WRITES_PER_MIN` | 1 |

| Scenario | Post-fix result |
|----------|-----------------|
| Open pipeline file (no edits) | 0–1 writes (presence registration) |
| 5-minute idle soak (prod cert) | **1 write** (presence heartbeat only) |
| `patchFileDrawerLayout` idle | **0** |
| `patchDeal` idle hydration loop | **0** |

Regression gate: `npx playwright test tests/e2e/pipeline-idle-write-budget.spec.ts --project=chromium`

Operator probe: `window.__dlcWriteStormReset()` → idle 300s → `window.__dlcWriteStormReport()` → `totalWrites <= 2`.

---

## Display normalization completion

Source: `docs/phase12-step8C-display-normalization.md`, `migration-reports/phase12-step8C-display-normalization.json`

| Check | Result |
|-------|--------|
| Joshua label | `joshua@directlendingconnection.com` |
| Eballard label | `joshuaeballard@gmail.com` |
| Email variant normalization | PASS |
| No org ids / org names in member labels | PASS |
| Backend: `listMembers`, `listTeamDirectory`, share lists, activity feeds | Enriched with `canonicalDisplayUsername` / `actorDisplayUsername` |
| UI: tasks, pipeline, activity, settings/team | Updated |
| Operator proof `displayNormalizationStep8C` | **`pass: true`** |

Intentionally unchanged (operator/debug): `GlobalTenantSwitcher`, `app/system/debug/*`, org rename admin field, client portal `workspaceName`, impersonation banner org name.

---

## Locked files/modules list

### Auth canonicalization
- `lender-app/lib/auth/normalizeUsername.ts`
- `lender-app/convex/auth/canonicalIdentity.ts`
- `lender-app/convex/auth/loginBridge.ts`
- `lender-app/convex/auth/usersInternal.ts`
- `lender-app/convex/auth/primaryPlatformAdmin.ts`
- `lender-app/convex/auth/superuserAllowlist.ts`
- `lender-app/app/api/auth/login/route.ts`
- `lender-app/convex/shareTargetResolve.ts`

### Ownership + ACL
- `lender-app/convex/resourceAccess.ts`
- `lender-app/convex/organizationAccess.ts`
- `lender-app/convex/taskShares.ts`
- `lender-app/convex/pipelineFileShares.ts`
- `lender-app/convex/schema.ts` (tables: `resourceShares`, `resourceAccessDenials`, `ownerUserId` fields)

### Impersonation
- `lender-app/convex/superuserImpersonation/lifecycle.ts`
- `lender-app/convex/superuserImpersonation/runtime.ts`
- `lender-app/app/api/auth/impersonation/start/route.ts`
- `lender-app/app/api/auth/impersonation/stop/route.ts`
- `lender-app/app/api/auth/impersonation/status/route.ts`
- `lender-app/lib/session/loadViewer.ts` (impersonation merge)

### Display normalization
- `lender-app/lib/auth/canonicalDisplayUsername.ts`
- `lender-app/convex/auth/displayIdentity.ts`
- `lender-app/convex/displayIdentity.ts`
- `lender-app/lib/useOrgMemberDisplayLabel.ts`

### Visibility enforcement (query/mutation gates)
- `lender-app/convex/tasks.ts` (filter/assert paths)
- `lender-app/convex/pipeline.ts` (filter/assert paths)
- `lender-app/convex/globalSearch.ts`

### Write-budget
- `lender-app/lib/convexCostBudget.ts`
- `lender-app/lib/convexWriteStormGovernance.ts`
- `lender-app/lib/convexCostGovernance.ts`
- `lender-app/tests/e2e/pipeline-idle-write-budget.spec.ts`

### Operator proof scripts (regression harness — do not delete)
- `lender-app/convex/operator/ownerAclStep8B.ts`
- `lender-app/convex/operator/shareForensicsStep8B1.ts`
- `lender-app/convex/operator/displayNormalizationStep8C.ts`
- `lender-app/scripts/run-phase12-step8B-owner-acl.ts` (if present)
- `lender-app/scripts/run-phase12-step8B1-share-forensics.ts`
- `lender-app/scripts/run-phase12-step8C-display-normalization.ts`

---

## Phase 13 validation gate (baseline)

| Command | Result (2026-05-21) |
|---------|---------------------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run auth:validate` | **PASS** (Joshua prod) |

---

**Lock policy:** Treat edits to locked modules as **infrastructure regressions**. Product features must compose through these APIs without bypassing owner-scoped ACL, canonical auth identity, display normalization, or write-budget guards.
