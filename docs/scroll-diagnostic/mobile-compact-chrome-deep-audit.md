# Deep audit — `MobileChromeController` + `mobileCompactChrome`

**Diagnostic only.** Focus: **compact mode triggers**, **thresholds**, **debounce/throttle**, and **layout coupling**.

---

## 1. `MobileChromeController.tsx` — state variables

| State | Initial | Purpose |
|-------|---------|---------|
| `scrollEl` | `null` | Reference to `<main>` DOM node |
| `compactSentinelEl` | `null` | Pipeline file 1px sentinel |
| `compactChrome` | `false` | **Single boolean** driving compact/focus for mobile |
| `isMdUp` | `false` until `matchMedia` runs | Disables compact on `md+` |

**Derived:** `isMobileCompactMode = !isMdUp && compactChrome`, `isMobileFocusMode = isMobileCompactMode` (L179–180) — **no separate focus state**.

---

## 2. Compact triggers (ordered)

1. **`navigationKey` change** (`useEffect` L88–90): `setCompactChrome(false)` — full reset on route.
2. **`suspendCompact` true** (L92–94): `setCompactChrome(false)` — e.g. SaaS `saasMenuOpen`.
3. **`isMdUp` or `suspendCompact`** (L104–107): `startTransition` **expand-only** guard `(prev ? false : prev)`.
4. **`scrollEl` change** (L109–111): reset `lastScrollTop` ref (non-pipeline scroll path).
5. **Pipeline path:** `IntersectionObserver` (L113–135): on intersection change → `setCompactChrome(!isIntersecting)` (expanded when sentinel visible).
6. **Non-pipeline path:** `scroll` → **max one `requestAnimationFrame` per burst** (L163–166): coalesces multiple scroll events to one `flush` per frame.

---

## 3. Scroll threshold logic (non-pipeline only)

Constants (L43–45):

- `SCROLL_DOWN_DELTA = 10`
- `SCROLL_UP_DELTA = -10`
- `TOP_EXPAND_PX = 48`

`flush` (L141–160):

- If `scrollTop < 48` → **force expanded** (`false`).
- Else if `delta > 10` → **compact** (`true`).
- Else if `delta < -10` → **expanded** (`false`).
- Else → **keep previous** `prev`.

**Implications:**

- No explicit debounce **time** — **rAF coalescing** only.
- During **momentum**, many frames can call `flush` with small deltas → **`return prev`** often — **stable** until a frame exceeds ±10px delta.
- **Can** flip compact mid-momentum when cumulative motion produces a large single-frame delta.

---

## 4. Pipeline file: IntersectionObserver semantics

```ts
{ root: scrollEl, threshold: 0, rootMargin: "0px" }
```

- **Binary:** sentinel visible ↔ expanded; not visible ↔ compact.
- **No** scroll-direction hysteresis (unlike non-pipeline).
- **Chatter risk:** sentinel **grazing** intersection boundary during scroll or **layout thrash** (sticky height / padding animation) can flip **intersection** multiple times.

**Initial sync:** `takeRecords()` after `observe` (L129–132) — one extra `setCompactChrome` in same mount cycle.

All IO updates wrapped in **`startTransition`** (L124, L132).

---

## 5. `mobileCompactChrome.ts` — what gets animated

| Export | Transitioned properties (max-md) | Layout impact |
|--------|----------------------------------|---------------|
| `mobileCompactTransition` | `padding`, `gap`, `box-shadow`, `min-height`, `font-size` (200ms) | **High** — padding/min-height/font affect layout |
| `mobileScrollCollapseGridClass` | `grid-template-rows` (300ms), `overflow-hidden` | **High** — row `0fr`/`1fr` changes track size |
| `mobileScrollRevealInnerClass` | `opacity`, `transform` (translateY) | Composited **+** clipping from `overflow-hidden` |
| `mobileContentBottomPadTransition` | `padding` (300ms) on **`main` child** | **High** |
| `mobileFocusChromeTransition` | `transform`, `opacity`, `padding`, `gap`, `box-shadow` (300ms) | **Mixed** |
| `mobileNavTransformTransition` | `transform`, `opacity` (300ms) | Mostly composited; nav still occupies layout when visible |
| `mobileWorkspaceStackClass` | **No transition** — instant `gap` change `max-md:gap-2` vs `gap-4 sm:gap-5` | **Instant layout** when `isCompact` flips |

---

## 6. Frequency analysis (theoretical)

| Path | State updates during scroll |
|------|-----------------------------|
| **Pipeline + IO** | **0** React updates from `scroll` events; **1+** per **intersection boundary** crossing (could be **2+** if oscillating). |
| **Non-pipeline + scroll** | Up to **1 `startTransition` per frame** while `flush` runs; **internal** `setCompactChrome` may no-op if `prev` unchanged. |

**“Measure” claim:** This audit **does not** include runtime `performance.measure` or React Profiler samples — see `render-layout-profile.md`.

---

## 7. ResizeObserver loops

`MobileChromeController` **does not** use `ResizeObserver`.

Loops would involve: **compact** → **sticky/header/layout change** → **`PipelineFileWorkspaceShell` RO** → `setStickyChromeHeightPx` → **CSS vars** → **scroll-margin** (sections) — **unlikely infinite** if height **converges**; **possible repeated** deliveries if height **oscillates** during **padding transitions**.

---

*End of deep audit.*
