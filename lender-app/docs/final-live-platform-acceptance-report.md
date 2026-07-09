# Final live platform acceptance report

**Date:** 2026-05-07  
**Scope:** Post-migration UX / runtime validation (Phases 1–6 as requested).  
**Backend / data integrity:** Confirmed clean (referential integrity; prior repair report: `docs/post-migration-repair-report.md`).

## Executive summary

| Area | Status | Notes |
|------|--------|--------|
| Phase 1 — Named migrated files (prod, real user) | **Blocked on operator** | Requires an authenticated browser session as `joshua@directlendingconnection.com`. No assistant-owned credentials; capture console per file in DevTools manually or via recorded session. |
| Phase 2 — Onboarding modal | **Code reviewed + one spec fix** | `UserOnboardingChecklist` uses pointer-events split and modal z-index. Playwright: `tests/regression/getting-started-modal.spec.ts` now signs in before `/pipeline`. Full minimize/restore/dismiss/persistence matrix still needs a live run. |
| Phase 3 — Responsive navigation | **Not executed in this pass** | Validate rail / hybrid / bottom nav / icon manager in browser; fix any regressions found at runtime. |
| Phase 4 — Account lock / E2E sandbox | **Implemented** | Playwright defaults to E2E catalog when `APP_AUTH_E2E_USERS_ENABLED=true` and `E2E_PASS_*` are set. `@dlc.test` users no longer accumulate failed-login lockout in Convex (`recordFailedLoginBridged` / internal `recordFailedLogin`). Escape hatch: `PLAYWRIGHT_USE_PRIMARY_AUTH=1`. |
| Phase 5 — Browser matrix | **Partially automated** | Playwright projects: Chromium, **Firefox**, **Edge**, WebKit, Mobile Chrome, Mobile Safari, tablet. Full pass requires `npm run build`, local `next start` (or `PW_BASE_URL`), and `.env.testing` (or equivalent) with E2E secrets. |
| Phase 6 — This report | **Delivered** | Screenshots and per-file console logs from production must be attached by the operator when Phase 1 completes. |

**Production readiness score (this pass):** **0.72 / 1.00** — automation and lockout-safety improved; **live prod validation with the named deals and full cross-browser matrix are not closed in this session.**

---

## Repairs applied (codebase)

1. **`tests/helpers/workspace-auth.ts`** — Single resolver `playwrightLoginCredentials()`; E2E sandbox preferred unless `PLAYWRIGHT_USE_PRIMARY_AUTH=1`.
2. **`lib/auth/e2eSandboxAuth.ts`** — `isE2ESandboxNormalizedUsername` / `isE2ESandboxLoginEmail`.
3. **`convex/auth/loginBridge.ts`** — Skip failed-login counter / lock for `@dlc.test` users.
4. **`convex/auth/usersInternal.ts`** — Same guard on internal `recordFailedLogin` (defensive).
5. **`playwright.config.cjs`** — Added **firefox** and **edge** projects.
6. **`tests/auth/auth-stress.spec.ts`** — Uses `playwrightLoginCredentials()` (sandbox first).
7. **`tests/regression/multi-session-isolation.spec.ts`** — Same credential resolution.
8. **`tests/regression/getting-started-modal.spec.ts`** — Skip message + sign-in order fixed.
9. **`tests/e2e/smoke.spec.ts`** — Updated skip helper text.
10. **`.env.testing.example`** — Documented `PLAYWRIGHT_E2E_PERSONA` / `PLAYWRIGHT_USE_PRIMARY_AUTH`.

**Deploy:** Convex changes for lockout bypass require `npx convex deploy` (or your pipeline equivalent) before production honors the `@dlc.test` guard.

---

## Runtime pass / fail matrix (template)

Fill with **Pass / Fail / Skip** after each run.

| Flow | Chromium | Edge | Firefox | WebKit | Tablet | Mobile narrow | Mobile wide |
|------|----------|------|---------|--------|--------|---------------|-------------|
| Login (sandbox E2E) | | | | | | | |
| Pipeline open | | | | | | | |
| File workspace (per named deal) | | | | | | | |
| Contacts / lenders / ledger | | | | | | | |
| Document preview / attachment download | | | | | | | |
| Onboarding modal (minimize / dismiss / persistence) | | | | | | | |
| Nav rail / bottom nav / icon manager | | | | | | | |

---

## Named production files (Phase 1 checklist)

Operator: open each in production, expand workspace, and paste **Console** + **Convex** (if any) output into your QA artifact.

1. Bob Sherrill SBA file  
2. Carlos Reyes Working Capital  
3. Thomas Caulfield Contract Funding  
4. Alan Battle Refinance  
5. Karla Sanchez-Garcia Refinance  
6. Matt Head Expansion  
7. Matt Smurr LOC  
8. Todd Coney file  

**Success criteria:** file opens, workspace complete, contact + lender links visible, ledger loads, previews render, downloads work, no console errors, no hydration warnings, no React exceptions.

---

## Remaining UX defects

- Live validation for Phases **1, 3, 5** not completed in this agent session (auth + prod data access).
- **Production E2E:** `tryResolveE2EWorkspaceSession` only applies when `APP_AUTH_E2E_ALLOW_IN_PRODUCTION=true` (see `lib/testing/resolveE2ELogin.ts`). Remote `PW_BASE_URL` smoke against prod still needs that flag + seeded `@dlc.test` users if you rely on cookie login there.

---

## Screenshots

_Attach: one desktop + one mobile per critical route after Phase 1/5 completion._

---

## Console log archive

_Attach exported console logs per Phase 1 file and per browser profile._
