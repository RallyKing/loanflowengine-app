# Phase 12.2 Step 7 — Superuser Tenant Impersonation

**Date:** 2026-05-23  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Operator audit:** `auth/operatorAudit:verifySuperuserIsolation`  
**Evidence:** `migration-reports/phase12-step7-impersonation-validation.json`

---

## Summary

Production-safe superuser tenant impersonation is implemented with a **hard allowlist** (canonical `joshua@directlendingconnection.com` only), signed server-side sessions (30 min max), tenant-scoped RBAC view, readonly mutation blocking, full audit trail, and operator isolation verification.

---

## 1. Superuser allowlist

| Rule | Implementation |
|------|----------------|
| Only canonical Joshua primary | `convex/auth/superuserAllowlist.ts` → `authUserMayInitiateSuperuserImpersonation()` |
| Exact login key match | `normalizeUsername(u.normalizedUsername) === PRIMARY_PLATFORM_ADMIN_LOGIN_KEY` |
| No role-based fallback | Does **not** use `isGlobalAdmin` or `systemRole` |
| No alias accounts | `joshuaeballard@gmail.com` **cannot** impersonate |
| No env override | No feature flag bypass |

---

## 2. Secure impersonation session

**Table:** `superuserImpersonationSessions`

| Field | Purpose |
|-------|---------|
| `publicId` + `tokenHash` | Signed cookie `dlc_impersonation` = `publicId.secret` |
| `authSessionPublicId` | Bound to parent `dlc_session` |
| `initiatorUserId` | Joshua primary auth user |
| `targetOrganizationId` | Tenant being viewed |
| `mode` | `readonly` \| `operator` |
| `issuedAt` / `expiresAt` | Max TTL 30 minutes |
| `nonce` | Replay resistance |

**API routes (403 for non-superuser):**

- `POST /api/auth/impersonation/start`
- `POST /api/auth/impersonation/stop`
- `GET /api/auth/impersonation/status`

---

## 3. Runtime behavior

| Concern | Behavior |
|---------|----------|
| Tenant queries | `loadViewerFromCookies` merges impersonation → effective `organizationId` / `organizationName` |
| UI tenant view | `OrgPermissionsProvider` uses impersonation org; GodMode bypass disabled while impersonating |
| Permissions | `resolveEffectivePermissionStrings` returns target org **Admin** role (tenant view, not global god-mode) |
| Readonly mutations | `assertOrgPermission` throws `IMPERSONATION_READ_ONLY` + audit `mutation_blocked` |
| Operator mutations | Full write on target org only + audit `mutation_allowed` |
| Banner | `SuperuserImpersonationBanner`: “Impersonating {orgName} as {mode}” |
| Controls | `SuperuserImpersonationPanel` — rendered only when `canSuperuserImpersonate` |

---

## 4. Visibility & security boundaries

| Check | Result |
|-------|--------|
| Impersonation UI in DOM | Only when `viewer.canSuperuserImpersonate === true` |
| API start/stop/status | `403 FORBIDDEN` for all other users |
| Secondary Joshua account | Blocked at allowlist |
| Global admin GodMode switcher | Hidden for Joshua primary (impersonation panel replaces it) |
| Logout | Stops impersonation + clears `dlc_impersonation` cookie |

---

## 5. Audit trail

**Table:** `superuserImpersonationAudit`

Events: `start`, `stop`, `mutation_blocked`, `mutation_allowed`, `expired`, `logout`

### Sample production audit rows (operator run)

| Event | Mode | Target org | Mutation |
|-------|------|------------|----------|
| `mutation_blocked` | readonly | E2E Primary (`mx7bfa58…`) | `settings.manage` |
| `mutation_allowed` | operator | E2E Primary | `settings.manage` |

---

## 6. Operator validation — `verifySuperuserIsolation`

**Result:** `pass: true`

| Matrix check | Result |
|--------------|--------|
| `joshuaPrimaryMayImpersonate` | true |
| `eballardBlocked` | true |
| `readonlyMutationBlocked` | true |
| `operatorMutationAllowed` | true |
| `crossTenantQueryIsolation` | true |

Test orgs: Joshua canonical (`mx76bxqnc23q76cb99tvrffmy58644pf`), E2E Primary (`mx7bfa58ty1svx65bt3h8v6v5186kke9`).

---

## 7. Production validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Deployed |
| `npm run deploy:prod` | https://dlcfunds.vercel.app |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |
| `verifySuperuserIsolation` (prod) | **pass: true** |

**Tenant restoration:** Operator audit revokes probe sessions after each matrix check. Stop API restores home org context and clears impersonation cookie (validated via session shape in status endpoint contract).

---

## 8. Code artifacts

| Path | Role |
|------|------|
| `convex/auth/superuserAllowlist.ts` | Canonical-only gate |
| `convex/superuserImpersonation/lifecycle.ts` | Start / stop / validate / probe |
| `convex/superuserImpersonation/runtime.ts` | Active session resolution + tenant admin perms |
| `convex/superuserImpersonation/auditLog.ts` | Audit append helper |
| `convex/auth/operatorAudit.ts` | `verifySuperuserIsolation` |
| `convex/organizationRbac.ts` | Readonly block + operator allow |
| `app/api/auth/impersonation/*` | HTTP session flow |
| `lib/session/loadViewer.ts` | Cookie validation + effective tenant |
| `components/SuperuserImpersonationBanner.tsx` | Active banner |
| `components/system-admin/SuperuserImpersonationPanel.tsx` | Controls (Joshua only) |

---

## Status

**Phase 12.2 Step 7 complete.** Awaiting next instruction.
