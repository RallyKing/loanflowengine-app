# Workspace sheet — mobile rules

## Sheet

- **Vaul** owns snap **motion**; content **scroll** stays on `[data-pipeline-workspace-scroll]`.
- **Handle:** visible when reduced motion is off; with reduced motion, `handleOnly` is disabled — users rely on focus/scroll (avoid trapping pans on the handle-only path if behavior regresses).
- **Safe area:** drawer content uses `max-sm:pt-[env(safe-area-inset-top)]`; workspace scroller retains bottom padding for bottom nav + home indicator.

## Chrome

- **App** master header still uses `MobileChromeController` compact mode from the **same** sentinel/scroller.
- **File** chrome rows use `WorkspaceSheetSnapContext` when present so **compact** aligns with **Vaul smallest snap**, not only scroll position.

## Testing matrix (manual)

- iPhone Safari, Android Chrome: snap drag, scroll long file, keyboard open/close, rotate, safe areas.
- Utilities default collapsed; expand/collapse does not steal scroll from the workspace scroller.
