# Mobile viewport & dynamic viewport audit

**Diagnostic only.** Focus: units and behaviors that trigger **viewport recalculation** on mobile (iOS Safari, Android Chrome).

---

## 1. Next.js `viewport` export

**File:** `lender-app/app/layout.tsx`

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};
```

**Implications:**

- `viewportFit: "cover"` → safe-area insets apply (home indicator, notch). Code uses `env(safe-area-inset-bottom)` in several paddings (`AppChrome` main inner wrapper, `PipelineFileWorkspace` drawer body, `MobileBottomNav`).
- `maximumScale: 5` allows zoom — can interact with “virtual viewport” vs “layout viewport” when user zooms (not scroll-specific but affects perceived layout).

---

## 2. `html` / `body` height model

| Source | Rule |
|--------|------|
| `globals.css` `html` | `height: 100%`, `min-height: 0` |
| `globals.css` `body` | `height: 100%`, `min-height: 0`, **`overflow-y: hidden`** |
| `layout.tsx` `<body>` | `className` includes **`h-full`** … `overflow-hidden` (note: not `h-dvh` on body in current layout snippet — differs from some comments elsewhere) |
| Root signed-in wrapper | `div.flex.min-h-0.flex-1.flex-col` around `AppChrome` |

**Diagnostic:** Chain is **`100%` height** from `html` downward, not exclusively `dvh`. **iOS** dynamic URL bar changes affect **`100vh`-class** issues historically; this app leans on **`flex-1 min-h-0`** inside viewport-sized shell rather than `min-h-screen` on pages.

---

## 3. `dvh` / `vh` / `min()` usage — pipeline file path

| Location | Pattern | Role |
|----------|---------|------|
| `PipelineFileWorkspace.tsx` loading skeleton | `min-h-[min(55dvh,24rem)]` | Placeholder height only |
| `PipelineFileWorkspace.tsx` drawer body | `pb-[max(1.5rem,env(safe-area-inset-bottom))]` | Bottom inset — **changes** when safe-area env differs |
| `AppChrome` classic `main` inner | `pb-[max(5.5rem,calc(4.25rem+env(safe-area-inset-bottom)))]` when bottom nav visible | Large bottom clearance for **fixed** nav |
| `AppChrome` focus mode | `mobileFocusMainBottomPadClass` → `max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]` | **Suddenly smaller** when focus — changes **scrollable height** of `main` |
| `TaskDrawer` / `LenderDrawer` | `h-dvh max-h-dvh`, `max-h-dvh` on full-screen shell | Drawers tie to **dynamic viewport** |

**`svh` / `lvh`:** Not observed in pipeline file workspace core; may exist elsewhere in repo (intake, share manager uses `dvh` in max-height calc).

---

## 4. Fixed viewport sizing patterns

| Component | Pattern |
|-----------|---------|
| `MobileBottomNav` | `fixed bottom-0` + `env(safe-area-inset-bottom)` padding |
| Drawers | `fixed inset-0` or `aside` with `h-dvh` |
| `SaasSidebar` mobile | `fixed` + `h-dvh` |

**Address bar show/hide:** Browsers adjust **visual viewport**; **`dvh`** tracks better than **`vh`** for full-bleed drawers. **`main`** content uses **flex** + **percentage chain** — behavior vs URL bar depends on whether the flex column’s height is tied to `dvh` or `100%` of initial containing block. **Outer** `AppChrome` is `flex-1` inside `body` `h-full` — **subtle** coupling to **layout viewport**.

---

## 5. Keyboard / visual viewport

**Code audit:** No `visualViewport` API usage found in quick grep of pipeline stack. **Expected:** Focusing inputs near bottom of **`main`** may trigger **keyboard** opening → **layout viewport** resize on iOS/Android → **`100%` height chain** may **not** match **visible** area → user perceives **jump** or **obscured field**.

**Not verified in this diagnostic session** on physical devices.

---

## 6. `overscroll-behavior`

| Surface | Rule |
|---------|------|
| `main` | `overscroll-behavior-y: contain` (via Tailwind `overscroll-contain` on element + notes in `globals.css`) |

**Intent:** Reduce scroll chaining to locked `body`. **Side effect:** Rubber-band physics differ from native page scroll.

---

## 7. iOS / Android hypothesis — ranked (needs device confirmation)

| Hypothesis | Mechanism | Confidence |
|------------|-----------|------------|
| URL bar show/hide changes inner `main` height | Flex `%` height vs visual viewport | Medium |
| Focus mode toggles **main** bottom padding + translates nav | `scrollHeight` of `main` changes mid-gesture | Medium–high |
| `ResizeObserver` on sticky header updates CSS vars | `scroll-margin` / sticky offset perception | Medium |
| Keyboard opens without `visualViewport` compensation | Obstruction / jump | Medium (common industry pattern) |
| `dvh` drawers vs `100%` shell | Mismatch when comparing overlay vs page | Low–medium |

---

*End of mobile viewport audit.*
