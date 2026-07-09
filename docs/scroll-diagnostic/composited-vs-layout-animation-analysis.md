# Composited vs layout-bound animations — scroll-reactive chrome

**Diagnostic only.** Categorization of **properties** transitioned while **`compactChrome` / `isMobileFocusMode`** drive UI (mobile).

---

## SAFE (compositor-friendly in typical engines)

**When isolated to transform + opacity only:**

| Mechanism | Properties | File |
|-----------|------------|------|
| `mobileScrollRevealInnerClass` | `opacity`, `transform` (`translateY`) | `mobileCompactChrome.ts` L44–55 |
| `mobileNavTransformTransition` + focus classes | `transform` (`translate-y-full`), `opacity` | `mobileCompactChrome.ts` L59–68, `MobileBottomNav.tsx` |

**Caveats:**

- Parent **`overflow-hidden`** and **`grid`** row still cause **layout** work.  
- `translate-y-full` on **fixed** nav still paired with **`main` padding** animation (**layout**).

---

## UNSAFE (layout / paint heavy — likely scroll jank contributors)

| Mechanism | Properties explicitly transitioned | File |
|-----------|-----------------------------------|------|
| `mobileCompactTransition` | **`padding`**, **`gap`**, **`box-shadow`**, **`min-height`**, **`font-size`** | `mobileCompactChrome.ts` L14–15 |
| `mobileScrollCollapseGridClass` | **`grid-template-rows`** (`0fr`/`1fr`) | `mobileCompactChrome.ts` L33–40 |
| `mobileContentBottomPadTransition` | **`padding`** | `mobileCompactChrome.ts` L75–76 |
| `mobileFocusChromeTransition` | **`transform`, `opacity`**, **`padding`, `gap`, `box-shadow`** | `mobileCompactChrome.ts` L79–83 |
| `mobileWorkspaceStackClass` | **`gap` change without transition** — **instant layout** | `mobileCompactChrome.ts` L86–90 |
| Header button (SaaS) | `transition-[width,height]` | `AppChrome.tsx` L308–309 |
| Master header inner (classic) | `mobileCompactTransition` on wrapper L430 | `AppChrome.tsx` |

**Sticky file header** (`PipelineFileWorkspaceShell.tsx` L213–218): applies **both** `mobileCompactTransition` **and** `mobileFocusChromeTransition` → **union** includes **layout-bound** props **on the `position: sticky` element itself**.

---

## Sticky-specific concern

**`mobileFocusChromeTransition` includes `transform`.**

If, during the 300ms window, the **computed style** applies a **non-identity transform** to the **same element** that has **`position: sticky`**, behavior is **engine-specific** and may:

- Promote a layer that **changes** sticky constraints, or  
- Create **visible jitter** as sticky offset interacts with transform.

**Required verification:** Mobile Safari **computed style** timeline on `<header>` in `PipelineFileWorkspaceShell` during compact toggle (not done in this static audit).

---

## Summary table — UNSAFE during scroll-reactive updates

| Item | Confidence it runs during scroll-linked compact |
|------|--------------------------------------------------|
| `grid-template-rows` 300ms | **High** (`bannerCollapse`, chrome rows) |
| `padding` on `main` inner 300ms | **High** |
| `padding` / `min-height` / `font-size` on master header + file sticky 200–300ms | **High** |
| Instant `gap` workspace stack | **High** on toggle frame |
| `ResizeObserver` → CSS var updates | **High** while heights change |

---

*End of composited vs layout animation analysis.*
