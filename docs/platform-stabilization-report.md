# Platform stabilization report

**Date:** 2026-05-07  
**Scope:** Engineering pass focused on **real defects found in this session**, **verification runs**, and **honest remaining risk**. This is not a certification that every workflow in the original 12-phase checklist was executed end-to-end.

## Executive summary

Stabilization work in this iteration concentrated on:

1. **Public routes + Convex provider** so `/portal` and `/share` work without a workspace cookie.
2. **Share link UX**: server-side resolution of terminal outcomes (invalid / revoked / expired / bad sections) where possible, with a clear fallback when SSR cannot reach Convex.
3. **Portal layout**: `<main>` landmark for accessibility and smoke tests.
4. **Playwright smoke** alignment with middleware (sign-in wall) and resilient assertions for share error copy.
5. **E2E reliability**: document that **local** Playwright should use `CI=true` (or restart `next start`) after `next build` so `reuseExistingServer` does not serve stale bundles.

## Issues discovered

| Area | Finding |
|------|---------|
| Root layout | Signed-out tree did not mount `ConvexClientProvider` while `/portal/login` and `/share/*` used Convex hooks → broken or stuck loading. |
| Middleware | `/portal` and `/share` must be public; already present in repo; smoke tests updated for auth wall behavior. |
| Share page | Client-only `useQuery` could remain `undefined` in automation (WebSocket vs HTTP). SSR `preloadQuery` may fail in some dev/proxy environments. |
| Portal layout | Content lived in a `<div>`, not `<main>` → smoke “320px overflow” expected `main`. |
| Playwright | Stale server reuse could hide updated share markup; `getByTestId` on RSC output was unreliable in practice. |

## Issues fixed (code)

- **`lender-app/app/layout.tsx`**: When `parseConvexPublicUrl` is OK, wrap **both** signed-in and signed-out trees in **one** `ConvexClientProvider`; duplicate inner provider removed. Preconnect for Convex runs whenever URL is valid, not only when signed in.
- **`lender-app/app/share/[token]/page.tsx`**: `preloadQuery` + `preloadedQueryResult` with explicit `url` and `skipConvexDeploymentUrlCheck`; render **server** messages for terminal link states; try/catch with user-visible fallback if Convex HTTP from Node fails.
- **`lender-app/components/intake/ShareView.tsx`**: Split **preloaded** vs **live** query paths (hooks-safe) for valid links when preloaded payload is passed.
- **`lender-app/app/share/[token]/ShareViewClient.tsx`**: Forwards optional `preloaded` to `ShareView`.
- **`lender-app/app/portal/layout.tsx`**: Primary column wrapped in `<main>`.
- **`lender-app/tests/e2e/smoke.spec.ts`**: Public vs signed-in expectations; share assertion uses `body` text match for invalid vs SSR-degraded message; portal uses `main`.

## Verification performed (this session)

| Command | Result |
|---------|--------|
| `npm run build` (`lender-app`) | Success (existing ESLint hook warnings only). |
| `npm run test:core` | **82** passed. |
| `npm run validate:block-registry` | **13** blocks OK (prior run in session arc). |
| Playwright `tests/e2e/smoke.spec.ts` + `tests/auth`, `--project chromium`, **`CI=true`** | **17** passed, **1** skipped (hosted-only HTTP case). |

Not run in this session as a full gate: webkit, Mobile Chrome/Safari projects, visual/perf suites, `npm run deploy:prod`, live production smoke.

## Remaining risks

- **SSR → Convex** from the Next.js server may fail in restrictive networks; users see “Unable to reach the server for this share link” instead of the precise invalid-token message. Mitigation: ensure deployment URL is reachable from Node (correct `.convex.cloud` vs HTTP-only hosts, firewall, VPN).
- **Workspace scroll/drawer** regressions require periodic **manual** mobile checks per project rules.
- **Permissions / org isolation**: needs dedicated audit (not re-run exhaustively here).
- **Automations / webhooks**: HTTP smoke validates rejection of empty webhook; full workflow coverage remains manual or integration-suite scoped.

## Recommendations

1. Run **`npm run test:smoke` with `CI=true`** locally after meaningful Next changes, or turn off server reuse when iterating on routes.
2. After material UI changes, run **`npm run build`** then **production smoke** (login, pipeline, tasks, portal, share, mobile scroll) per `docs/ai-development-rules.md`.
3. If share SSR errors are common in an environment, add observability (structured log of Convex HTTP failures) without logging tokens.

## Deployment

No production deploy was executed from this agent session. Use `npm run deploy:prod` and Convex deploy when the operator is ready; then repeat smoke on the live URL.
