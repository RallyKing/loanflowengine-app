# Phase 25.12 — Production authentication incident report

**Date:** 2026-06-03  
**Mode:** Investigation only — **no patches applied**  
**Production:** https://dlcfunds.vercel.app  
**Convex production:** `https://basic-anaconda-984.convex.cloud` (`basic-anaconda-984`)  
**Vercel deployment (auth health):** `dpl_JDR8A6xhLU4tZLFYSB472Sf7GrGi`

---

## Executive summary

Production auth is failing in **two distinct layers**, both verified live on 2026-06-03:

| Symptom | Failing layer | HTTP / code | Root cause |
|--------|----------------|-------------|------------|
| `INVALID_CREDENTIALS` on login | Next `/api/auth/login` → Convex `loginLookup` + Argon2 | **401** | Wrong password **or** stored hash mismatch (historical; hash now matches probe password). |
| Login returns `ok: true` but app immediately sends you back to `/login` | Next **middleware** → Convex `validateSession` | **307** → `/login?next=…` | **`ACCOUNT_LOCKED`** on session validation while login route **does not block** the same locked account. |

**Primary production incident (app unusable after “successful” login):** split-brain **account lockout** between the Vercel login route and Convex session validation.

**Not the cause:** Clerk (workspace login is native Convex-backed cookie auth). Auth bridge secret mismatch (fingerprints match). Missing Convex user row for `joshua@directlendingconnection.com`.

---

## 1. Failure scope

| Dimension | Finding | Evidence |
|-----------|---------|----------|
| **One user vs all** | **Any user with `accountLockedUntilMs > now`** on `authUsers` | Convex `validateSession` returns `ACCOUNT_LOCKED` for Joshua’s account while locked; other users without lock can pass validation (not exhaustively tested for every org). |
| **Admin only vs all roles** | **All roles** on native auth path (owner/admin/member use same session cookie + `validateSession`) | No role bypass in `sessionQueries.validateSession` lock gate. |
| **Production vs local** | **Production proven**; local follows **same Convex deployment** if `NEXT_PUBLIC_CONVEX_URL` points at `basic-anaconda-984` (`.env.local` in this workspace does) | Live probes against `dlcfunds.vercel.app` + Convex HTTP client to prod. |
| **Existing sessions vs new logins** | **Both fail** when account is locked | Existing `dlc_session` cookies call `validateSession` on every request; new login mints a valid session row but middleware still rejects viewer. |

**Joshua account (`joshua@directlendingconnection.com`) at time of investigation:**

- User exists, active membership, default org valid, global admin.
- Argon2 hash **valid** against operator probe password (see §4).
- **`accountLockedUntilMs`: `2026-06-03T13:33:09.221Z`** (30-minute lock from failed-login policy).
- **`failedLoginCount`: 0** (counter cleared on last successful password verify; **lock timestamp not cleared**).

---

## 2. Exact auth failure trace

### 2.1 Login request (`POST /api/auth/login`)

**Chain (native auth):**

```text
Browser → POST /api/auth/login (Next.js, nodejs runtime)
  → optional APP_AUTH_* HMAC shortcut (Vercel has APP_AUTH_* names configured)
  → Convex query auth/loginBridge.loginLookup (bridge HMAC)
  → Argon2 verifyPassword (Next)
  → Convex mutation auth/loginBridge.createSessionBridged
  → Set-Cookie: dlc_session={publicId}.{secret}
```

**Captures (production, 2026-06-03):**

| Step | Result |
|------|--------|
| `GET /api/auth/health` | **200** `{"ok":true,"nextPublicConvexUrl":"https://basic-anaconda-984.convex.cloud","authBridgeSecretConfigured":true,"authBridgeSecretSha256Prefix":"760cc03b5586b20f"}` |
| Login wrong password (`invalidpassword12`) | **401** `{"ok":false,"code":"INVALID_CREDENTIALS","error":"Incorrect username or password."}` |
| Login correct credentials (operator-verified password) | **200** `{"ok":true}` + `Set-Cookie: dlc_session=…` (3 cookies) |
| Login short password probe | **400** `VALIDATION` (password policy ≥6 chars) — route reachable |

