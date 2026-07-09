# Grid + padding transition analysis (scroll-reactive chrome)

**Diagnostic only.** Maps **layout-affecting** transitions to **scroll-driven** `compactChrome` / `focus` flips.

---

## 1. `grid-template-rows`: `0fr` ↔ `1fr`

**Definition:** `mobileScrollCollapseGridClass(collapsed)` in `mobileCompactChrome.ts` L33–40.

**Where used in `AppChrome.tsx`:**

| Location | `collapsed` argument | Content |
|----------|---------------------|---------|
| `bannerCollapse` L229–235 | `compact` | `ConvexConnectionStatus` + `OfflineSyncBanner` |
| Classic expanded chrome L425 | `compact` | Full brand row |
| Classic compact bar L467–472 | **`!compact`** | Inverted — **compact bar visible when `compact` false**, collapsed when `compact` true |
| SaaS mobile title / tools grids L325–328, 347–349 | `compact` | Title truncation row, tools row |

**Transition:** `max-md:transition-[grid-template-rows] max-md:duration-300` + `max-md:overflow-hidden`.

**Layout effect:**

- **`1fr` → `0fr`**: animated **collapse** of row — **ongoing height change for 300ms** on mobile.
- **`0fr` → `1fr`**: **expand**.

**Scroll coupling:** `compact` flips from **IO** (pipeline file) or **scroll delta** (other routes) → **grid animates** while **`main` content may still be scrolling** (momentum).

**Momentum interruption (hypothesis):** Browser must reconcile **compositor scroll** with **main-thread layout** updating **master header** height → **visible jump** in `<main>` content position **relative to viewport** if browser **adjusts scroll offset** to satisfy scroll anchoring.

---

## 2. Inner `mobileScrollRevealInnerClass`

**Transition:** `opacity` + **`transform`** (`translateY`) 300ms; `overflow-hidden` on inner.

**Classification:** **Transform/opacity** are usually compositor-friendly; **parent `overflow-hidden`** still participates in **layout** (clip rect changes).

---

## 3. `main` inner wrapper padding

**Class:** `mobileContentBottomPadTransition` = `max-md:transition-[padding] max-md:duration-300` (`mobileCompactChrome.ts` L75–76).

**Applied to:** Inner `div` under `<main>` in `AppChrome.tsx`:

- **Classic + pipeline wide** (L521–528):  
  - **Not focus:** `pb-[max(5.5rem,calc(4.25rem+env(safe-area-inset-bottom)))] sm:pb-8`  
  - **Focus:** `mobileFocusMainBottomPadClass` + `max-md:pt-0` → `max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]`
- **SaaS + pipeline wide** (L390–394): similar pattern with `pb-5` vs focus `pb-1.5`.

**Magnitude:** Bottom padding swings between **~5.5rem-class** clearance (for **fixed** bottom nav) and **~minimal** safe-area padding when focus hides nav.

**Scroll coupling:** **`focus === isMobileCompactMode`** — same moment sticky/workspace compact fires, **bottom padding** begins **300ms transition** on **`main`’s child**.

**Effect on scroll height:** `scrollHeight` of `<main>` changes **during** transition → **stable scroll position** in px may **pin** or **drift** depending on **scroll anchoring** and **origin** of scroll (iOS Safari often sensitive).

---

## 4. Top spacing / safe area

- Sticky file header: **`max-sm:pt-[max(0.5rem, env(safe-area-inset-top))]`** when expanded.  
- **`mobileFocusChromeTransition`** also transitions **padding** on **master header** regions.

**Keyboard / dynamic safe area:** If `env(safe-area-inset-*)` **or** viewport changes, **padding** endpoints move — transitions may **restart** or **chase** new values (not explicitly coded; browser-dependent).

---

## 5. Bottom nav offset

**`MobileBottomNav`:** `mobileFocusBottomNavHidden` = `translate-y-full` + `opacity` + `pointer-events-none`.

- **Fixed** positioned — **does not** remove layout from flow beneath in the same way as `main` padding change; **paired** with **`main` padding** reduction so content **does not** sit under off-screen nav.

**Transition:** `mobileNavTransformTransition` 300ms — **parallel** with `main` padding transition.

---

## 6. `mobileWorkspaceStackClass` — **instant** `gap`

`isCompact ? "max-md:gap-2" : "gap-4 sm:gap-5"` — **no** `transition` utility.

**Effect:** **Single frame** vertical reflow of pipeline content stack when `isMobileCompactMode` toggles — **can coincide** with IO-driven compact flip — **sudden** layout change **in addition to** animated padding on chrome.

---

## 7. Reflow “storm” checklist

| Source | Duration | Layout properties |
|--------|----------|-------------------|
| Master header grids | 300ms | `grid-template-rows`, `overflow-hidden` children |
| `mobileCompactTransition` on multiple nodes | 200ms | padding, gap, min-height, font-size, box-shadow |
| `mobileFocusChromeTransition` | 300ms | + transform, opacity, padding |
| `main` inner padding | 300ms | padding |
| Sticky file header | 200ms + 300ms overlapping sets | padding, fonts, min-height, etc. |
| RO on sticky header | **continuous** | height observation → CSS var updates |

**Conclusion (forensic):** Scroll-reactive **`compactChrome` flip** launches **multiple concurrent layout transitions** (200–300ms) on **different subtrees** + **ResizeObserver-driven variable updates** — **high probability** of **compound layout work** per frame on mobile WebKit during that window.

---

*End of grid + padding transition analysis.*
