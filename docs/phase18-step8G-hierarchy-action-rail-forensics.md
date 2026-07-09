# Phase 18.8G — Pipeline hierarchy action-rail forensics

**Date:** 2026-05-28  
**Status:** Root cause confirmed; structural fix applied in 18.8G reconstruction.

## Symptom (production screenshot)

On the pipeline **Client** hierarchy view, delete confirmation appeared as an ultra-narrow vertical strip in the **right-side action column** of a client row:

- Impact copy stacked word-by-word (~60–80px width)
- Cancel / Delete buttons clipped and unusable
- UI visually embedded in the row action rail, not as a dominant centered overlay

This is **not** a modal `max-width` tuning problem alone. The failure is **where the confirm UI lived in the React tree** plus **flex shrink on the action column**.

## Delete entrypoint chain (before fix)

| Layer | Component / element | Role |
|-------|---------------------|------|
| Page | `PipelinePageClient` → hub hierarchy | Renders `PipelineHubHierarchyView` |
| Row | `RowShell` (`actions` prop) | Right column: `shrink-0` wrapper + hover reveal |
| Actions | `HubHierarchyClientActions` / `HubHierarchyProjectActions` | Fragment: `ActionSuite` + **inline** `{deleteOpen && <OperationalConfirmDialog />}` |
| Dialog | `OperationalConfirmDialog` → `DestructiveConfirmShell` | Intended portal to `document.body` |

**Loan rows:** `HubHierarchyLoanRowActions` — same inline `OperationalConfirmDialog` pattern.

## Container chain causing collapse

Even with `createPortal` on the destructive shell, mounting confirm state **inside** the row `actions` subtree caused:

1. **Flex competition:** `RowShell` middle band (`primary` + `meta` with `max-w-[42%] shrink`) and `actions` (`shrink-0` only) — under hub table width pressure, the **actions column still participated in flex layout** and could be squeezed when siblings grew.
2. **Inline dialog fallback risk:** Any portal/hydration edge case left confirm markup in the **narrowest flex child** (action rail), producing letter-stacked text — exactly matching the screenshot.
3. **No fixed rail width:** Action suite was `flex shrink-0 flex-wrap` without `min-width`, so the rail could collapse to icon-only strip width while hosting (or appearing to host) block-level confirm content.
4. **Clipping ancestors:** Hub shells and toolbar rows used `min-w-0` + nested flex without `shrink-0` on export controls — right-edge toolbar clipping on the same page.

## Overlay escape audit

| Check | Finding |
|-------|---------|
| Portal target | Was `document.body`; **18.8G** adds `#dlc-destructive-confirm-portal` at end of `<body>` |
| `transform` / `filter` on body portal | None on dedicated portal root |
| `overflow: hidden` on `body` | App shell contract — portal root is `fixed inset-0; overflow: visible` |
| Row `transform` / `contain` | Row hover uses opacity only; no containing block for portaled fixed UI |
| **Structural trap** | **Inline confirm in row actions** — primary defect; fixed by provider-only mount |

## Desktop positioning (secondary)

18.8F anchored desktop modal with JS `measureWorkspaceAnchor()` + `position: fixed; left/top; translate(-50%, -50%)`. That did not fix the screenshot because the visible failure was **in-row compression**, not subtle horizontal bias. **18.8G** uses viewport `grid place-items-center` on the portaled overlay.

## Conclusion

**Primary root cause (PF-G1):** Delete confirm mounted **inside** `HubHierarchyRowActions` / loan row actions inside `RowShell` action rail — wrong ownership; rail width collapse made failure catastrophic.

**Secondary (PF-G2):** Action rail lacked fixed `min-width` / `flex-none` discipline.

**Tertiary (PF-G3):** Hub toolbar export cluster allowed shrink/wrap clipping at page edge.

**Fix direction:** Provider-only delete (`useOperationalConfirm` → `OperationalConfirmProvider` in `AppChrome`), fixed action rail, dedicated portal root, viewport-centered destructive shell.
