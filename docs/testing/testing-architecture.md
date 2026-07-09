# Testing architecture

## Goals

- **Playwright** as the primary E2E driver (`lender-app/playwright.config.cjs`)
- **Deterministic seed** via `convex/testingSeed.ts` + `npm run seed:test-data`
- **Multi-persona auth** when `APP_AUTH_E2E_USERS_ENABLED=true` (see `lib/testing/resolveE2ELogin.ts`)
- **Layout invariants** preserved — see `lender-app/AGENTS.md` (single scroll owner, bounded drawers)

## Directory layout (`lender-app/tests/`)

| Path | Role |
|------|------|
| `tests/e2e/` | Broad regression + smoke specs (migrated from legacy `e2e/`) |
| `tests/mobile/` | Mobile-only gates (scroll / chrome) |
| `tests/regression/` | Focused flows (e.g. tenant isolation) |
| `tests/integrations/` | HTTP / Convex HTTP surface checks |
| `tests/performance/` | Optional timing budgets (`PERF_BUDGET_MS`) |
| `tests/visual/` | Screenshot baselines (`visual-*` projects) |
| `tests/auth/` | Auth API contracts |
| `tests/helpers/` | Session helpers (`workspace-auth.ts`) |
| `tests/workflows/` | Reusable step libraries for agents |
| `tests/auth/*.enc` | Optional encrypted Playwright storage blobs (see crypto script) |

## Environment loading

Playwright merges **` .env.local`** then **`.env.testing`** into `process.env` before worker startup.

## Encrypted Playwright sessions

1. Generate a 32-byte key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set `TEST_SESSION_ENCRYPTION_KEY` (64 hex chars) in CI secrets
3. `node scripts/testing/crypto-auth-state.mjs encrypt <state.json> tests/auth/<role>.enc`
4. At run time, `playwright.config.cjs` decrypts `*.enc` into `playwright/.auth/*.json` when the key is present
5. Point Playwright: `PW_STORAGE_STATE=playwright/.auth/org_owner.json`

Plain `storageState` JSON is **gitignored** under `playwright/.auth/`.

## Orchestration

- **Local:** `npm run dev` / `npm run build && npx next start` on `PW_TEST_PORT` (default `3005`)
- **Remote:** `PW_BASE_URL=https://…` skips `webServer` in Playwright; use with read-only smoke creds only
- **CI:** set `CI=1` for stricter Playwright flags; pin workers as needed

## AI agent compatibility

Stable selectors: prefer **`data-testid`** (see `docs/testing/data-testid-conventions.md`). Reuse `tests/workflows/*` for composed flows.

## Session refresh

Workspace cookies use **`SESSION_TTL_MS`** (~30d). Refresh by re-running `scripts/testing/bootstrap-playwright-auth.ts` or logging in again through `/api/auth/login`.
