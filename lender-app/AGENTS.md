# Agent instructions — how to add/update lenders from a Cursor prompt

The app is **Direct Lending Connection** (this repo or parent folder on disk may still be named e.g. “Lender List”).

## Convex backend sync

After you edit anything under `convex/` (new or renamed `tasks:*`, `lenders:*`, schema, etc.), the **running deployment** must include those functions or the client will error (e.g. “Could not find public function”).

- **Local:** Keep `npx convex dev` (or `npm run dev`) running from `lender-app/`; it pushes changes to the dev backend. If port `3210` is already in use, do not start a second instance—use the existing process, or stop it and run `npx convex dev` again.
- **Production / hosted URL:** From `lender-app/`, run `npm run convex:deploy:prod` so `https://…convex.cloud` matches the code in `convex/`.
- **One-shot push when no local backend:** `npm run convex:once` runs `convex dev --once` (fails if a local backend still holds the default port—stop it first or rely on the running `convex dev` to sync on save).

When the user asks you to "add a lender" or "update X's info" from a chat prompt, follow this exact procedure. Do **not** ask the user to copy/paste or run scripts — do it for them.

## Preferred path: Convex MCP `run`

**Authenticated browser sessions** use JWT via `ConvexProviderWithAuth` — MCP/CLI cannot spoof `memberUserKey`.

For agent-driven lender writes, prefer **`lenders:operatorUpsert`** (gated by `DATA_MIGRATION_ADMIN_SECRET` on the Convex deployment + `APP_AUTH_ORGANIZATION_ID` / `APP_AUTH_USER_KEY` on Convex):

Call the `run` tool on the `user-convex` MCP server with:

- `functionName`: `"lenders:operatorUpsert"` (single) — or `"lenders:bulkUpsert"` with org scope when JWT tooling is available
- `args`: lender fields plus `operatorSecret` (from local `DATA_MIGRATION_ADMIN_SECRET`, never commit)
- `projectDir`: the absolute path to `lender-app/`

Example operator upsert:

```json
{
  "projectDir": "c:/Users/joshu/OneDrive/Desktop/Lender List/lender-app",
  "functionName": "lenders:operatorUpsert",
  "args": {
    "operatorSecret": "<DATA_MIGRATION_ADMIN_SECRET>",
    "company": "Acme Capital Partners",
    "contactName": "Jane Doe",
    "titleRole": "Director of Originations",
    "phone": "(215) 555-0199",
    "email": "jane@acmecapital.com",
    "primaryNiche": "Working capital",
    "programs": "Revenue-based financing, line of credit",
    "statesServed": "All 50 states",
    "fundingAmountMin": "$50,000",
    "fundingAmountMax": "$2,000,000",
    "notes": "Fast decisions; prefers B2B SaaS."
  }
}
```

`operatorUpsert` is idempotent — same company+email updates the record.

For in-app authenticated upsert (`lenders:upsert`), the signed-in user JWT must match `memberUserKey`; pass `organizationId` + `memberUserKey` from the workspace session only.

For multiple lenders at once via seed script, use `scripts/seed.mts` (passes org scope from `.env.local`) or `lenders:bulkUpsert` with `organizationId`, `memberUserKey`, and `records`.

## Schema reference

The required field is `company`. All others are optional strings. Leave `entityType` empty and the server will auto-classify it. Leave `lastUpdated` empty and the server fills today's date.

See the full field list in `lib/schema.ts` (exported as `LENDER_FIELDS`).

## Fallback path (if MCP `run` is unavailable)

Use the Shell tool from the `lender-app/` directory:

```powershell
npx tsx scripts/add-lender-cli.mts '{"company":"Acme Capital","email":"jane@example.com"}'
```

Or `npx convex run lenders:operatorUpsert` with `operatorSecret` plus lender fields (secret must match Convex `DATA_MIGRATION_ADMIN_SECRET`).

## After adding

Confirm success to the user and summarize what happened (inserted vs. updated). Do not show the raw JSON response.

---

# Layout invariants — DO NOT VIOLATE

**Authoritative reconciliation:** `docs/governance/runtime-workspace-scroll-authority.md` (pipeline file: delegated scroll, non-scrolling `<main>`, Vaul, overlays). This section mirrors that contract for implementers working in `lender-app/`.

