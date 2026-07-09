# Workspace sheet — testing report

**Generated:** 2026-05-07 (agent session).

## Automated

| Suite | Command | Notes |
|-------|---------|-------|
| Build | `npm run build` (lender-app) | Run after code changes. |
| Mobile workspace sheet specs | `playwright test tests/mobile/workspace-sheet` | See `workspace-sheet-*.spec.ts`. |
| Governance | `npm run verify:governance` | Includes manifest + QA gate. |

## New Playwright files

- `tests/mobile/workspace-sheet/workspace-sheet-mobile.spec.ts`
- `tests/mobile/workspace-sheet/workspace-snap-behavior.spec.ts`
- `tests/mobile/workspace-sheet/workspace-scroll-stability.spec.ts`
- `tests/mobile/workspace-sheet/workspace-safe-area.spec.ts`
- `tests/mobile/workspace-sheet/workspace-keyboard.spec.ts`

## Device projects

Added in `playwright.config.cjs`: **iPhone 15 Pro Max**, **Pixel 8 Pro** (custom viewport), **Galaxy Fold** (custom viewport), in addition to existing **iPad Pro 11** preset.

## Production verification (2026-05-07 session)

- **Vercel CLI:** deployment `dpl_s2yNmTodvg7sgoX9ffXBVscwUtJw` — build succeeded on Vercel; alias reported as `https://lownflowengine.com` (inspect URL in deploy output).
- **Manual:** confirm pipeline file route scroll + snap on a physical phone (not automated in this session).
