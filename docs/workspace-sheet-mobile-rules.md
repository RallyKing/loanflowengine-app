# Workspace sheet — mobile rules

## Sheet

- **Vaul** owns snap **motion**; content **scroll** stays on `[data-pipeline-workspace-scroll]`.
- **Handle:** visible when reduced motion is off; with reduced motion, `handleOnly` is disabled — users rely on focus/scroll (avoid trapping pans on the handle-only path if behavior regresses).
- **Safe area (top):** exactly one `env(safe-area-inset-top)` on Vaul `Drawer.Content` (`WORKSPACE_SHEET_SAFE_TOP_PAD_CLASS` / `[data-workspace-sheet-safe-top]`) — not on the snap header.
- **Safe area (bottom):** single `MobileBottomNavScrollSpacer` (`variant="file"`, ~5rem + inset) inside `[data-pipeline-workspace-scroll]`; do not also pad the outer workspace body or scroll-lead with safe-area.

## Chrome

- **App** master header still uses `MobileChromeController` compact mode from the **same** sentinel/scroller.
- **File** chrome rows use `WorkspaceSheetSnapContext` when present so **compact** aligns with **Vaul smallest snap**, not only scroll position.

## Testing matrix (manual)

- iPhone Safari, Android Chrome: snap drag, scroll long file, keyboard open/close, rotate, safe areas.
- Utilities default collapsed; expand/collapse does not steal scroll from the workspace scroller.
