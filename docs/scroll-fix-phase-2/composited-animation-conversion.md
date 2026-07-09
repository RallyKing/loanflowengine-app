# Composited animation conversion — Phase 2

## Rules (mobile compact / focus)

Allowed on elements that track scroll or compact mode:

- **`transform`** (e.g. `translate`, `scale`) with **`transform-origin`** set deliberately.
- **`opacity`**.
- **`transition`** / **`animation`** only on **`transform`** and **`opacity`** (plus **`visibility`** if needed).

**Avoid** animating or transitioning on scroll-driven state:

- `height`, `min-height`, `max-height`
- `padding`, `margin`
- `gap`, `grid-template-rows`, `top`/`inset` (layout)
- `font-size`, `line-height` (text reflow)
- `border-width` / `box-shadow` on the **masterpage** bar if it causes noticeable layout (SaaS header no longer runs `mobileFocusChromeTransition` on the shell).

## Shared tokens (`lib/mobileCompactChrome.ts`)

- **`mobileCompactTransition`** — `transition-[opacity,transform]` only (max-md).
- **`mobileScrollCollapseGridClass` / `mobileScrollRevealInnerClass`** — grid row is **toggled instantly** (`0fr` / `1fr`); **no** transition on `grid-template-rows`. Inner content uses **opacity + translateY**.
- **`mobileContentBottomPadTransition`** — already **`transition-none`** so main bottom padding does not animate on focus toggles.
- **`mobileNavTransformTransition`** — bottom nav: transform + opacity only.

## Phase 2 code adjustments

| Location | Before | After |
|----------|--------|--------|
| SaaS `AppChrome` header row | Padding/gap + smaller menu button in compact | **Stable** padding (`mobileChromePaddingExpandedY`), stable **`h-9`/`w-9`** menu; compact **visually** via **`scale` + `opacity`** on tool cluster. |
| Classic `AppChrome` compact row | `py-0.5`, `h-6` controls, animated shell classes | **`py-2.5`**, **`h-9`** controls; no **`mobileFocusChromeTransition`** / **`mobileChromePadding Focus`** on that row. |
| Pipeline utilities collapsible | Compact: `!py`, smaller icons/text, trigger min-height | **Composited** `scale` + `opacity` on header; **stable** surface `py` (no compact `!py-2`). |

## GPU / paint

Prefer **short** `duration` values (200–300 ms) and **one** promoted layer per animated subtree. **`will-change`** was intentionally **not** added globally (see comments in `mobileCompactChrome.ts`).