The application uses a **fixed-shell, single-scroll-container** pattern per route (see below). Breaking the contract reintroduces the "cannot scroll to bottom of file drawer" / "page won't scroll on mobile" / "header scrolls away" classes of bugs that were eliminated in the Phase 1–10 stabilization.

## The contract

1. **`html` and `body` are locked.**
   - `globals.css` sets `html, body { height: 100%; overflow-x: clip; overflow-y: hidden; }`.
   - `app/layout.tsx` sets the `<body>` className to `h-dvh overflow-hidden …`.
   - The body **never scrolls** under the signed-in app shell.
   - The auth route is the documented exception: `<body data-shell="auth">` re-enables `overflow-y: auto` so a tall sign-in form is reachable.

2. **`<main>` inside `AppChrome` is the default vertical scroll container for authenticated route content** (pipeline **file** workspace is the documented exception — see below).
   - Canonical navigation config: `lib/navigation/navigationCatalog.ts` (routes, icons, pipeline group), resolved with `lib/navigation/navigationResolve.ts` and optional `components/navigation/NavigationConfigProvider.tsx` (Convex + localStorage). Tablet strip: `components/navigation/TabletContextNav.tsx`.
   - It uses `flex-1 min-h-0 overflow-y-auto overflow-x-clip overscroll-contain` and `touch-scroll-y` on most routes; on **`/pipeline/[convexFileId]`** it uses `overflow-y-hidden` and the workspace sheet scrolls inside `[data-pipeline-workspace-scroll]`.
   - Header, desktop sidebar rail, and mobile bottom-nav are **siblings** of `<main>` and stay fixed relative to the viewport (bottom nav uses transform; see `MobileBottomNav`).
   - Pages must not add **route-level** `overflow-y-auto` wrappers that compete with the **active** scroll owner (`<main>` **or** `[data-pipeline-workspace-scroll]`).
   - Pages must not add their own `<html>`/`<body>`-level scroll wrappers (no `min-h-screen` / `h-screen` on top-level page wrappers — that is the shell's job).

3. **Approved bounded vertical scroll (exceptions only):**
   - **`PipelineFileWorkspace` (`/pipeline/[fileId]`):** **`[data-pipeline-workspace-scroll]`** owns vertical scrolling on the file route; **`AppChrome` `<main>`** is `overflow-y-hidden` (delegated scroll). Snap header is **`shrink-0`** above the scroller (not sticky). Below **`md`**, **`PipelineWorkspaceMobileVaulFrame`** wraps the sheet with **Vaul** snap points. Workspace body wrapper stays `overflow-x-clip` only — no competing full-height `overflow-y` bands. File-scoped Convex **`useQuery`** wiring for this screen lives in **`hooks/usePipelineFileWorkspaceData.ts`** (orchestrator pulls from it; avoid re-subscribing elsewhere for the same args).
   - **`/pipeline` (hub):** Filters + table are in **`<main>` flow**. The table uses **`overflow-x-auto`** (horizontal) with `max-md:touch-pan-x` — **no** `overflow-y-auto` wrapper around the table; table header `sticky top-0` is relative to **`<main>`**.
   - **`/activity`, `/contacts` (list column):** Feed and contact list scroll with **`<main>`** — no `flex-1 overflow-y-auto` list shell.
   - **`LenderDrawer` / `TaskDrawer`:** **`RecordInspectorShell`** (`components/RecordInspectorShell.tsx`) — canonical enterprise inspector: unified scrim, **`--dlc-elevation-4`**, Escape + focus restore, **desktop** right sheet (`animate-slide-in-right`, optional **`resizable`** width persisted in `localStorage`), **mobile** bottom sheet (`animate-slide-in-up`, safe-area). Thin alias: `components/SideSheet.tsx`. Compose with subdivisions **`RecordInspectorHeader`**, **`RecordInspectorBody`** (sole vertical scrollport: `min-h-0 flex-1 overflow-y-auto overscroll-contain`), optional **`RecordInspectorFooter`**, **`RecordInspectorSkeleton`**. The docked `<aside>` is **`flex flex-col overflow-hidden`**; do **not** put `overflow-y-auto` on the aside — only on **`RecordInspectorBody`** — or nested scroll regressions return.
   - **Modals/dialogs:** `max-h-[min(90dvh,…)] overflow-y-auto` on the dialog panel body.
   - **Small capped regions:** e.g. `max-h-64` activity list on contact detail, inline `max-h-[min(70vh,520px)]` errand block on tasks — bounded auxiliary lists, not full-page scroll owners.

4. **Flex chains that contain an approved nested scroll surface need `min-h-0` (and often `min-w-0`).**
   - For **drawer aside / modal body**: outer flex parent needs `min-h-0`; the scroll child needs **`min-h-0`** + **`overflow-y-auto`**.
   - Do **not** use this pattern to add a **full-page** vertical scroller inside `<main>`.

5. **Modals/dialogs scroll internally.** Use `max-h-[min(90vh,…)] overflow-y-auto overscroll-contain` on the modal panel, never let a modal grow past the viewport without internal scroll. Prefer **`RecordInspectorShell` / `SideSheet`** when the pipeline or list should stay visible; keep true blocking confirms as modal dialogs until reviewed.

## Quick checklist for new layouts

When you add a new page or surface, verify:

- [ ] Top-level wrapper does **not** use `min-h-screen` or `h-screen` — `<main>` already gives you the viewport.
- [ ] Do **not** add **route-level** `overflow-y-auto` / `flex-1 overflow-y-auto` around primary page content — let **`<main>`** scroll (exceptions: drawers, modals, **explicit** `max-h-*` auxiliary lists only).
- [ ] Wide tables: **`overflow-x-auto`** only; on mobile prefer **`touch-pan-x`** so vertical pans stay on `<main>`.
- [ ] Any flex parent of an **approved** nested scroll (drawer/modal) carries `min-h-0` (and `min-w-0` if needed).
- [ ] Modals cap height with `max-h-[min(90vh,…)]` and scroll internally.
- [ ] Nothing applies `position: sticky` to the entire drawer header bar — pin only the title row, let body content scroll under it.
- [ ] Mobile breakpoint (`<md`) collapses sidebars into a hamburger drawer; horizontal-scrolling tables use `-mx-* overflow-x-auto … sm:mx-0 sm:overflow-visible` as needed.
- [ ] Mobile pipeline scroll: run `npm run test:e2e:mobile-pipeline-scroll` and **`npm run test:mobile`** (Playwright **Mobile Chrome** + **Mobile Safari**). For release sign-off, still verify on a physical **Android Chrome** + **iPhone Safari** device.
- [ ] User-draggable vertical scroll on the **active owner** uses **`touch-scroll-y`**: **`<main>`** on default routes; **`[data-pipeline-workspace-scroll]`** on the pipeline file route (`globals.css` `@layer utilities`). Horizontal table strips use pan-x as above.

## Forbidden patterns (will trip layout regressions)

- **Route-level `overflow-y-auto`** wrapping primary authenticated content (full-width list/table shells) — competes with `<main>` and breaks `MobileChromeController` / `ci-mobile-scroll`.
- `overflow-y-auto` on a flex child **without** `min-h-0` when that nested region is **intended** to scroll (silent no-op when content is taller than the parent) — fix `min-h-0` or remove the nested scroll.
- `<aside>` inside `fixed inset-0 flex` without a bounded height on the scrollport: **`h-dvh max-h-dvh min-h-0 overflow-y-auto`** on lender/task **drawer** asides.
- Adding `overflow: auto` to `<body>` or `<html>` in the signed-in shell — breaks the locked-body contract.
- `position: sticky` on the entire drawer header (use it only on the title bar; everything else scrolls).
- Multi-screen-tall modals that rely on the page scroll bar (modals must scroll inside themselves).

## Deploy to production (Vercel CLI — not GitHub)

**Do not use GitHub or `git push` for production.** This copy has **no `origin` remote**; Vercel should have **no Git provider** linked. Ship only with **`npm run deploy:prod`** (and Convex when needed). See **`docs/deployment-workflow.md`**.

1. **Full release (build + prod):** `npm run deploy:prod`
2. **Convex changed:** `npm run convex:deploy:prod` (required when `convex/` changes).
3. **Prod deploy only** (after a successful local `npm run build`): `npm run deploy:vercel`

**Headless / CI:** set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, then run the same npm scripts.

Checklist, env vars, rollback, and disconnecting Git: **`docs/deployment-workflow.md`**.  
Agent rule: **`.cursor/rules/vercel-direct-deploy.mdc`** (always apply).
