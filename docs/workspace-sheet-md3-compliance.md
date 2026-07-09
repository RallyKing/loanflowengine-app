# Workspace sheet — Material Design 3 alignment

## Surfaces

- **Elevation:** drawer content uses a subtle shadow token on the sheet container; app bar remains separate in `AppChrome`.
- **Motion:** Vaul default curve `cubic-bezier(0.32, 0.72, 0, 1)`; shell chrome uses `cubic-bezier(0.2, 0, 0, 1)` for transform/opacity on `max-md`.
- **Large / small top region:** file chrome scales opacity/scale between snap states instead of animating layout height.

## Interaction

- **Snap points** map to operational density (compact → expanded).
- **Touch targets:** Vaul handle hit area ≥ 44px (library default).

## Accessibility

- `aria-label` on workspace sheet content and handle where provided.
- Reduced motion: `html[data-reduce-motion="true"]` short-circuits Vaul transitions and shell transitions per `globals.css` and Tailwind `motion-reduce` variants.
