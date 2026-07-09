# Sticky header mutation analysis — `PipelineFileWorkspaceShell`

**Diagnostic only.** Element: **`<header ref={stickyChromeRef}>`** (L211–249).

---

## 1. Positioning & stacking

| Property | Source |
|----------|--------|
| `position` | `sticky` (Tailwind `sticky`) |
| `top` | `top-0` |
| `z-index` | `z-[var(--pipeline-file-sticky-z)]` (`globals.css` `--pipeline-file-sticky-z: 30`) |
| Scrollport | `<main data-app-main-scroll>` |

---

## 2. Class mutations driven by context/props

### 2.A `compact` = `!mobileMasterExpanded` (from `MobileChromeController`)

| Condition | Classes |
|-----------|---------|
| `compact` true | `max-md:pt-0 max-md:border-border/45` |
| `compact` false | `max-sm:pt-[max(0.5rem, env(safe-area-inset-top))]` |

**Effect:** **Top padding** toggles; **height** changes; **ResizeObserver** + layout effect run.

### 2.B `isSnoozed`

| Condition | Classes |
|-----------|---------|
| true | `border-blue-200 bg-blue-50 dark:…` |
| false | `bg-background` |

**Effect:** Visual **background**; minor border/color; possible **min content** change if banner text wraps.

### 2.C Transitions always applied

- `mobileCompactTransition` → `transition-[padding,gap,box-shadow,min-height,font-size]` **duration-200** (max-md motion-reduce exempt).
- `mobileFocusChromeTransition` → includes **`transform`, `opacity`, `padding`, `gap`, `box-shadow`** **duration-300**.

**Critical forensic point:** Sticky element **has transition properties that include `padding`, `min-height`, and possibly `transform`**. During **`mobileFocusChromeTransition`**, if computed **`transform`** is non-`none` at any instant, **sticky positioning** may be **recomputed relative to a transformed ancestor** — **the sticky element itself** receiving transform transitions is **spec-sensitive** (sticky + transform on same element).

### 2.D `WorkspaceContentContainer` (inner)

| `compact` | Inner padding |
|-----------|----------------|
| true | `max-md:!pb-0.5 max-md:!pt-0.5 max-md:px-2` |
| false | `pb-3 pt-3` (+ sm breakpoints on outer) |

**Effect:** **Large** vertical padding change → **dominant** height delta for RO.

### 2.E `data-mobile-workspace-chrome`

- `"compact"` vs `"expanded"` for debugging / selectors.

---

## 3. `mobileWorkspaceStackClass(isMobileCompactMode)` (below sticky)

**Not** on sticky header — on **content** `WorkspaceContentContainer` (L259+): **`gap` flip** `max-md:gap-2` vs `gap-4 sm:gap-5` with **no** `transition` in `mobileWorkspaceStackClass` — **instant** when compact toggles. Affects **flow below** sticky, **not** sticky box directly.

---

## 4. Height / CSS variable pipeline

1. **`getBoundingClientRect().height`** on `<header>` (layout effect + RO).  
2. **`stickyChromeHeightPx`** → inline `--header-height` / `--pipeline-file-sticky-height` on **shell root** `<div data-pipeline-file-workspace-shell>`.  
3. **`globals.css`**: modular sections / `#file-details` use **`scroll-margin-top: calc(var(--header-height, …) + gap)`**.

**During active scroll:** If **compact** flips, **padding animates 200–300ms** → **height is time-varying** → **RO callbacks** may fire **throughout** animation → **`setStickyChromeHeightPx` updates** → CSS vars **animate stepwise** with observer cadence.

---

## 5. Does sticky mutate “during” scroll?

**Yes (when compact toggles mid-gesture or mid-momentum):**

- **IntersectionObserver** fires from **scroll** + **layout**; compact flips **while** user may still have inertia.
- **Padding/min-height/font** transitions run **on the sticky header and master chrome**.
- **`main` bottom padding** transitions run **in AppChrome** in parallel (focus mode).

**Does it affect AppChrome layout directly?**

- **No sibling DOM** — sticky is **inside** `<main>`; **`header` masterpage** is **outside** `<main>`.  
- **Indirect:** Changing **`main` padding** (AppChrome) changes **viewport area** for content; **master header** height also changes from compact grids — **global column flex** height changes.

---

## 6. `max-md:[backface-visibility:hidden]` on sticky

**Purpose:** Often used as GPU layer hint. **Side effect:** Can affect **compositing** and **text rendering** on WebKit — diagnostic only.

---

*End of sticky header mutation analysis.*
