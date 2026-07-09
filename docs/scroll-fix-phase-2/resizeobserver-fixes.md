# ResizeObserver fixes — Phase 2

## Single observer (pipeline file)

**Only** `PipelineFileWorkspaceShell` registers a `ResizeObserver`. It watches the **sticky file chrome** `<header>` (border-box) to drive:

- `--header-height`
- `--pipeline-file-sticky-height`

on `[data-pipeline-file-workspace-shell]`, consumed by `globals.css` for `scroll-margin-top` on workspace sections.

AppChrome, `MobileChromeController`, and bottom nav **do not** attach ResizeObservers.

## Loop prevention (existing + Phase 2 reinforcement)

1. **rAF coalescing** — observer callbacks schedule **one** `requestAnimationFrame` per burst; duplicate frames cancel the previous pending callback.
2. **Commit gate** — `commitStickyChromeHeight` ignores changes smaller than **1 px** vs `lastCommittedHeightRef` to avoid subpixel churn → React state → style var → layout ping.
3. **`startTransition`** — height state updates are non-urgent and stay off the critical scroll path.
4. **Explicit `box: "border-box"`** — `ro.observe(el, { box: "border-box" })` for stable measurement semantics across engines.
5. **Frozen sticky geometry on mobile** — compact mode no longer changes **padding** on the sticky file header (Phase 2 sticky doc), so observer should **not** fire purely from compact **visual** transforms on the inner chrome (transform does not change layout box of the outer header).

## Sync paths (still gated)

- **`resize`**: synchronous `commitStickyChromeHeight` (same ≥1 px gate).
- **`isSnoozed`**: `useLayoutEffect` re-measure when snooze banner changes real chrome height.

## If `--header-height` still drifts

Check for:

- New **padding/margin** on the sticky header tied to scroll or compact state.
- **Fonts** loading after paint (one-time jump; not an observer loop).
- Third-party widgets altering DOM **inside** the measured header.
