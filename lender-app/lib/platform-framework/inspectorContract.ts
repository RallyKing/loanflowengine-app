/**
 * Record inspector enterprise contract — **do not** add second inspector shells.
 *
 * - **Scroll:** Exactly one vertical scrollport: inner body of `RecordInspectorShell`
 *   (`RecordInspectorBody`), not the route `<main>`, not the docked `<aside>` root.
 * - **Focus:** Shell captures `document.activeElement` on mount; restores on unmount.
 * - **Escape:** Centralized in shell; editable controls opt out via focus target.
 * - **Layering:** Use `OVERLAY_Z_BASE.inspector` from `overlayStack.ts` when not using shell.
 *
 * Future **persistent rails** (`InspectorRailMode.split_docked`) keep the same body scroll
 * contract; only the positioning vector changes (split vs overlay).
 */

export type InspectorBodyScrollContract = "record_inspector_body_only";