**Important:** While account is locked, login still returns **200** for correct password (lock **not** enforced on this path in production). Wrong password still returns **401** `INVALID_CREDENTIALS` (not **403** `ACCOUNT_LOCKED`), which proves the **login route is skipping the lock gate** in production (via `shouldSkipTemporaryAccountLockout()` / `AUTH_RELAX_LOGIN_RATE_LIMIT` on **Vercel**, not because the account is unlocked).

**Relevant code:**

- Lock gate on login: `lender-app/app/api/auth/login/route.ts` **220–228**
- Skip flags: same file **55–73** (`AUTH_RELAX_LOGIN_RATE_LIMIT`, `PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT`, dev defaults)
- Lock does **not** clear on success: `clearFailedLoginsBridged` only sets `failedLoginCount: 0` — **does not** clear `accountLockedUntilMs` (`convex/auth/loginBridge.ts` **197–200**)

### 2.2 Session creation

- `createSessionBridged` succeeds when password verifies (cookie issued).
- Session row uses `credentialVersion` from user (Joshua: **5**).

### 2.3 Session validation (middleware — actual “logged out” behavior)

**Chain:**

```text
GET /pipeline (or any protected route)
  → middleware.ts verifySession(dlc_session)
    → lib/session/loadViewer.ts → Convex query auth/sessionQueries.validateSession
    → if !ok → redirect /login?next=…
```

**Capture (production, immediately after 200 login):**

| Step | Result |
|------|--------|
| `fetch /pipeline` with `dlc_session` from login | **307** `Location: /login?next=%2Fpipeline` |
| Direct Convex `validateSession` with same cookie material | **`{ "ok": false, "code": "ACCOUNT_LOCKED" }`** |

**Relevant code:**

- Middleware redirect: `lender-app/middleware.ts` **154–168**
- Lock gate on session: `lender-app/convex/auth/sessionQueries.ts` **49–55** (uses same `shouldSkipTemporaryAccountLockout()` but reads **`process.env` on Convex**, not Vercel)

**Convex production env (sampled):** `AUTH_BRIDGE_SECRET` present. **`AUTH_RELAX_LOGIN_RATE_LIMIT` not listed** in `npx convex env list --prod` output (only matching line was bridge secret). So **Convex enforces lock** on session validation.

### 2.4 Session refresh

- `touchSession` runs after successful validation only; never reached when `validateSession` returns `ACCOUNT_LOCKED`.

### 2.5 Redirect handling

- User sees login form again (or “bounce”) with `next` query param — consistent with middleware `redirect_login`, not login API failure.

### 2.6 Browser console / server logs

- Not captured from Joshua’s browser in this investigation.
- Structured login logs: `auth.login` outcome in `route.ts`; failed validation is silent in middleware (returns redirect, no user-facing JSON).
- Operator diagnostic: `npx tsx scripts/diagnose-auth-user.ts joshua@directlendingconnection.com` (requires `DATA_MIGRATION_ADMIN_SECRET`).

**Request IDs:** Middleware sets `x-request-id` / correlation headers (`middleware.ts` **86–89**); not collected for this incident run.

---

## 3. Deployment consistency

