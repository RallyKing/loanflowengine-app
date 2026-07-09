# Phase 3 — ResizeObserver map & stabilization

## Step 1 — Repo scan (`ResizeObserver` string)

| Area | Present? | File |
|------|----------|------|
| AppChrome | **No** | — |
| MobileBottomNav | **No** | — |
| MobileChromeController | **No** | — |
| PipelineFileWorkspaceShell | **Yes** | Sticky file `<header>` only |

**Mutations:** `setStickyChromeHeightPx` → inline `--header-height` / `--pipeline-file-sticky-height` on `[data-pipeline-file-workspace-shell]` → `globals.css` `scroll-margin-top` on sections.

**Rerender:** Shell component only (batched via `startTransition`).

## Steps 2–4 — Implemented guards

- **rAF coalescing:** each RO burst collapses to one `requestAnimationFrame` callback per frame (cancel + reschedule).
- **Equality:** skip commit if height changed **&lt; 1px** vs last commit (unless `force`).
- **Force paths:** initial mount, `window.resize`, `isSnoozed` → immediate `commitStickyChromeHeight` (still **≥1px delta** vs last commit unless first paint).
- **Non-blocking React:** `startTransition` wrapping `setStickyChromeHeightPx`.
- **Static mobile:** combined with Phase 2, compact no longer resizes the sticky box; RO should not churn on scroll-linked compact; subpixel noise suppressed by 1px gate.
