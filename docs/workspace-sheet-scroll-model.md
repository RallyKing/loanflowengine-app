# Workspace sheet scroll model

**Governance:** See **`docs/governance/runtime-workspace-scroll-authority.md`** for the reconciled runtime summary (onboarding, reviews, drift prevention).

## Global app

- `html` / `body`: locked (no document scroll) in the signed-in shell.
- **`AppChrome` `<main>`**
  - **Default routes:** `data-app-main-scroll`, `overflow-y-auto`, primary vertical scroll.
  - **Pipeline file workspace:** `data-main-scroll-mode="workspace-delegated"`, `overflow-y-hidden`; flex child `overflow-hidden`.

## Pipeline file workspace

**Canonical scroll owner:** `[data-pipeline-workspace-scroll]` (`data-testid="pipeline-workspace-scroll"`).

- **MobileChromeProvider** uses `effectiveScrollEl = workspaceScrollEl ?? mainScrollEl` so compact/focus IO and optional scroll listeners attach to the workspace scroller on this route.
- **Sentinel** `data-dlc-main-compact-sentinel` stays **inside** the workspace scroller (first child) so intersection semantics remain consistent.

## Invariants

- Do not add a second full-height `overflow-y-auto` between `<main>` and the modular blocks for this route.
- Horizontal strips (tables) may use `overflow-x-auto` / `touch-pan-x` inside the scrollport.
- **Drawers** (tasks, lenders) remain portaled overlays with their own bounded `overflow-y-auto`.

## Deep linking / scroll-into-view

- Section `scroll-margin-top` targets the **workspace scroller** (see `globals.css`).
- `PipelineFileWorkspace` resets `scrollTop` on `workspaceScroller ?? main` when the file id changes.