| Check | Status | Detail |
|-------|--------|--------|
| Vercel serving production | **OK** | Health: `vercelDeploymentId` = `dpl_JDR8A6xhLU4tZLFYSB472Sf7GrGi` |
| Convex URL on Vercel | **OK** | `https://basic-anaconda-984.convex.cloud` |
| Repo prod template | **OK** | `npm run verify:prod-deployment-alignment` — slug `basic-anaconda-984` |
| `AUTH_BRIDGE_SECRET` Vercel ↔ Convex | **OK** | Health prefix `760cc03b5586b20f`; `npx tsx scripts/auth-bridge-probe.ts` — remote prefix **matches** |
| Clerk | **N/A for workspace login** | No `CLERK_*` in active login path; legacy `clerk_*` keys are migration/audit only |
| `APP_AUTH_*` on Vercel | **Present (names)** | Pulled env template lists `APP_AUTH_USERNAME`, `APP_AUTH_PASSWORD`, `APP_AUTH_SESSION_SECRET` — values not readable locally. Shortcut only applies when username/password match env exactly. |
| Auth middleware | **Active** | Cookie session required on all non-public routes |

**Note:** `VERCEL_GIT_COMMIT_SHA` empty in health response — deploy may be CLI-driven without git metadata; does not block auth.

---

## 4. User record verification — `joshua@directlendingconnection.com`

Operator mutation `auth/operatorDiagnose:diagnoseAuthUserByLogin` (prod Convex), 2026-06-03:

| Field | Value |
|-------|--------|
| `userExists` | **true** |
| `userId` | `ts719yfyv2b6020avvctpw0ns586exm6` |
| `emailStored` / `normalizedUsernameStored` | `joshua@directlendingconnection.com` |
| `passwordHashPresent` | **true** |
| `argon2HashFormatValid` | **true** |
| `hashValidatesAgainstProbe` | **true** (operator probe password used in script env) |
| `defaultOrgValid` | **true** (`mx76bxqnc23q76cb99tvrffmy58644pf`) |
| `membershipActive` | **true** (role **owner**) |
| `isGlobalAdmin` | **true** |
| `accountLockedUntilMs` | **1780493589221** → **2026-06-03T13:33:09.221Z** (still in future at probe time) |
| `failedLoginCount` | **0** |
| `credentialVersion` | **5** |

**Conclusion:** Account is **not** missing, deleted, or deactivated at org level. It **is** temporarily locked at the Convex user row, and that lock **blocks session validation** but **not** production login.

---

## 5. Recent changes (Phase 24.4F → 25.11)

Git history under `lender-app` auth paths shows **no auth-specific commits** in the recent window; latest touching auth-adjacent paths:

- `6d98798` — Mobile scroll layout, Playwright mobile suites (not login logic)

Phase docs reviewed:

| Phase | Auth impact |
|-------|-------------|
| 24.4F / 24.5.x | Scroll / mobile / contacts — **no auth code changes** in docs |
| 25.10 / 25.11 | Contacts null crash / pipeline layout audit — **no auth changes** |
| Prior native auth fix (transcript) | Operator `ensure-primary` / password reset on prod Convex for hash mismatch → explains historical **401 INVALID_CREDENTIALS** |

**Auth-adjacent operational risk (pre-existing):**

- Failed-login lock: **8 failures → 30 min** `accountLockedUntilMs` (`loginBridge.recordFailedLoginBridged`)
- E2E sandbox usernames skip lock accumulation; **primary email does not**
- Investigation probes (wrong passwords) can **trigger or extend** lock on operator accounts

---

## 6. Root cause (proven)

### Incident A — “Login says success but app won’t stay in” (primary)

| Item | Detail |
|------|--------|
| **Failing layer** | **Convex `auth/sessionQueries.validateSession`** (called from Next middleware) |
| **Exact error** | `{ ok: false, code: "ACCOUNT_LOCKED" }` |
| **Why** | `authUsers.accountLockedUntilMs` is in the future. Login route on Vercel **skips** the same lock check when `shouldSkipTemporaryAccountLockout()` is true; Convex validation **does not** skip. Successful login does **not** clear `accountLockedUntilMs`. |
| **Impact** | Locked users (Joshua now; any user hitting 8 failed logins) cannot use the app despite receiving `dlc_session`. |

### Incident B — `INVALID_CREDENTIALS` (secondary / historical)

