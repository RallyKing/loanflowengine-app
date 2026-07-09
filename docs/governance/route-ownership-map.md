# Route ownership map

**Extend per new route.** Default: signed-in app uses `AppChrome` with **`AppChrome` `<main>`** as vertical scroll owner.

**Exception:** Pipeline **file workspace** (`/pipeline/[convexFileId]`) uses **delegated** **`[data-pipeline-workspace-scroll]`** — `<main>` does **not** scroll file content. See **`docs/governance/runtime-workspace-scroll-authority.md`**.

| Route pattern | Layout owner | Scroll owner | Loading | Auth | Mobile notes |
|---------------|--------------|--------------|---------|------|--------------|
| `/sign-in`, `/sign-up` | Minimal auth layout | Page / form (not app shell) | Route | Public | Full viewport forms |
| `/tasks` | `AppChrome` | `<main>` | Route | Session | Bottom nav (classic) |
| `/contacts` | `AppChrome` | `<main>` | Route | Session | |
| `/lenders` | `AppChrome` | `<main>` | Route | Session | |
| `/pipeline` | `AppChrome` | `<main>` (hub table horizontal only) | Route | Session | Wide shell classes |
| `/pipeline/[convexFileId]` (file workspace) | `AppChrome` + `PipelineFileWorkspaceShell` | **`[data-pipeline-workspace-scroll]`** — `<main>` is `overflow-y-hidden` (not the file body scroller) | Route + suspense | Session | **`PipelineWorkspaceMobileVaulFrame`** below `md`; see **`runtime-workspace-scroll-authority.md`** |
| `/activity`, `/analytics`, `/ledger`, `/documents`, `/settings` | `AppChrome` | `<main>` | Route | Session | |
| `/portal/*` | Portal shell | Portal `<main>` variant | Route | Portal grant | Constrained nav |
| `/api/*` | N/A | N/A | N/A | Route-defined | N/A |

---

## Caching

- Next.js defaults per route; document `dynamic`, `revalidate`, or `fetch` cache choices in the route file when non-default.

---

## Related

- `route-ownership-policy.md`
- `docs/scroll-architecture-rules.md`
- `runtime-workspace-scroll-authority.md`
