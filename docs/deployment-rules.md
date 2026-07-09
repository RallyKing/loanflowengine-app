# Deployment rules (mandatory)

**Status:** Permanent engineering policy for Direct Lending Connection / this repository.  
**Applies to:** Every agent session, every refactor, every user-facing release path.

---

## Authority

- Production frontend hosting is **Vercel**, deployed **via CLI from this workspace** — not via implicit GitHub → Vercel coupling as the primary source of truth.
- Canonical overlap with broader policy: `docs/ai-development-rules.md`.

---

## Non‑negotiable workflow

1. **`npm run build`** — MUST pass from `lender-app/` before any production deploy. Fix TypeScript, lint blockers, and build failures first.
2. **Automated QA gate** — Before declaring user-facing work complete, run the governance gate (see below). Mobile coverage is **mandatory** for UI/layout changes.
3. **Deploy to Vercel production** — Use **`npm run deploy:prod`** from `lender-app/` (runs build + `vercel deploy --prod --yes`). Do **not** rely on “GitHub will deploy eventually” as the only verification path.
4. **Convex** — When `convex/` or backend functions consumed by the app change, run **`npm run convex:deploy:prod`** (or project‑documented equivalent) as required for backend parity.
5. **Post‑deploy verification** — MUST smoke-check production: login, pipeline, tasks, contacts, lenders, **mobile scroll**, overlays/drawers if touched. Never assume prod ≡ local.

---

## What “deploy” means here

| Command (cwd: `lender-app/`) | Purpose |
|------------------------------|---------|
| `npm run build` | Production Next.js build — required before deploy |
| `npm run deploy:prod` | Build + Vercel production deploy |
| `npm run deploy:vercel` | Vercel production deploy only (use when build already verified) |
| `npm run qa:governance` | Single build + mobile Playwright (core pair) + desktop Chromium smoke — **pre‑complete gate** |
| `node scripts/run-mobile-prod-playwright.mjs https://<host>` | Mobile smoke against **production URL** after deploy |

---

## GitHub vs Vercel

- **Do not** treat GitHub Actions or git pushes as a substitute for intentional CLI deploy when shipping product changes.
- CI may run tests; **human/agent ownership** of production still follows: build → gate → **explicit** `deploy:prod` when behavior should be live.

---

## Skip conditions (explicit only)

- **Docs-only** or **local tooling-only** changes may skip deploy — state that explicitly in the session summary.
- Everything that affects runtime UX, API routes the app calls, Convex schema/functions used by the app, auth, or middleware follows the full workflow.

---

## Secrets and CI

- Playwright smoke/mobile suites expect **`APP_AUTH_USERNAME`** / **`APP_AUTH_PASSWORD`** (and optional encrypted storage per `docs/testing/testing-credentials.md`) for authenticated paths.
- Set **`REQUIRE_GOVERNANCE_AUTH=true`** in CI when merges must fail if credentials are missing (see `lender-app/scripts/governance-qa-gate.mjs`).

---

## Enforcement checklist

Before marking a shipping task **done**:

- [ ] `npm run build` succeeded (`lender-app/`).
- [ ] `npm run qa:governance` succeeded (or equivalent documented substitute with mobile + desktop smoke).
- [ ] `npm run deploy:prod` succeeded for user-facing changes.
- [ ] Production smoke performed (including mobile scroll).
- [ ] Docs/tooling-only work explicitly labeled if deploy was skipped.

---

*This document is canonical for deployment policy; update `docs/ai-development-rules.md` cross‑references if the workflow changes.*
