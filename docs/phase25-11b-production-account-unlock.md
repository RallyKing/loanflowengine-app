# Phase 25.11b — Production account unlock execution

**Date:** 2026-06-03  
**Target:** `joshua@directlendingconnection.com`  
**Convex prod:** `https://basic-anaconda-984.convex.cloud` (`basic-anaconda-984`)

---

## 1. Operator unlock (executed)

**Command:**

```bash
cd lender-app
node scripts/unlock-production-auth-account.mjs joshua@directlendingconnection.com
```

**Mutation:** `auth/operatorDiagnose:clearAccountLockoutByLogin`

**Fields cleared on `authUsers`:**

- `accountLockedUntilMs` → undefined
- `accountLockedReason` → undefined
- `failedLoginCount` → 0
- `lastFailedLoginAt` → undefined

**Result:** `ok: true`, `userId: ts719yfyv2b6020avvctpw0ns586exm6`

**Confirmation:** Account joshua@directlendingconnection.com has been successfully unlocked on production.

---

## 2. Auth mutation patch (deployed)

**Files:**

| File | Change |
|------|--------|
| `convex/auth/loginBridge.ts` | `clearFailedLoginsBridged` clears lock fields on successful password verify path |
| `convex/auth/usersInternal.ts` | `clearFailedLogins` internal mirror |
| `convex/auth/operatorDiagnose.ts` | New `clearAccountLockoutByLogin` operator mutation |
| `scripts/unlock-production-auth-account.mjs` | One-shot unlock runner |

**Deploy:** `npm run convex:deploy:prod` — succeeded.

---

## 3. Post-unlock verification

| Check | Result |
|-------|--------|
| `diagnose-auth-user.ts` | `accountLockedUntilMs: null`, `failedLoginCount: 0` |
| `POST /api/auth/login` (prod) | **200** `{ ok: true }` |
| `GET /pipeline` with session cookie | **200** (no redirect to `/login`) |

---

## Prevention

Successful native login (`/api/auth/login` → `clearFailedLoginsBridged`) now clears residual lock timestamps so the Vercel/Convex lock split cannot recur after a valid password.
