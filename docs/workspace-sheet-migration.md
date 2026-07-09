# Workspace sheet migration notes

## Removed / retired patterns

| Item | Why it conflicted |
|------|-------------------|
| Sticky file chrome driven by `<main>` scroll | File route `<main>` no longer scrolls; sticky + measured vars caused hybrid scroll bugs. |
| Scroll-margin rules coupling to `--header-height` / sticky measurement | Header is not sticky; cushion is a stable CSS token (`--pipeline-ws-chrome-cushion`). |
| “`<main>` is the only scroll owner” for file workspace | Replaced by delegated scroll (`data-pipeline-workspace-scroll`). |
| `ResizeObserver` loops / dynamic sticky height for file header | Layout thrash and CLS; snap header uses fixed `shrink-0` + optional transform. |

## What replaced it

- **`[data-pipeline-workspace-scroll]`** — registration via `registerPipelineWorkspaceScroll` in `MobileChromeController`.
- **`PipelineWorkspaceMobileVaulFrame`** — mobile-only Vaul `direction="top"` sheet with `snapPoints`, `modal={false}`, `dismissible={false}`, `handleOnly` (when motion allowed).
- **`data-vaul-no-drag`** on the workspace scroller — preserves vertical scrolling inside the drawer.
- **`WorkspaceSheetSnapContext`** — file chrome grid (`PipelineFileWorkspace` / shell) prefers Vaul snap over scroll IO when the context is present.

## Docs / code touchpoints

- `lender-app/components/PipelineFileWorkspaceShell.tsx`
- `lender-app/components/PipelineWorkspaceMobileVaulFrame.tsx`
- `lender-app/components/AppChrome.tsx` — `isPipelineWideShellRoute` + `overflow-y-hidden` on `<main>`
- **`lender-app/app/vaul-drawer.css`** — vendored Vaul drawer styles; upstream `vaul/style.css` v1.1.2 ships a typo (`[data-vaul-handle-hitarea]: {`) that breaks Next/cssnano, so we import this corrected file from `app/layout.tsx` instead of the package CSS entry.
