# Phase 18.8H — Overlay root cause analysis

**Date:** 2026-05-28

## What the screenshot actually proved

The delete UI was **not** suffering from insufficient `max-width` on a modal token. It was rendered as a **block-level confirm panel inside the hierarchy row action column**, inheriting:

- ~9rem (or less) flex column width from `.hub-row-action-rail`
- parent `overflow` / `min-w-0` shrink chain
- no viewport-level fixed positioning relative to workspace

Symptoms (word-stacked impact copy, clipped footer, vertical strip on the right) are **flex-as-child** symptoms, not centered-overlay symptoms.

## Root cause chain (PF-H1 → PF-H4)

| ID | Cause | Why prior phases failed |
|----|--------|-------------------------|
| **PF-H1** | `{deleteOpen && <OperationalConfirmDialog />}` mounted under row / settings / workspace DOM | 18.8D–G portaled the shell but left **React ownership** and some call sites inline; any portal timing/hydration edge re-exposed inline layout |
| **PF-H2** | `OperationalConfirmProvider` lived **inside** `AppChrome` (scroll/transform subtree) | Provider sibling dialog still *felt* tied to chrome; global escape must be **layout-level** + dedicated root |
| **PF-H3** | Portal target `#dlc-destructive-confirm-portal` without strict body isolation contract | Needed renamed `#dlc-global-overlay-root`, `useLayoutEffect` mount, explicit `width` on host, workspace anchor |
| **PF-H4** | Residual inline confirms (`PipelineFileWorkspace`, hierarchy settings) | Hub row actions migrated in 18.8G; workspace + settings still embedded confirms |

## DOM ownership proof (target architecture)

After 18.8H, when delete opens:

1. Trigger: icon/button only (no dialog JSX in row tree).
2. `useOperationalConfirm()` → `OperationalConfirmProvider` (in `GlobalOverlayProviders`, **outside** `AppChrome`).
3. `OperationalConfirmDialog` → `DestructiveConfirmShell` → `GlobalOverlayPortal`.
4. DOM parent of `[data-destructive-confirm-host]` must be **`#dlc-global-overlay-root`** (direct child of `body`), **not** `.hub-row-action-rail`.

Verify in production:

```js
window.__DLC_CONFIRM_DEBUG__?.inspect()
// mountParent.isGlobalOverlayRoot === true
// mountParent.isRowActionRail === false
// hostRect.width > 400
```

Enable logging: `NEXT_PUBLIC_DLC_CONFIRM_DEBUG=1`

## Overflow / transform ancestry

Portaled confirms **must not** have a `transform` / `filter` / `contain:paint` ancestor between host and viewport. The global overlay root is `position: fixed; inset: 0; isolation: isolate; contain: none` on `body`.

Pipeline list rows may still use `overflow-hidden` for truncation — that is OK **only** for triggers, never for confirm hosts.

## Conclusion

Structural fix = **imperative confirm only** + **body-level overlay root** + **zero inline `OperationalConfirmDialog` in pipeline/hierarchy/workspace rows** + runtime proof via `__DLC_CONFIRM_DEBUG__`.
