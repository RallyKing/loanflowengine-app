# Internal authentication architecture

This document describes the username/password system backed by **Convex** (users, sessions, rate limits, password reset tokens) and **Next.js** (Argon2id hashing, cookies, same-origin checks). It supersedes the older “env-only + HMAC cookie” model for multi-user workspaces while **keeping legacy HMAC cookies** available for narrow tooling/E2E paths.

## Principles

1. **Case-insensitive username** — Canonical key: `normalizedUsername = lowercase(trim(username))`. All login lookups use this value. **`displayUsername`** stores the original casing for UI.
2. **Uniqueness** — `authUsers.normalizedUsername` is indexed (`by_normalizedUsername`). Application mutations reject duplicates; Convex indexes are not SQL unique constraints, so never bypass the signup mutation with raw inserts.
3. **Passwords** — **Argon2id** only in **Node** (Next.js route handlers). Convex never sees plaintext passwords; it may store the Argon2-encoded string returned from Next.
4. **Sessions** — **HttpOnly** cookie `dlc_session` = `publicId.secret` (both URL-safe). Only **SHA-256(secret)** is stored (`tokenHash`). A separate **CSRF** cookie `dlc_csrf` holds a random token (not HttpOnly) for future form hardening; state-changing routes currently rely on **Origin/Host** alignment (`assertSameSiteRequest`).
5. **Bridge secret** — `AUTH_BRIDGE_SECRET` (≥24 chars) must match on **Vercel** and **Convex**. HMAC proves callers of sensitive Convex functions are the Next.js server, not anonymous clients.

## Data model (Convex)

| Table | Role |
|-------|------|
| `authUsers` | `normalizedUsername`, `displayUsername`, `passwordHash`, `credentialVersion`, lockout fields, optional `email*`, `defaultOrganizationId` |
| `authSessions` | `publicId`, `tokenHash`, optional rotation fields, idle/absolute expiry, `rememberMe`, `revokedAtMs`, `credentialVersion`, `csrfTokenHash` |
| `authPasswordResetTokens` | Hashed reset token, `expiresAtMs`, `usedAtMs` |
| `authEmailVerificationTokens` | Reserved for outbound email |
| `authRateBuckets` | Sliding-window counters keyed by logical rate-limit key |

## Login flow

1. Browser **POST** `/api/auth/login` with JSON `{ username, password, rememberMe? }`.
2. Next validates **Origin** vs **Host**.
3. Next calls **bridged** rate limit mutation (`auth.loginBridge.bridgedRateConsume`) keyed by `login:<normalizedUsername>:<ipHint>`.
4. Next calls **bridged** query `auth.loginBridge.loginLookup` → returns `passwordHash` and account flags (only when HMAC is valid).
5. Next runs **Argon2id verify** locally.
6. On failure, **bridged** `recordFailedLoginBridged` may lock the account after repeated failures.
7. On success, Next generates `publicId`, `secret`, CSRF material, hashes secrets, and calls **bridged** `createSessionBridged`.
8. Response **Set-Cookie**: `dlc_session`, `dlc_csrf`.

**Environment/E2E**: If `APP_AUTH_*` env credentials match, the app may still mint a **legacy HMAC** session (unchanged behavior for single-user tooling).

## Session validation

- **RSC / middleware**: `verifySession` → `loadViewerFromCookies` parses `publicId.secret`, hashes the secret, runs `auth.sessionQueries.validateSession`, then best-effort **`touchSession`** to extend idle timeout.
- **Failure codes** returned from validation include `SESSION_EXPIRED`, `SESSION_REVOKED`, `SESSION_INVALIDATED` (credential bump / concurrent invalidation), `INVALID_TOKEN`, `ACCOUNT_LOCKED`.

## Rotation & revocation

- **Rotation**: `touchSession` accepts optional `newTokenHash` + `rotationGraceMs` so the previous hash remains valid briefly (documented hook for future `/api/auth/session/rotate`).
- **Logout**: `auth.loginBridge.revokeSessionBridged` marks the row revoked.
- **Password reset**: `completePasswordReset` updates the hash, **bumps `credentialVersion`**, and **revokes all sessions** for the user.

## Password reset

1. **POST** `/api/auth/forgot-password` — always returns success; inserts a hashed token when the user exists (anti-enumeration). With `AUTH_DEBUG_RESET=1` and non-production, response may include `devResetToken` for local testing.
2. **POST** `/api/auth/reset-password` with `{ token, newPassword }` — bridges into `completePasswordReset`.

Email delivery is **not** wired; architecture tables exist for verification and reset.

## Rate limiting

| Surface | Key (examples) | Max/window (default) |
|---------|----------------|----------------------|
| Login | `login:<user>:<ip>` | 30 / 15m |
| Signup | `signup:<ip>` (in signup mutation) | 10 / 15m |
| Forgot password | `reset:<ip>` | 12 / 15m |

## Frontend routes & hooks

| Route | Purpose |
|-------|---------|
| `/login` | Primary sign-in |
| `/signup` | Self-serve signup (creates org + owner membership) |
| `/forgot-password`, `/reset-password` | Reset flow |
| `/session-expired` | UX landing when session is gone |
| `/sign-in` | Redirects to `/login` |

Hooks (see `lib/hooks/`): `useAuth`, `useSession`, `usePermissions` (alias of `useOrgPermissions`).

## Operations checklist

1. Set **`NEXT_PUBLIC_CONVEX_URL`**, **`AUTH_BRIDGE_SECRET`** on Vercel and Convex.
2. Run **`npx convex deploy`** (or `convex dev`) so schema and functions exist.
3. **Smoke**: signup → login → refresh → logout; password reset with dev token.
4. **Prod**: never enable `AUTH_DEBUG_RESET`. Prefer real email for reset links when SMTP is ready.

## Migration notes

- Existing **organizationMembers.userKey** values that matched `APP_AUTH_USER_KEY` should be **migrated** to each new auth user’s Convex id string when moving users off env-only auth.
- Legacy HMAC sessions remain parseable if `APP_AUTH_SESSION_SECRET` is configured; new users should use DB sessions only.
