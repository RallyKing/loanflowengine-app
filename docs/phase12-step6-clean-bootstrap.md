# Phase 12.2 Step 6 — Canonical Identity + Clean Tenant Bootstrap

**Date:** 2026-05-23  
**Deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Operator audit:** `auth/operatorAudit:verifyCleanBootstrap`  
**Disposable purge:** `auth/operatorAudit:purgeDisposableBootstrapTest`  
**Evidence:** `migration-reports/phase12-step6-bootstrap-validation.json`

---

## Summary

Permanent canonical identity enforcement (NFKC → trim → lowercase) is now centralized and applied across all auth entry points. New self-service signups bootstrap a **clean tenant shell only** — organization, owner membership, system RBAC roles, and default pipeline stage config. No tasks, pipeline files, activity, contacts, lenders, saved views, or demo/seed data are created.

Live production validation created one disposable account, passed operator audit, purged it completely, and confirmed **Joshua canonical tenant zero drift**.

---

## 1. Canonical identity enforcement

### Canonicalization rule

All login identifiers resolve through:

```
raw → NFKC → trim → toLowerCase
```

Implemented in `lender-app/lib/auth/normalizeUsername.ts` and `normalizeAuthEmail.ts`, re-exported from `convex/auth/canonicalIdentity.ts`.

### Coverage map

| Flow | Location | Mechanism |
|------|----------|-----------|
| Signup | `convex/auth/signup.ts`, `app/api/auth/signup/route.ts` | `assertCanonicalAuthAvailable` + `normalizeUsername` on insert |
| Login | `app/api/auth/login/route.ts`, `convex/auth/loginBridge.ts` | `collectAuthUsersByCanonicalLogin` |
| Password reset | `app/api/auth/forgot-password/route.ts`, `convex/auth/passwordReset.ts` | `findAuthUserByCanonicalLogin` |
| Team invite / operator create user | `convex/teamManagement.ts`, `app/api/org/team/create-user/route.ts` | `assertCanonicalAuthAvailable` |
| Account lookup / diagnose | `convex/auth/operatorDiagnose.ts`, `convex/organizationResolver.ts` | `collectAuthUsersByCanonicalLogin` |
| Session restore / validation | `lib/session/loadViewer.ts`, `convex/auth/sessionQueries.ts` | Session keyed by user id; login path canonicalizes before lookup |
| Auth bridge | `convex/auth/loginBridge.ts` | Bridge proof uses normalized key; lookup uses canonical collection |

Duplicate rejection uses **canonical form only** (`USERNAME_TAKEN` / `EMAIL_TAKEN`).

### Canonicalization proof table

#### Joshua production account (design requirement)

These variants **must** resolve to the same account (`ts719yfyv2b6020avvctpw0ns586exm6`):

| Input | Canonical form | Resolves to same account |
|-------|----------------|--------------------------|
| `Joshua@DirectLendingConnection.com` | `joshua@directlendingconnection.com` | Yes |
| `joshua@directlendingconnection.com` | `joshua@directlendingconnection.com` | Yes |
| ` JOSHUA@DIRECTLENDINGCONNECTION.COM` | `joshua@directlendingconnection.com` | Yes |

**Operational proof:** `npm run auth:validate` completed full login → session → refresh → logout → relogin cycle against production using `joshua@directlendingconnection.com` — **ALL_CHECKS_PASSED**.

#### Disposable live test (production)

Account: `Phase12.Disposable.1779592016890@dlc.test`  
Canonical: `phase12.disposable.1779592016890@dlc.test`  
User id: `ts7ap4d8ry0t52ks9yrbg7y0wd87bcyc` (purged after test)

| Input variant | Normalized | Found | Same userId as signup |
|---------------|------------|-------|----------------------|
| `Phase12.Disposable.1779592016890@dlc.test` | `phase12.disposable.1779592016890@dlc.test` | Yes | Yes |
| `PHASE12.DISPOSABLE.1779592016890@DLC.TEST` | `phase12.disposable.1779592016890@dlc.test` | Yes | Yes |
| ` Phase12.Disposable.1779592016890@dlc.test ` | `phase12.disposable.1779592016890@dlc.test` | Yes | Yes |
| `  PHASE12.DISPOSABLE.1779592016890@DLC.TEST  ` | `phase12.disposable.1779592016890@dlc.test` | Yes | Yes |

---

