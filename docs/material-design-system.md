# Material Design system (Direct Lending Connection)

This document defines how **Material Design 3 (MD3) principles** are **adapted** to DLC—not a pixel clone of Google’s product UI. The implementation stack is **Tailwind CSS + CSS variables + React** (not MUI). Brand palettes (forest/gold classic, SaaS green/blue) remain authoritative; MD3 supplies **structure**, **motion**, **accessibility**, and **surface hierarchy** vocabulary.

## Canonical sources

| Layer | Location |
|--------|-----------|
| CSS variables (runtime) | `lender-app/app/globals.css` (`:root`, dark, SaaS, reduced motion) |
| Token reference copy | `lender-app/styles/design-system/material-tokens.css` (keep in sync with globals) |
| Tailwind theme mapping | `lender-app/tailwind.config.ts` (`rounded-dlc-*`, `shadow-dlc-*`, `duration-dlc-*`, `ease-dlc-*`, `text-dlc-*`, `leading-dlc-*`, `tracking-dlc-*`, surface colors) |
| TS constants (hooks, Framer, etc.) | `lender-app/lib/design-system/` |

## Philosophy

1. **Adaptive, not generic** — Surfaces and type respond to `data-color-scheme` (classic vs SaaS) and OS dark (classic only).
2. **Content-first** — The single vertical scroll owner (`AppChrome` `<main>`) stays primary; overlays own bounded scroll (drawers, modals).
3. **Touch-first minimums** — Interactive targets favor **40–48px** height where feasible (`Button` / `Input` defaults).
4. **Motion with consent** — `html[data-reduce-motion="true"]` zeros DLC duration tokens and existing global transition overrides apply.

## Semantic surfaces (MD3-style roles)

Variables bridge to existing RGB tokens (`--bg`, `--muted`, `--table-header`):

- `--dlc-surface-page` — app canvas  
- `--dlc-surface-container-lowest` … `--dlc-surface-container-highest` — stacked panels/cards/tables  
- `--dlc-surface-variant` — outlines / dividers soft fill  

Utility classes:

- `.dlc-surface-card` — default card (border + `shadow-dlc-1`)  
- `.dlc-surface-raised` — emphasized panel (`shadow-dlc-2`)  
- `.dlc-surface-overlay` — dialogs / floating shells (`shadow-dlc-4`)  

## Elevation

`--dlc-elevation-0` … `--dlc-elevation-5` — soft neutral shadows. **Classic light**, **OS dark**, and **SaaS** each override shadow sets where needed for contrast.

Tailwind: `shadow-dlc-1` … `shadow-dlc-5`, plus legacy `shadow-card`.

## Shape

Corner tokens: `--dlc-shape-corner-extra-small` through `--dlc-shape-corner-extra-large` and `full`.

Tailwind: `rounded-dlc-xs` … `rounded-dlc-xl`, `rounded-dlc-full`.

## Typography

MD3-style roles exposed as Tailwind **font size + line height + tracking** triples:

- Display / headline / title / body / label scales: `text-dlc-*`, `leading-dlc-*`, `tracking-dlc-*`  
- Prefer these on **new** headings and dense UI; migrate legacy `text-sm` / `text-xs` incrementally.

## Motion

Durations: `--dlc-motion-duration-short1` … `long2`; easing: `--dlc-motion-easing-standard` (and accelerate/decelerate variants).

Tailwind: `duration-dlc-short1`, `ease-dlc-standard`, etc.

**Drawer slide** `.animate-slide-in-right` uses tokenized duration/easing.

## State layers

Opacity tokens (`--dlc-state-hover-opacity`, etc.) document intended hover/focus/press overlays. Implement with pseudo-elements or Tailwind opacity on contained layers—avoid painting full-screen washes except scrims (`--dlc-scrim`).

## Density

`--dlc-density-compact` | `default` | `comfortable` — use for future block spacing presets and responsive compact modes.

## Breakpoints

Use standard Tailwind `sm` / `md` / `lg` / `xl` / `2xl` unless a feature truly needs a custom query; document exceptions in the audit file.

## Accessibility

- Contrast: existing WCAG-oriented brand docs in `globals.css` comments.  
- Focus: `:focus-visible` + optional `data-focus-rings="enhanced"`.  
- Reduced motion: `data-reduce-motion` on `<html>`.  
- Semantics: prefer landmarks (`<main>` in portal shell; `AppChrome` pattern for workspace).

## Blocks (modular pipeline)

Each block should eventually:

- Use `shadow-dlc-*` / `rounded-dlc-*` for outer chrome  
- Use typography tokens for titles vs metadata  
- Animate expand/collapse with `duration-dlc-*` and `ease-dlc-standard`  
- Avoid nested scroll unless the block is an intentional overlay region  

## What we are not doing

- Importing the full MUI component tree (bundle weight + divergence from current Tailwind system).  
- Replacing all `rounded-xl` / `shadow-sm` overnight—migration is **phased** (see `docs/material-design-audit.md`).
