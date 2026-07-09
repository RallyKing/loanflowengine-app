# Workspace sheet — performance report

**Generated:** 2026-05-07 (agent session).

## Design goals

- **60fps scrolling** on `[data-pipeline-workspace-scroll]` — avoid `scroll` + `setState` loops on the hot path; `MobileChromeController` uses `IntersectionObserver` with debounced updates on mobile for sentinel-driven compact mode.
- **Compositor-friendly chrome** — `transform` / `opacity` on md-down shell chrome, not `height` / `margin` animations.
- **No ResizeObserver feedback** on file header height driving padding or snap.

## Vaul

- Drawer root uses **`transform`** for snap translation (library default).
- **`data-vaul-no-drag`** on the scrollport reduces drag contention with content pan.
- **`snapToSequentialPoint`** enabled to avoid velocity skipping intermediate operational states when undesirable.

## Follow-up profiling

- For regressions, capture Chrome performance panel / Playwright trace on `tests/mobile/workspace-sheet/workspace-scroll-stability.spec.ts`.
