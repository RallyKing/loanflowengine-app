# Playwright guide (Direct Lending Connection)

## Quickstart

From `lender-app/`:

```bash
npm run build
npx playwright test
```

Load env: `.env.local` + `.env.testing` (see `.env.testing.example`).

## Ports

- `PW_TEST_PORT` — `next start` bind port (default **3005**)
- `PW_BASE_URL` — skip local server; hit staging/prod (read-only smoke only)

## Projects (browsers)

Configured in `playwright.config.cjs`:

- **chromium** — Desktop Chrome
- **webkit** — Desktop Safari
- **tablet** — iPad Pro profile
- **Mobile Chrome** / **Mobile Safari**
- **visual-desktop** / **visual-mobile** — screenshot baselines

Main projects ignore `tests/visual/**`; visual projects only run that folder.

## Auth

- **Primary:** `signInWorkspaceSession` → `APP_AUTH_*`
- **Persona:** `signInWithTestPersona(page, "org_owner")` → `E2E_*` env + seed

## Storage state bootstrap

```bash
npx tsx scripts/testing/bootstrap-playwright-auth.ts org_owner
PW_STORAGE_STATE=playwright/.auth/org_owner.json npm run test:e2e
```

## Common commands

See `package.json`: `test:e2e`, `test:mobile`, `test:smoke`, `test:visual`, `test:regression`, `test:performance`, `test:integrations`, `test:auth`.

## Updating screenshots

```bash
npx playwright test tests/visual --project visual-desktop --project visual-mobile --update-snapshots
```
