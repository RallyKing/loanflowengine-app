# Material design audit — Direct Lending Connection

**Date:** 2026-05-07  
**Scope:** Inventory of **inconsistencies** vs the centralized MD3-adapted system and **recommended refactors**. Full remediation is intentionally **phased** to avoid risky wide diffs.

## Implemented foundation (this pass)

- CSS variables for shape, motion, state opacities, type scale, elevation, scrim; theme bridges for surfaces; dark + SaaS elevation overrides.  
- Tailwind utilities: `rounded-dlc-*`, `shadow-dlc-*`, `duration-dlc-*`, `ease-dlc-*`, `text-dlc-*`, `leading-dlc-*`, `tracking-dlc-*`, semantic `bg-dlc-surface-*`.  
- Component utilities: `.dlc-surface-card`, `.dlc-surface-raised`, `.dlc-surface-overlay`.  
- **Primitives updated:** `Button`, `Input` / `Textarea` / `Select` / `Label`, `Badge` — tokenized radius, elevation, motion, type scale, larger default touch sizing.  
- **Motion:** Drawer slide + table row hover use tokenized timing where touched.  

## High-impact follow-ups (prioritized)

### 1. Border radius drift

**Finding:** Mixed `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` across ~90+ TSX files (pipeline, drawers, intake, settings, etc.).  
**Action:** Establish **per-role** defaults in the design doc (e.g. cards `rounded-dlc-md`, nested chips `rounded-dlc-full`, modals `rounded-dlc-lg`) and migrate file-by-file or by feature area.

### 2. Elevation / shadow drift

**Finding:** Mix of `shadow-sm`, `shadow-md`, `shadow-card`, custom borders, and no shadow.  
**Action:** Prefer `shadow-dlc-1` / `shadow-dlc-2` for cards; reserve `shadow-dlc-4`+ for overlays; remove duplicate “almost the same” shadows.

### 3. Typography drift

**Finding:** Many `text-xs` / `text-sm` / `font-semibold` combinations without consistent line-height or tracking.  
**Action:** Map page titles to `text-dlc-headline-*`, section headers to `text-dlc-title-*`, body to `text-dlc-body-*`, metadata/chips to `text-dlc-label-*`, with paired `leading-dlc-*` / `tracking-dlc-*`.

### 4. Data surfaces

**Finding:** `.dlc-data-table` exists; other lists (tasks, contacts, lenders) may use ad-hoc row hover and borders.  
**Action:** Reuse table patterns or extract shared “data row” utilities for list rows with consistent hover duration (`duration-dlc-short1`).

### 5. Drawers and modals

**Finding:** Multiple drawer implementations (`TaskDrawer`, `LenderDrawer`, pipeline panels) with varying header padding, sticky behavior, and animation.  
**Action:** Unify scrim + panel elevation + slide animation using DLC tokens; verify single overflow pattern per project rules.

### 6. Mobile / bottom nav

**Finding:** `MobileBottomNav` and sticky headers must stay aligned with minimized chrome behavior.  
**Action:** Audit safe-area padding, tap targets, and `active:` feedback using the same motion tokens as desktop.

### 7. Intake / blocks

**Finding:** Large intake surface with mixed section cards and field chrome.  
**Action:** Apply `.dlc-surface-card` or `shadow-dlc-1` / `rounded-dlc-md` to block shells; align `CollapsibleSection` motion to `duration-dlc-short2` + `ease-dlc-standard`.

### 8. SaaS vs classic visual parity

**Finding:** Two schemes use different fonts and primaries; tokens must remain valid in both.  
**Action:** When changing a token, validate **both** `[data-color-scheme="saas"]` and classic + OS dark.

## Performance guardrails

- Prefer **CSS transitions** on transform/opacity over layout-affecting properties.  
- Avoid animating `box-shadow` on large lists; animate opacity or use static elevation steps.  
- Lazy-load heavy panels; motion does not replace virtualization for big tables.

## Testing checklist (per milestone)

- `npm run build`  
- Smoke: sign-in, pipeline scroll, task drawer, mobile width, portal login  
- Quick pass: keyboard Tab through primary flows; toggle reduced motion in settings  
- Optional: Lighthouse accessibility on tasks + pipeline routes  

## Deployment

Production deploy and full cross-browser matrix are **operator-owned**; run after each major UI milestone per project standards.
