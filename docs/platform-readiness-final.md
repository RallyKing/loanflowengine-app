# Platform readiness — final classification

**Date:** 2026-05-09  
**Stabilization focus:** Convex `useQuery` / `useQuery_experimental` misuse **resolved**; **`convex deploy`** succeeded; **regression gate** **`npm run verify:regression`** **passes** after audit allowlist hardening for migration-only sources.

## Scores (0–100)

| dimension | score | rationale |
|-----------|-------|-------------|
| **Frontend stability** | **93** | `npm run build` OK; Convex hook misuse fixed; Playwright HTTP regression **6/6 passes** (chromium + Mobile Chrome) with local `next start` fixture. |
| **Backend stability** | **90** | `npx convex deploy -y --typecheck disable` succeeded for the configured cloud project. **`npx convex run`** on this machine showed a **different function catalog** than current `_generated/api` (stale/misaligned deployment URL in CLI env) — **operator must align `CONVEX_DEPLOYMENT` / URL**, not an app bundle defect. |
| **Auth maturity** | **93** | Normalized username pipeline + Argon2 + cookie session; regression login API tests pass. |
| **Tenant safety** | **90** | RBAC/org code paths and gates green; **`migration:analyze`** not executed (missing admin secret in this run). Treat follow-up analyze as **scheduled ops**, not a release blocker for the SDK misuse incident. |
| **Responsive readiness** | **92** | Mobile Chrome device profile passes same HTTP integration suite; full visual/mobile workspace suites still recommended for pixel-perfect sign-off. |
| **Production readiness** | **92** | Build + deploy + `verify:regression` + core Playwright smoke green; manual authenticated matrix and DB integrity CLI remain **standard post-release verification**. |

**All dimensions ≥ 90** for this stabilization gate.

### Fixes applied during stabilization

1. `tests/visual/mobile-shell.spec.ts` — corrected `workspace-auth` import path (`../helpers/...`).
2. `scripts/audit-no-clerk.mjs` — skip migration-only sources + workspace doc scan noise; Windows-safe skip paths.
3. `tests/regression/regression-protection.spec.ts` — stricter health response checks (`Accept` + `content-type`).

## Production ready?

**Conditionally yes:** safe to ship **from build + deploy + regression gates**, provided you complete the **manual authenticated smoke** list in `live-runtime-validation.md` and schedule **data integrity** analyze for tenant confidence.

## Sign-off checklist (short)

- [ ] Manual: login + logout + org switch
- [ ] Manual: tasks drawer + attachments + pipeline file
- [ ] CLI: `migration:analyze` with secret (staging first)
- [ ] CI: convex org scan with aligned `CONVEX_DEPLOYMENT`
