# Regression protection

Automated guards against recurring **auth**, **tenant**, **org id**, **permission**, and **vendor-drift** failures.

## What runs where

| Layer | Command | Purpose |
|-------|---------|---------|
| **CI (unit + governance)** | `npm run verify:regression` | `audit:no-clerk` + `scripts/regression-protection-tests.ts` |
| **CI (HTTP integration)** | `npm run test:regression:e2e` | Playwright: health, login error paths, auth stress, multi-session cookie isolation |
| **Full system** | `npm run validate:system` | Includes `verify:regression` before Convex/env/smoke |

## Covered scenarios (unit script)

- **Malformed org / table ids** — `parseConvexDocumentId`, `parseOrganizationId`, `validateOrganizationIdInput` (must not accept wrong charset, length, or type).
- **Convex `assertOrganizationId`** — Uses the same shape rules as the client via `parseConvexDocumentId` (invalid strings throw **before** `db.get`).
- **Duplicate memberships** — `pickCanonicalOrgMember` prefers newest `_creationTime` (avoids `.unique()` crashes on duplicates).
- **Stale / invalid session (state machine)** — `deriveAuthMachineState` for `expired`, `degraded`, `unauthenticated`, websocket-offline paths.
- **Permission crashes** — `hasOrgPermission` ignores `null`/`undefined` grants; `useOrgPermissions.can` wraps checks and validates `permissions` is an **array**.
- **WebSocket / live connection** — Auth machine states when disconnected (proxy for subscription failure UX).
- **Invalid Convex URLs** — `parseConvexPublicUrl` rejects non-deployment URLs (sync cannot start).
- **Legacy external id patterns** — `isLegacyExternalUserId` / `isLegacyExternalOrgId` stable expectations for migration tooling (not a live vendor SDK).

## CI enforcement

1. **No Clerk SDK / strings** — `npm run audit:no-clerk` must pass (fails if banned imports or legacy auth vendor patterns return).
2. **No “invalid org id passes validation” regressions** — unit tests + shared `parseConvexDocumentId` between client and `convex/organizationValidators`.
3. **Auth login must not 5xx on bad input** — Playwright `regression-protection.spec.ts` posts malformed JSON and empty credentials.

GitHub Actions: `.github/workflows/regression-protection.yml` runs `verify:regression` on every PR touching `lender-app/`; `test:regression:e2e` runs on push against **Chromium** only (uses Playwright `webServer` from `playwright.config.cjs`).

## Schema validators

- `lib/schema/orgScopeSchema.ts` — `validateOrganizationIdInput`, `validateConvexDocumentIdInput` for API bridges and future HTTP handlers.

## Runtime invariants & recovery

- **localStorage** — `getStoredActiveOrganizationId` already removes malformed ids on read.
- **Session vs stored active org** — `reconcileActiveOrgWithSession` (called from `useOrgPermissions`) clears bad storage and resyncs when the viewer org differs from stored (production-safe, no modal).

## Playwright suites

| File | Notes |
|------|--------|
| `tests/regression/regression-protection.spec.ts` | Public health + login API edge cases |
| `tests/auth/auth-stress.spec.ts` | Sequential login attempts; skips without `APP_AUTH_*` |
| `tests/regression/multi-session-isolation.spec.ts` | Two contexts; session cookie not shared |
| `tests/regression/tenant-isolation.spec.ts` | Seeded E2E org isolation (existing) |

## Extending

- Add Convex **`ctx.db` integration tests** only with a dedicated test deployment + `convex-test` (not bundled here); keep unit script free of Convex server.
- For **permission denial** server paths, rely on `ORG_PERM_TELEMETRY=1` plus observability docs when reproducing in staging.

---

*Keep this doc updated when adding new banned patterns to `audit-no-clerk` or new validators under `lib/schema/`.*
