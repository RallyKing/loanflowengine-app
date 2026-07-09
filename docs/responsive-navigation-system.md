# Responsive navigation system

This document describes the **vendor-neutral** shell navigation model used by the lender app. It is driven by **CSS width breakpoints**, **`window.matchMedia` (orientation, resolution, reduced motion)**, **`VisualViewport`** (usable area / keyboard inset), and **local preferences** — not by iOS- or Android-specific APIs.

## Goals

- **Desktop (wide):** persistent navigation rail, expandable primary sidebar, optional context/auxiliary surfaces.
- **Tablet (medium width):** collapsible rail + sidebar discipline, optional **bottom bar hybrid**, adaptive switching when orientation or usable height changes.
- **Phone (narrow):** bottom primary bar, safe-area-aware, larger touch targets on high-density screens, keyboard-friendly focus.

## Layering

| Layer | Responsibility |
|--------|----------------|
| **`ResponsiveNavProvider`** | Subscribes to viewport signals, derives `layout`, exposes haptics + auxiliary panel API, sets `document.documentElement` data attributes, tracks route persistence. |
| **`NavigationConfigProvider`** | Catalog visibility, ordering, icons (unchanged). |
| **`MobileChromeProvider`** | Scroll-compact masterpage on small widths (`< md`); orthogonal to shell tier. |

## Breakpoints and shells

Constants live in `lender-app/lib/navigation/responsiveNavConstants.ts` and align with Tailwind `screens`:

| Shell | Width (usable) | Primary chrome |
|--------|----------------|----------------|
| **Mobile** | `< 768px` | Bottom navigation bar |
| **Tablet** | `768px` – `1279px` | Collapsed rail + sidebar (SaaS) **or** header strip (classic); optional bottom bar |
| **Desktop** | `≥ 1280px` | Rail + expanded sidebar; bottom bar off |

**Usable width/height** prefer `visualViewport.width` / `visualViewport.height` when available, falling back to `window.innerWidth` / `innerHeight`.

### Orientation

Orientation comes from `(orientation: landscape)` / `portrait` media queries only (no UA heuristics).

### Density

**High density** is indicated by `(min-resolution: 2.5dppx)` or `devicePixelRatio ≥ 2.5`. The bottom bar increases minimum touch height slightly for comfort.

### Usable viewport / keyboard

`keyboardInsetBottom` approximates bottom obstruction from `VisualViewport` vs `window.innerHeight` so future keyboard-aware tweaks can read a single signal.

## Derived flags (`ResponsiveNavLayout`)

Computed in `deriveResponsiveNavLayout()` (`useResponsiveNavLayout.ts`):

- **`useBottomNavigation`** — `true` on mobile; on tablet also when:
  - user preference **Tablet bottom navigation** is enabled (`localStorage` key `dlc-nav-tablet-bottom-v1`), or
  - usable height `< 520px` (foldables / short windows), or
  - tablet **landscape** with usable width `< 880px`.
- **`useTabletContextStrip`** — classic header strip; **`false`** whenever tablet bottom navigation is active to avoid duplicate shortcut rows.

## Components map

| UI | File |
|----|------|
| Bottom primary bar | `components/MobileBottomNav.tsx` |
| SaaS collapsed rail | `components/navigation/AdaptiveCollapsedNavRail.tsx` |
| SaaS expandable sidebar | `components/SaasSidebar.tsx` |
| Classic tablet strip | `components/navigation/TabletContextNav.tsx` |
| Provider + auxiliary portal | `components/navigation/ResponsiveNavProvider.tsx` |
| Navigation settings (tablet toggle) | `components/navigation/NavigationManagerPanel.tsx` |

## Context auxiliary panel (“desktop context sheet”)

`ResponsiveNavProvider` exposes **`auxiliaryPanel.open({ label, children })`** / **`close()`**, rendered via **`createPortal`** to `document.body`.

- Below **`xl`**: bottom-aligned sheet with backdrop (tablet / narrow desktop).
- From **`xl`**: fixed trailing pane (`min(420px, 100vw)`), full viewport height.

`Escape` and backdrop click close the panel. Use this for filters, contextual tools, or help surfaces without coupling to a specific vendor sheet implementation.

## Route persistence

`sessionStorage` key **`dlc-nav-last-primary-v1`** stores the last pathname visited (`recordNavRoute` / `readLastNavRoute`). Suitable for “resume last section” or diagnostics; route guards remain authoritative.

Sidebar expanded/collapsed for SaaS remains **`dlc-saas-sidebar-expanded`** (existing behavior).

## Motion and accessibility

- **`prefers-reduced-motion: reduce`** trims transitions (`navMotion.ts`, Tailwind `motion-reduce:*` on mobile chrome helpers).
- **Skip link** — first tab stop jumps to **`#app-main-scroll`** (`AppChrome.tsx`).
- **Focus rings** — shared `navFocusRingClass` on bottom items and rail controls.

## Haptics

`useHaptics()` wraps **`navigator.vibrate`** when present; otherwise no-op. Bottom navigation fires light pulses on primary taps (`selection` / `light`).

## Safe areas

Bottom navigation and auxiliary sheets respect **`env(safe-area-inset-*)`** for notched displays and posture changes.

## HTML data hooks

`document.documentElement` receives:

- `data-nav-shell` — `"mobile" | "tablet" | "desktop"`
- `data-nav-bottom` — `"on"` when primary bottom bar is shown for the current shell rules

Useful for debugging and rare CSS that cannot be expressed solely with Tailwind.

## Tweaks & toggles

- **`NEXT_PUBLIC_ADAPTIVE_NAV=0`** — disables Convex-backed navigation prefs only; **`ResponsiveNavProvider` still wraps** so layout hooks keep working.
- **Tablet bottom bar** — Settings → Navigation → **Tablet bottom navigation** (local only).

## Maintenance checklist

When changing breakpoints:

1. Update **`responsiveNavConstants.ts`** and Tailwind **`screens`** if they must stay aligned.
2. Adjust **`MobileBottomNav`** placement classes (`md` / `xl`) in tandem with **`deriveResponsiveNavLayout`** shell thresholds.
3. Verify **`AppChrome`** main bottom padding branches (`useBottomNavigation` vs desktop-only).
4. Run **`npm run build`** in `lender-app/` and smoke **mobile scroll**, **tablet hybrid**, **SaaS sidebar collapse**.