| Item | Detail |
|------|--------|
| **Failing layer** | `/api/auth/login` — `loginLookup` not found **or** Argon2 `verifyPassword` false |
| **Exact error** | HTTP **401**, `code: "INVALID_CREDENTIALS"` |
| **Why (Joshua, earlier)** | Stored hash did not match password (fixed in prior session via prod Convex operator password reset per transcript). **Current state:** hash validates; 401 only for intentionally wrong password. |
| **Impact** | User cannot sign in until password matches stored hash (or lock policy returns 403 if lock gate enforced). |

---

## 7. Reproduction steps

### Reproduce “logged in then immediately out” (production)

1. Ensure `authUsers.accountLockedUntilMs > Date.now()` for target user (Joshua currently satisfies).
2. `POST https://dlcfunds.vercel.app/api/auth/login` with valid JSON body, correct email/password, header `Origin: https://dlcfunds.vercel.app`.
3. Observe **200** `{ "ok": true }` and `dlc_session` cookie.
4. `GET https://dlcfunds.vercel.app/pipeline` with that cookie.
5. Observe **307** to `/login?next=%2Fpipeline`.
6. Optional: Convex `validateSession` with parsed `publicId` + SHA-256(secret) → **`ACCOUNT_LOCKED`**.

### Reproduce `INVALID_CREDENTIALS`

1. Same login POST with wrong password.
2. Observe **401** `INVALID_CREDENTIALS` (even when account is locked, because Vercel login path skips lock).

---

## 8. Recommended fix (do not implement in this phase)

### Immediate operator relief (Joshua / locked users)

1. Clear lock on prod Convex user row: `accountLockedUntilMs` / `accountLockedReason` (e.g. `auth/operatorHardResetNativeAuth` or controlled admin mutation) — **no app deploy required**.
2. Revoke stale sessions if needed (`revokeSessionBridged` / team “force logout” when available).

### Structural fixes (smallest → larger)

1. **On successful login**, patch `accountLockedUntilMs: undefined` (and reason) in `clearFailedLoginsBridged` or immediately after `verifyPassword` success — lock should not survive a correct credential proof.
2. **Align lock policy** between Vercel login route and Convex `validateSession`: either enforce on both or skip on both; do not rely on `AUTH_RELAX_LOGIN_RATE_LIMIT` on Vercel only.
3. **When account is locked**, return **403 `ACCOUNT_LOCKED`** from `/api/auth/login` before password check (when not in explicit relax mode) so UI message matches session behavior.
4. Document that automated probes must use E2E sandbox users or `AUTH_RELAX` on **both** Vercel and Convex during load tests.

### Not recommended

- Re-enabling Clerk for workspace login (out of scope; native auth is canonical).
- Disabling middleware session checks.

---

## 9. Success criteria answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Exact failing layer | **Session validation:** Convex `validateSession` via middleware. **Login errors:** `/api/auth/login` credential verification. |
| 2 | Exact error | **`ACCOUNT_LOCKED`** (session); **`INVALID_CREDENTIALS`** (wrong password / historical hash). |
| 3 | Reproduction | §7 — reproducible on production now for locked account. |
| 4 | Root cause | **Split lockout enforcement** + **lock not cleared on successful login**. |
| 5 | Impact scope | **Locked native-auth users** on production (Joshua confirmed); not all users; not Clerk. |
| 6 | Recommended fix | §8 — operator unlock now; code alignment + clear lock on success next. |

---

## Appendix — Tools used

- `GET /api/auth/health`
- `POST /api/auth/login` (controlled probes)
- `npx tsx scripts/diagnose-auth-user.ts`
- `npx tsx scripts/auth-bridge-probe.ts`
- `node` fetch + Convex HTTP `validateSession`
- `npm run verify:prod-deployment-alignment`

**Credentials:** Operator probe password validated locally against Convex hash; not stored in this document.
