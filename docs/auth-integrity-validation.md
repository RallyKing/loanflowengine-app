# Auth integrity validation

**Scope:** Code-path audit (no live credential hammering in this pass).

## Session creation

- **Primary:** `app/api/auth/login/route.ts` — validates CSRF posture (`assertSameSiteRequest`), rate limits via `auth.loginBridge.bridgedRateConsume`, loads user via `loginLookup`, verifies **Argon2** password with `verifyPassword`, issues **HMAC cookie** (`SESSION_COOKIE_NAME`) via `signSession` / `newViewerSession`.
- **Tooling / E2E:** `checkCredentials` + `newViewerSession()` short path when `APP_AUTH_*` env matches; `tryResolveE2EWorkspaceSession` for catalog users.

## Session rotation / invalidation

- **Credential version:** schema documents `credentialVersion` on `authUsers`; sessions with stale version should revoke (review `sessionQueries` / session validation — not re-pasted here in full).
- **Logout:** `app/api/auth/logout/route.ts` (pattern) — ensure cookie cleared server-side.

## Storage persistence

- Session persisted as **httpOnly** cookie (`sessionAuth`), `sameSite: lax`, `secure` in production when configured.

## Case-insensitive username normalization

| step | implementation |
|------|----------------|
| Canonical form | `lib/auth/normalizeUsername.ts` — `trim().toLowerCase()` |
| Login route | `const normalized = normalizeUsername(username)` before Convex lookup |
| Env short-circuit | `checkCredentials` compares `normalizeUsername(username)` to `normalizeUsername(expectedUser)` |
| Convex lookup | `loginBridge.loginLookup` lowercases `normalizedUsername` again and queries `by_normalizedUsername` |
| Schema | `authUsers.normalizedUsername` + indexes |

**Conclusion:** Uppercase, lowercase, and mixed-case **username** inputs for the **same** logical user should resolve to the **same** `authUsers` row, assuming the account was created with that normalized key.

## Password hashing

- **Argon2id** encoding on the user record; verification in Node route (`verifyPassword`). Passwords are **not** verified inside Convex V8 handlers for the main web login path.

## Tenant resolution

- `defaultOrganizationId` on `authUsers`; active org also influenced by client `useOrgPermissions` (localStorage + host cookie + viewer). See `lib/useOrgPermissions.ts`.

## Live attempts (upper / lower / mixed case)

**Not executed** against your production user in this environment (no shared password). **Recommended manual check:**

1. Pick one internal account.
2. Sign in with `USER` / `user` / `UsEr` (same password).
3. Confirm same `authUsers` row (e.g. same data visible, same org).

All three **should** pass given the normalization pipeline above.
