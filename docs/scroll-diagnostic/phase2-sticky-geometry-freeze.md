# Phase 2 — Sticky file chrome geometry freeze

## What changed (`PipelineFileWorkspaceShell.tsx`)

1. **Outer `<header>`** — No `mobileCompactTransition` / `mobileFocusChromeTransition`. Padding/border no longer switch on `compact`; always `border-border/70`, `max-sm:pt-[safe-area…]` + stable `bg` / snooze colors.
2. **`WorkspaceContentContainer`** (sticky chrome) — Fixed `pb-3 pt-3 sm:pb-4 sm:pt-4` (no compact branch).
3. **Inner chrome wrapper** — `max-md:scale-[0.94]`, `max-md:opacity-[0.97]` when compact, with **`transition-[transform,opacity]` only** (200ms). Compaction is visual-only; layout box of chrome content is unchanged by compact (transform does not reduce flow height).
4. **`useLayoutEffect` remeasure** — Depends on **`isSnoozed` only**, not `compact`. `ResizeObserver` unchanged; `--header-height` / `--pipeline-file-sticky-height` no longer churn on compact toggles.

## Manual QA

- iPhone Safari / Android Chrome: long momentum scroll on pipeline file; confirm sticky does not resize on compact and anchors still feel OK.
