# UI / UX rules (mandatory)

**Status:** Permanent product design and layout standards.  
**Scope:** All surfaces in `lender-app/` (and shared components).  
**Related:** `docs/scroll-architecture-rules.md`, `docs/material-design-system.md`, `docs/material-design-audit.md`, `.cursor/rules/material-design-rules.mdc`.

---

## Core principles

1. **Mobile-first development** — Design and validate the smallest viewport first; scale up. Touch targets, thumb reach, and momentum scrolling are first-class.
2. **Unified workspace feel** — One product: shared spacing scale, typography rhythm, and grid alignment across pipeline, tasks, contacts, and lenders.
3. **No overlapping panels** — Avoid stacked floating chrome that obscures content or fights focus. Overlays must be deliberate (e.g. task drawer as **overlay**, not a second “main”).
4. **No double scrolling** — A single primary vertical scroll owner per route/shell (`AppChrome` `<main>` contract). Bounded inner regions only where documented (`AGENTS.md`, scroll architecture doc).
5. **No obstructive sticky UI** — Sticky headers minimize on scroll (especially mobile); they must not steal excessive viewport or thrash height.
6. **Composited motion only on scroll-adjacent chrome** — Prefer **`transform` / `opacity`** for animations tied to scroll or sticky regions; avoid animating layout-driving properties on the scroll path (padding, height, grid tracks).
7. **Material Design alignment** — Use Material 3‑inspired structure where the codebase already standardizes (shape, elevation metaphors, motion curves). Follow `.cursor/rules/material-design-rules.mdc` and `docs/material-design-system.md` for tokens and patterns.
8. **Consistent spacing/layout systems** — Tailwind + shared containers (`WorkspaceContentContainer`, section wrappers); no one-off magic numbers without justification.
9. **Utilities collapsed by default** — Pipeline workspace utilities and secondary chrome stay secondary; progressive disclosure.
10. **Production-grade mobile usability** — Readable typography, safe areas, keyboard awareness on forms, predictable navigation.

---

## Sections and accessibility

- Meaningful **labels** and stable **`sectionId` / `htmlId`** where useful for QA and automation.
- Loading: reserve space or skeletons to reduce **layout jump**.
- Modals: avoid overload; each dialog should have a clear dismiss path.

---

## Responsive validation (required)

For **every** UI change (including animations, sticky behavior, overlays, drawers):

| Viewport | Minimum expectation |
|----------|----------------------|
| Desktop | Chromium baseline + layout integrity |
| Tablet | iPad-class width — no clipped chrome |
| Mobile | **iPhone Safari** + **Android Chrome** classes — scroll, sticky, touch |

Automated hooks: `npm run test:mobile`, `npm run test:mobile:matrix`, visual projects under `tests/visual/`. Manual sign-off still recommended for release-grade polish.

---

## Overlay and drawer rules

- **Task drawer / lender drawer:** Overlay asides with **bounded internal scroll**; must **not** break or capture the primary `<main>` scroll contract incorrectly.
- **Bottom navigation:** Route-aware; must not collide with focus mode / compact chrome without explicit design.

---

## Enforcement

- Before merge of UI changes: impact check against this document + `docs/scroll-architecture-rules.md`.
- Mobile QA rule: **no feature complete without mobile validation** — see `docs/mobile-testing-rules.md`.

---

*Canonical high-level summary also appears in `docs/ai-development-rules.md`; resolve conflicts in favor of explicit scroll/mobile docs when UX overlaps.*
