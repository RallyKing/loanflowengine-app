# Mobile chrome remediation — Phase 3

## Audit summary

| Area | Role | Issue addressed |
|------|------|-----------------|
| **`MobileChromeController`** | Compact / focus + scroll / IO | Bottom nav previously **`useContext`**’d the full chrome context → re-rendered whenever **`compactChrome`** changed, even when only **`pathname`** mattered for link state; focus and compact remain **`startTransition`**-friendly from Phase 2. |
| **`MobileBottomNav`** | Fixed bar (classic layout only) | Now **`React.memo`** + **`useMemo`** items by **`pathname`**; visibility uses **`useMobileBottomNavFocusMode`** (`useSyncExternalStore`) so **focus-only** updates re-render this subtree, not every consumer. |
| **Safe areas** | Insets on **`nav`** / **`main`** | Root **`nav`** uses **`env(safe-area-inset-bottom)`**; **Phase 3** adds **`safe-area-inset-left/right`** on the bar for landscape / notch overlap. |
| **Transforms** | Bottom bar visibility (`mobileCompactChrome`) | Hide/show uses **`translate-y-full` + `opacity`** (not height/margin animation); **`pointer-events-none`** when hidden; **`pointer-events-auto`** when visible. |
| **`viewport` (layout)** | `app/layout.tsx` metadata | **`viewportFit: cover`**, **`interactiveWidget: resizes-content`** — strategy and manual checks in `viewport-stability-validation.md`. |

## Implementation notes

### External focus store

- **Module-level** `mobileFocusModeSnapshot` + listener `Set`.
- **`publishMobileFocusMode`** runs from a **`useEffect`** keyed on **`isMobileFocusMode`** (same boolean as compact on `<md`).
- **Cleanup** on effect teardown sets **`false`** so HMR / rare unmount does not leave the nav believing focus mode is on.

### Bottom nav layering

- **`max-md:[backface-visibility:hidden]`** on the fixed `<nav>` to encourage a stable composited layer during **transform** transitions (aligned with sticky file chrome pattern).

### Rerender boundaries

- **`AppChrome` / `PipelineFileWorkspaceShell`** still consume full **`useMobileChrome()`** where layout needs compact — unchanged.
- **Nav-only** subscription trims work from the nav subtree when other chrome-only state is unchanged (pathname-only updates still re-render nav because **`usePathname()`** updates—that is expected).

## Related docs

- `mobile-nav-validation.md` — test checklist.
- `viewport-stability-validation.md` — dvh / keyboard / safe-area strategy.
