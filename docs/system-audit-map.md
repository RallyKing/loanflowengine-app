# System audit map (Direct Lending Connection)

**Snapshot date:** 2026-05-07. This document maps the platform at a high level and records **known weaknesses** and **duplicate or risky seams**. It is a discovery artifact, not a full security or performance certification.

## App Router (`lender-app/app/`)

There are **26** `page.tsx` entry points, including:

- Workspace: `/`, `/tasks`, `/lenders`, `/contacts`, `/pipeline` (+ file/deal/print/intake/library/licenses), `/ledger`, `/documents`, `/activity`, `/analytics`, `/settings`, `/print/ledger`, `/print/terms/[id]`
- Auth: `/sign-in`, `/sign-up`
- External: `/portal` (+ login, files, file, magic), `/share/[token]`

Layouts worth noting:

- Root `layout.tsx`: session gate, `AppChrome` when signed in, **auth shell** when signed out. Convex client mounting (see Stabilization fixes).
- `portal/layout.tsx`: header/footer shell; primary content wrapped in `<main>` for landmark parity with sign-in.

## Middleware (`lender-app/middleware.ts`)

- Non-public routes require workspace session cookie (except `PUBLIC_PREFIXES`).
- **Public**: `/sign-in`, `/sign-up`, `/api/auth/*`, static-ish prefixes, **`/portal`**, **`/share`**.

## Primary UI shell

- **`AppChrome`**: intended **single vertical scroll owner** for the workspace (`<main>` per project rules).
- **Task drawer / lender drawer**: overlay pattern; must not create competing scrollports with `<main>` (see `AGENTS.md` / project rules).
- **Pipeline / intake**: largest surface area for **nested overflow** and **sticky** interactions.

## Convex

- **Many** modules under `lender-app/convex/` (queries, mutations, actions, HTTP router-related code). Surface area includes: `pipeline`, `tasks`, `organizations`, `clientPortal`, `shareLinks`, `integrationJobs`, `webhookOutbound`, `contacts`, `lenders`, etc.
- Auth model: workspace auth is **Next cookie/session**; Convex JWT identity is not the primary gate for most workspace reads in the current model (see `convex/auth.config.ts` commentary).

## Blocks / registry

- `npm run validate:block-registry` validates modular pipeline blocks (13 blocks in last run).

## Shared state & data flows

- File-centric pipeline state, task lists, contacts, org scoping, portal sessions, share links by token.
- **Risk areas**: stale client state after offline/sync; large list rerenders without virtualization on heavy pages; org-scoped queries must stay consistent in Convex handlers.

## Testing surfaces

- **Core**: `npm run test:core` (82 cases) — logic/unit edge tests for pipeline/drawer behavior.
- **E2E**: Playwright under `lender-app/tests/` — smoke, auth, mobile, regression, visual, performance suites exist; not all run in every session.
- **Playwright local caveat**: `reuseExistingServer: !process.env.CI` means a **stale `next start`** can mask route changes unless you run with **`CI=true`** or restart the dev server after `next build`.

## Architecture weaknesses (non-exhaustive)

1. **Dual transport to Convex**: Browser WebSocket client vs Node `ConvexHttpClient` for server preloads — environments where SSR HTTP to Convex fails will show **degraded** share UX (explicit message) even when browser traffic might work.
2. **Signed-out Convex**: Previously, portal/share could mount hooks without a provider; now mitigated by a **single Convex provider** when `NEXT_PUBLIC_CONVEX_URL` parses (see stabilization report).
3. **Scroll ownership**: Highest bug risk on pipeline + drawers + mobile; requires ongoing verification, not one-time proof.
4. **Test matrix**: Full cross-browser (Edge, Safari, mobile WebKit) and prod smoke are **operator-driven**; CI does not replace manual prod verification.

## Duplicate or divergent systems

- Intake UI spans **legacy** and **v2** section components; share views must stay aligned with section allowlists (`shareSections`).
- Multiple integration paths (webhooks, jobs, outbound worker) — payload and idempotency must stay consistent for GHL/generic CRM goals.

## Performance hotspots (candidates)

- Pipeline workspace and task views with large joins.
- Lender tables and global search.
- Drawer-heavy renders (layout settings, suggestions).

## Missing / incomplete coverage

- No single automated suite covers **all** phases described in the stabilization brief (permissions matrix, every automation path, every integration, full mobile matrix).
- Production deploy verification requires **live** credentials and hosted Convex alignment.
