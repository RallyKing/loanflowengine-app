# Responsive system validation

**Date:** 2026-05-09

## Automation status

Full visual matrix (desktop, tablet portrait/landscape, mobile, foldable, ultrawide) was **not** executed end-to-end in this agent session (no long Playwright `--project` run with golden snapshots refreshed).

## In-repo tooling

| asset | purpose |
|-------|---------|
| `lender-app/playwright.config.cjs` | Defines `visual-mobile-pixel`, `visual-mobile-iphone14pro`, `visual-mobile-ipad`, etc. |
| `lender-app/tests/visual/mobile-shell.spec.ts` | Mobile shell screenshots after sign-in (requires `APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD`) |
| `lender-app/package.json` | `test:mobile`, `test:mobile:matrix` scripts |

## Recommended validation commands

With **local** stack (`npm run dev`) and **E2E credentials** set:

```bash
cd lender-app
npx playwright test tests/visual/mobile-shell.spec.ts --project=visual-mobile-pixel
npx playwright test tests/mobile --project="Mobile Chrome" --project="Mobile Safari"
```

## Viewport checklist (manual or Playwright)

| profile | width × height (indicative) | focus |
|---------|----------------------------|--------|
| Desktop | ≥ 1280 | Top nav, side rail, pipeline workspace width |
| Small laptop | ~ 1024 | Nav collapse, grid breakpoints |
| Tablet portrait | ~ 834 × 1112 | `app-main-scroll`, drawers |
| Tablet landscape | ~ 1112 × 834 | Split layouts, side sheets |
| Mobile portrait | ~ 390 × 844 | Bottom nav / touch targets |
| Mobile landscape | ~ 844 × 390 | Scroll ownership, sticky chrome |
| Foldable / narrow | 280–360 wide | No horizontal trap |
| Ultrawide | ≥ 1920 | Content max-width, no overstretch |

## UX rules to verify (from project standards)

- **Single scroll owner:** `AppChrome` `<main>` (`data-testid="app-main-scroll"` on key routes).
- **Task drawer / pipeline drawer:** overlay must not steal main scroll.
- **Touch hit zones:** primary actions ≥ 44px logical where applicable.

## Automated slice (2026-05-09)

| command | result |
|---------|--------|
| `npx playwright test tests/regression/regression-protection.spec.ts --project=chromium` (no `PW_BASE_URL`) | **3 passed** |
| Same file `--project="Mobile Chrome"` | **3 passed** |

These assert **`/system/health`** JSON and **`/api/auth/login`** error handling at **phone-scale** user agent.

Full visual snapshot matrix remains **recommended** (`tests/visual/mobile-shell.spec.ts`, `tests/mobile/**`).

