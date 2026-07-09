# Sticky system remediation — Phase 2

## Scope

Phase 2 targets **scroll-linked layout jitter** from sticky / masterpage chrome and **pipeline file** workspace chrome. No layout redesign: same regions, **stable box geometry** on mobile where compact mode toggles.

## Audited surfaces

| Surface | Role | Phase 2 change |
|--------|------|----------------|
| **`PipelineFileWorkspaceShell`** | Sticky file chrome + sentinel for compact IO | Already used **frozen** outer header padding and **transform/opacity** on inner chrome; utilities strip **no longer** swaps padding, font, or trigger min-height on compact (composited scale/opacity only). |
| **AppChrome (SaaS)** | Top bar above `<main>` | Removed **scroll-linked** vertical padding, gap, and **h6/w6** menu button swaps. Mobile row keeps **`mobileChromePaddingExpandedY`** always; right tool cluster uses **`scale` + `opacity`** when compact. |
| **AppChrome (classic)** | Two-row mobile header (grid show/hide) | Removed **layout transitions** on header shell; compact row uses **stable `py-2.5` + `px-4`** (aligned with expanded rhythm); back/logo use **`h-9 w-9`** targets (no **`h-6`** reflow). |
| **`MobileChromeController`** | Compact / focus state | **IntersectionObserver** path **debounced** (48 ms) + **immediate** initial sync; scroll path thresholds **14 px** (was 10) to reduce edge flicker. |
| **Banner strip** (`ConvexConnectionStatus` / `OfflineSyncBanner`) | Grid `0fr`/`1fr` | Unchanged: **no** `grid-template-rows` transition in `mobileScrollCollapseGridClass`; reveal is **opacity + translate** only. |

## Sticky header height stability (pipeline file)

- Sticky **`<header>`** padding does **not** depend on compact mode.
- File chrome compaction remains **`transform` + `opacity`** on the inner wrapper (`.scale-[0.94]` / opacity), so **flow height** of the sticky header is stable during compact toggles.
- **`--header-height` / `--pipeline-file-sticky-height`** continue to come from **measured** sticky header height with **≥1 px** commit gate (see `resizeobserver-fixes.md`).

## Intentionally unchanged

- **Desktop (`md+`)** masterpage: no behavioral change required for Phase 2.
- **`CollapsibleSection`** body: still uses **instant** grid row snap (`0fr`/`1fr`) with **no** animated row track; height still changes when the user opens/closes a section (user-driven, not scroll-linked).
- **Bottom nav** hide in focus mode: remains **transform + opacity** per existing `mobileFocusBottomNavHidden`.

## Related docs

- `resizeobserver-fixes.md` — RO coalescing and CSS vars.
- `composited-animation-conversion.md` — which transitions are allowed.
- `mobile-sticky-validation.md` — manual / automated checks.
