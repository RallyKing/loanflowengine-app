# Design system policy

**Binding Material-aligned product design** (`docs/ui-ux-rules.md`, `.cursor/rules/material-design-rules.mdc`).

---

## MUST standardize

- **Spacing** — Tailwind spacing scale; shell padding contracts (`AppChrome`).
- **Typography** — type ramp; avoid ad hoc font sizes.
- **Elevation** — shadows and layers consistent with surfaces.
- **Motion** — purposeful; transform/opacity preferred for scroll-adjacent UI; respect reduced motion.
- **Responsiveness** — mobile-first breakpoints; touch-first targets.
- **Interaction states** — hover/focus/disabled/loading for actionable controls.
- **Surfaces** — cards, panels, drawers share lineage.
- **Overlays** — drawer/modal stacking and focus rules.

---

## No one-off styling

- **No** arbitrary inline styles for layout fundamentals without justification.
- **Custom patterns** require update to `design-system-component-map.md` when they become primitives.

---

## Related

- `ui-consistency-policy.md`
- `accessibility-policy.md`
