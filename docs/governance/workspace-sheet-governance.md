# Workspace sheet governance (pipeline file routes)

**Status:** Binding for `/pipeline/[convexFileId]` and any successor “file workspace” routes.

**Authoritative overview:** **`docs/governance/runtime-workspace-scroll-authority.md`** — reconciles all scroll/sheet mental models (read before changing shell or tests).

## Canonical model

Pipeline file workspace is a **persistent workspace sheet**, not a traditional document-scrolling page.

- **Scroll owner:** `[data-pipeline-workspace-scroll]` inside `PipelineFileWorkspaceShell` / `PipelineWorkspaceMobileVaulFrame`.
- **`AppChrome` `<main>`** on these routes is a **non-scrolling** flex shell (`overflow-y-hidden`, `data-main-scroll-mode="workspace-delegated"`).
- **Mobile snap:** **[Vaul](https://vaul.emilkowal.ski/)** (`PipelineWorkspaceMobileVaulFrame`) provides snap points — do not replace with ad hoc `scrollTop`-linked layout or `ResizeObserver` height feedback loops.

## Overlays on the file route

- **Task/lender inspectors** (`RecordInspectorShell`) are **fixed overlays** with their **own** bounded vertical scroll — they **do not** become the workspace scroll owner and **do not** re-enable `<main>` scrolling.
- **Modals** remain height-capped internal scrollers per `scroll-architecture-rules.md`.

## Prohibited

- Competing **`overflow-y-auto`** bands that own vertical scroll for primary file content.
- **Sticky file chrome** tied to `<main>` scroll on this route (snap header is `shrink-0` above the scroller).
- **`compactChrome` / scroll-linked** workarounds that mutate grid rows, padding interpolation, or header height via `ResizeObserver` for file chrome.
- **Transform-only “fixes”** that resize header layout every frame from scroll position without snap discipline.

## Required

- **Single** vertical scrollport for modular blocks: `[data-pipeline-workspace-scroll]` with `data-vaul-no-drag` so drag-to-snap does not fight content pans.
- **Desktop:** integrated layout — no floating modal drawer over the operational surface; Vaul frame is bypassed at `md+`.
- **Material motion:** prefer standard easing/durations; respect `html[data-reduce-motion="true"]` (including Vaul transitions).
- **Tests:** extend Playwright `tests/mobile/workspace-sheet/` when changing scroll ownership or snap behavior; do not assume **`app-main-scroll`** is the vertical owner on **file** routes.

## References

- `docs/governance/runtime-workspace-scroll-authority.md`
- `docs/workspace-sheet-architecture.md`
- `docs/workspace-sheet-scroll-model.md`
- `docs/scroll-architecture-rules.md`