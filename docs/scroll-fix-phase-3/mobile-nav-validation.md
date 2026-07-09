# Mobile nav validation — Phase 3

## Automated

From `lender-app/`:

```bash
npm run build
npx playwright test tests/mobile/navigation/mobile-bottom-nav.spec.ts --project "Mobile Chrome" --project "Mobile Safari"
```

Broader regression when touching chrome:

```bash
npm run test:mobile
```

Align Playwright server with the active `.next` build (Phase 1 notes on CSS hash / `PW_*` env).

## Manual — `MobileBottomNav` (classic)

| Check | Expected |
|-------|-----------|
| Each link | Navigates; active styling correct; **`touch-manipulation`** avoids 300 ms tap delay / double-tap zoom issues. |
| Long page — scroll down | Focus mode: bar **translates off-screen**, **`opacity-0`**, **`aria-hidden=true`**, **no hits** (`pointer-events-none`). |
| Scroll toward top / small **`scrollTop`** | Bar returns; links clickable immediately (**`pointer-events-auto`** when visible). |
| Home indicator / gesture bar | Nav **`pb`** includes **`env(safe-area-inset-bottom)`**; content **`main`** keeps **reserved bottom padding** so list ends are not under the bar when visible. |
| Landscape | Nav **`pl`/`pr`** use **`env(safe-area-inset-left/right)`** so tiles are not under curved edges. |

## Manual — compact / focus semantics

| Check | Expected |
|-------|-----------|
| **`document.documentElement`** | **`data-dlc-mobile-compact`** / **`data-dlc-mobile-focus`** mirror compact state (e2e / diagnostics). |
| SaaS mobile menu open | Compact suspended while overlay open (**existing** `suspendCompact`). |

## Residual risks

- First client frame: external focus snapshot defaults **false** until provider effect runs—same class of hydration timing as before.
- **SaaS** workspace does not mount **`MobileBottomNav`** (classic only); validate **sidebar** + **main** padding separately on narrow widths.