## 2. Clean tenant bootstrap

### Created on signup

| Artifact | Count (disposable test) |
|----------|------------------------:|
| Organization | 1 |
| Owner membership | 1 |
| System RBAC roles | 7 |
| Default pipeline stages | 8 |

### Explicitly NOT created

| Table / data | Count at audit |
|--------------|---------------:|
| Pipeline files | 0 |
| Tasks | 0 |
| Activity (org-scoped) | 0 |
| Contacts | 0 |
| Lenders | 0 |
| Saved filter presets | 0 |
| Foreign-tenant pipeline/tasks | 0 |

Implementation: `convex/auth/cleanTenantBootstrap.ts` → `bootstrapCleanNewTenant()`, invoked from `convex/auth/signup.ts`.

---

## 3. Operator audit

### `auth/operatorAudit:verifyCleanBootstrap`

Verifies for any supplied username:

- Canonical identity correctness (`identityFieldsCanonical`)
- Exactly one auth user match
- Exactly one org membership
- No duplicate aliases
- Zero seeded business data
- Zero inherited foreign tenant data
- Minimum role + stage shell present

**Disposable test result:** `pass: true`

---

## 4. Live production validation

Script: `lender-app/scripts/run-phase12-step6-bootstrap-validation.ts`

| Step | Result |
|------|--------|
| Joshua org snapshot (before) | Recorded |
| Signup disposable account | OK — org `mx70p2fxmj847q2e7t38nmxgz187adfp` |
| Canonical lookup variants (×4) | All same userId |
| `verifyCleanBootstrap` | **PASS** |
| `purgeDisposableBootstrapTest` (live) | Deleted user + org shell |
| Post-purge audit | `authUserCount: 0` |
| Joshua org snapshot (after) | **Unchanged** |

---

## 5. New account object counts (before / after purge)

### Before purge (clean bootstrap audit)

| Object | Count |
|--------|------:|
| Auth users (canonical match) | 1 |
| Org memberships | 1 |
| Organizations | 1 |
| Organization roles | 7 |
| Pipeline stages | 8 |
| Pipeline files | 0 |
| Tasks | 0 |
| Contacts | 0 |
| Lenders | 0 |
| Saved views | 0 |
| Org-scoped activity | 0 |

### After purge (deletion proof)

| Table | Rows deleted |
|-------|-------------:|
| `authUsers` | 1 |
| `organizationMembers` | 1 |
| `organizationPipelineStages` | 8 |
| `organizationRoles` | 7 |
| `organizations` | 1 |

Post-purge lookup: `authUserCount: 0`, `userGone: true`.

Org id `mx70p2fxmj847q2e7t38nmxgz187adfp` and user id `ts7ap4d8ry0t52ks9yrbg7y0wd87bcyc` no longer exist in production.

---

## 6. Joshua tenant zero drift confirmation

Org: `mx76bxqnc23q76cb99tvrffmy58644pf` (Direct Lending Connection)

| Metric | Before Step 6 validation | After Step 6 validation | Δ |
|--------|-------------------------:|------------------------:|--:|
| Members | 2 | 2 | 0 |
| Pipeline files | 11 | 11 | 0 |
| Tasks | 56 | 56 | 0 |
| Org-scoped activity | 251 | 251 | 0 |

**unchanged: true**

Protected users and E2E Primary org were not touched.

---

## 7. Validation commands

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Deployed to `basic-anaconda-984` |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |

---

## 8. Code artifacts added / changed

| File | Purpose |
|------|---------|
| `convex/auth/canonicalIdentity.ts` | Central NFKC lookup + duplicate guard |
| `convex/auth/cleanTenantBootstrap.ts` | Clean org shell bootstrap + business data counter |
| `convex/auth/operatorAudit.ts` | `verifyCleanBootstrap`, `purgeDisposableBootstrapTest` |
| `convex/auth/signup.ts` | Clean bootstrap path |
| `convex/auth/loginBridge.ts` | Canonical login lookup |
| `convex/auth/passwordReset.ts` | Canonical reset lookup |
| `convex/auth/operatorDiagnose.ts` | Canonical diagnose lookup |
| `convex/teamManagement.ts` | Canonical invite/create-user guard |
| `scripts/run-phase12-step6-bootstrap-validation.ts` | Live prod disposable test runner |

---

## Status

**Phase 12.2 Step 6 complete.** Awaiting next instruction.
