# Final scroll validation — Phase 4

This document ties **Phase 4 regression** to the scroll architecture from Phases 1–3. It is a **checklist**, not a full automatic proof for every UI state.

---

## Single vertical scroll owner

| Check | Expected | Verified by |
|-------|----------|-------------|
| `body` does not become the vertical scrollport in the signed-in shell | `overflow-y` is `hidden` or `clip` on `body[data-shell=app]` | `app-chrome-scroll-owner.spec.ts`, `surface-scroll.spec.ts` (chromium), `globals.css` |
| **Default routes:** primary vertical scroll is `<main data-testid="app-main-scroll">` | `overflow-y: auto` on main; user can scroll content | `ci-mobile-scroll.spec.ts`, gesture specs |
| **Pipeline file route:** primary vertical scroll is **`[data-testid="pipeline-workspace-scroll"]`** | `<main>` is `overflow-y-hidden`; workspace scroller receives vertical pans | `tests/mobile/workspace-sheet/`, pipeline file scroll specs — **do not** assert file body scroll only via `app-main-scroll` |

---

## Nested scroll exceptions (allowed)

These are **intentional** secondary scrollports; they must not steal vertical scroll from the **active route owner** (`<main>` **or**, on the file route, **`[data-pipeline-workspace-scroll]`**), and drawers must remain overlay-only.

| Pattern | Examples | Validation |
|---------|-----------|------------|
| Drawer body | `TaskDrawer`, `LenderDrawer` (`touch-scroll-y`, `h-dvh max-h-dvh`) | E2E `tasks-drawer.spec.ts` when Convex + auth ready; **manual** rapid open/close |
| Modals / dialogs | Radix/headless patterns with internal scroll | **Manual** per high-traffic flows |
| Horizontal strips | Pipeline table horizontal pan | Must not force nested **vertical** page scroll; **manual** on narrow widths |
| Short list regions | e.g. `max-h-64 overflow-y-auto` on contacts | `surface-scroll.spec.ts` nested scroller caps (chromium) |

---

## Sticky + compact (Phase 2–3)

| Check | Expected |
|-------|----------|
| Compact / focus mode | Uses **transform / opacity** for chrome motion where designed; **no** layout-affecting swaps on `main` padding tied to scroll (see AppChrome Phase 4 comments). |
| Sticky anchor | **Hub/list:** sticky regions anchor to `<main>`. **File workspace:** sticky regions anchor inside **`[data-pipeline-workspace-scroll]`**, not `<main>`. |
| Bottom nav | Visibility via transform; safe-area aware; does not steal main scroll (Phase 3 docs). |

---

## Automated signals (performance / thrash)

| Signal | Where |
|--------|--------|
| Scroll-linked state coalescing | `MobileChromeController` (IO debounce, `startTransition`) |
| Scroll burst budget | `tests/mobile/performance/scroll-burst-budget.spec.ts` (opt-in via `PERF_SCROLL_MS`) |
| CLS guard | `tests/mobile/scroll/scroll-stability-cls.spec.ts` |

**Note:** Phase 4 did **not** run browser FPS profiling in CI. Treat **smooth scrolling** as validated by **passing gesture tests + manual** device checks.

---

## Gaps (explicit)

- **Playwright `tablet` (iPad WebKit)** does not support **`page.mouse.wheel`** — desktop/tablet wheel-based E2E assertions need a **`scrollBy` fallback** for WebKit if those projects are treated as release gates (see `final-known-issues.md`).
- **Every modal / every overlay** is not exhaustively automated in `tests/mobile`.

---

## Commands (reference)

```bash
cd lender-app
npm run build
npx playwright test tests/mobile --project "Mobile Chrome" --project "Mobile Safari"
```

Broader staging:

```bash
npm run test:mobile:matrix
```
