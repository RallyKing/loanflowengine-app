# Phase 18.8H — Pipeline containment map

## Scroll ownership (vertical)

| Node | Attribute | Owner |
|------|-----------|--------|
| `body` | `overflow: hidden` | App shell lock |
| `[data-app-main-scroll]` | `data-scroll-owner="app-main"` | Default route scroll |
| `[data-pipeline-workspace-scroll]` | workspace file route | Delegated file workspace scroll |
| `[data-pipeline-hub-list]` | hub hierarchy list | **No** nested `overflow-y`; uses main scroll |

## Clipping parents (horizontal / truncation)

| Node | `data-clipping-parent` | Purpose |
|------|------------------------|---------|
| `[data-pipeline-page-root]` | `pipeline-page` | Page flex boundary |
| `[data-pipeline-hub-list]` | `pipeline-hub-list` | Hub table/hierarchy shell |
| `[data-pipeline-hub-hierarchy]` | `pipeline-hub-hierarchy` | Client/project tree |

Row truncation uses `min-w-0` + `truncate` on **primary/meta**, not on action rail.

## Overlay layer (must be outside map above)

| Node | `data-layer` | Notes |
|------|--------------|-------|
| `#dlc-global-overlay-root` | `global-overlay` | Body child; `pointer-events: none` on host, auto on children |
| `[data-destructive-confirm-root]` | `destructive-confirm` | Fullscreen scrim + panel |

## Dev inspection

```js
// After opening delete confirm
window.__DLC_CONFIRM_DEBUG__?.inspect()
window.__DLC_CONFIRM_DEBUG__?.mapContainment()
```

Expected:

- `mountParent.isGlobalOverlayRoot === true`
- `mountParent.isRowActionRail === false`
- `computedWidth` ≥ `520px`
- `nearestOverflowAncestor` should be `null` or only `#dlc-global-overlay-root` / `body`

## Known acceptable overflow

- `AppChrome` main: `overflow-x-clip` — clips page bleed, must **not** wrap global overlay root
- Toolbar segmented controls: `overflow-hidden` on **button groups** only (not hierarchy rows)
- Virtualized hub lists: `transform: translateY` on inner rows — must not host confirm DOM (triggers only)
