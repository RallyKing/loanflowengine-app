## Phase 18.8E — Pipeline overflow forensics

### Scroll ownership contract (unchanged)

| Surface | Vertical owner | Horizontal owner |
|---------|----------------|------------------|
| Hub `/pipeline` | `AppChrome` `<main data-app-main-scroll>` | Board: `[data-testid=pipeline-board-scroll]` (`overflow-x-auto touch-pan-x`) |
| File `/pipeline/[fileId]` | `[data-pipeline-workspace-scroll]` | Scroller `overflow-x-clip` only (per AGENTS.md) |
| Hub table / hierarchy | `<main>` | Row/cell internals; hierarchy list must not clip board |

`AppChrome` `<main>` uses `overflow-x-clip` by design for document-level bleed — **must not** add additional `overflow-x-hidden` / `overflow-x-clip` on pipeline content ancestors above the board scroller.

---

## Clipping audit (18.8E)

| Location | Rule (pre-18.8E) | Role | Action |
|----------|------------------|------|--------|
| `PipelinePageClient` root | `overflow-x-hidden` (removed 18.8D) | Accidental page clip | Stay removed |
| `OperationalContentReveal` | `overflow-x-clip` (removed 18.8D) | Masked board reachability | Stay removed |
| Hub hierarchy shell div | `overflow-x-clip` (removed 18.8D) | Masked table/board siblings | Stay removed |
| `PipelinePageClient` toolbar band | `overflow-x-clip` | Toolbar bleed only | **Removed 18.8E** |
| `PipelineHubHierarchyView` root | `overflow-x-clip` | Clipped wide hierarchy rows | **Removed 18.8E** |
| `PipelineFileWorkspaceShell` sheet | `overflow-x-hidden` (removed 18.8D) | Sheet-level mask | Stay removed |
| `PipelineBoardView` | `overflow-x-auto` + `min-w-max` inner | **Intended** horizontal scroller | Keep |
| `PipelinePageClient` board wrapper | `overflow-x-auto touch-pan-x` | **Intended** outer board scroller | Keep |
| `AppChrome` main | `overflow-x-clip` | Shell contract | Do not change in 18.8E |

---

## Overlay stacking

Destructive confirms: `DestructiveConfirmShell` → `layerZIndexStyle("MODAL")` (50) on portaled root with `isolate`.

Workspace inspectors / Vaul: remain below MODAL per layering map.

---

## Prevention

1. **Never** add `overflow-x-hidden` or `overflow-x-clip` on pipeline hub ancestors of `[data-testid=pipeline-board-scroll]`.
2. Board horizontal pan is owned by board wrapper + `PipelineBoardView` inner `min-w-max` grid.
3. File route: do not add second vertical scrollports; workspace scroll attribute remains canonical.
