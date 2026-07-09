# Mobile reproduction report

**Diagnostic only.** This section documents **how to reproduce** issues and what **automated** coverage exists.  

**Session limitation:** This investigation was performed from **static source analysis** and **repo test references** only. **No** physical iPhone Safari or Android Chrome sessions were executed in this environment; **no** screenshots or Chrome DevTools performance traces were captured here.

---

## 1. Automated / emulator coverage (repo)

| Artifact | Path | Device profile |
|----------|------|----------------|
| Pipeline scroll stress | `lender-app/tests/e2e/pipeline-scroll.spec.ts` | Describes Mobile Chrome (Pixel) + Mobile Safari (iPhone) projects |
| Pipeline file mobile layout | `lender-app/tests/e2e/pipeline-file-mobile-layout.spec.ts` | Scroll width, file-details vs sticky chrome |
| CI mobile scroll | `lender-app/tests/mobile/scroll/ci-mobile-scroll.spec.ts` | Basic `main` scroll + `touch-action` |
| Tasks drawer scroll | `lender-app/tests/e2e/tasks-drawer.spec.ts` | Locates `.touch-scroll-y.overflow-y-auto` |

**AGENTS.md** instructs: run mobile pipeline scroll tests + **manual** physical device sign-off.

---

## 2. Suggested reproduction — scroll jump / momentum

**Route:** Open a pipeline **file** deal page on **mobile width** (`<768px`).

1. **Baseline:** With page at top, note `main` scroll position = 0.
2. **Slow drag:** Scroll `<main>` down slowly — observe master header + file sticky chrome **height/padding** transitions when crossing compact threshold (pipeline file: sentinel + `IntersectionObserver`; other routes: scroll delta).
3. **Fast flick:** Flick scroll vertically on **non-input** area of `main` — note if momentum **stops early** or **rubber-bands** oddly vs native page (overscroll `contain` on `main`).
4. **Nested list:** Open a panel with **`max-h-* overflow-y-auto`** (e.g. activity list), scroll **inside** list to end, then drag **past** end — observe whether **`main`** takes over or gesture **stalls**.
5. **Compact toggle band:** Scroll so sentinel **barely** crosses threshold — observe **toggle chatter** (expanded/compact loop) if intersection boundary oscillates.

**Record if possible:** Chrome remote devtools **Performance** panel (mobile), **Layout Shift** regions, **scroll** events/sec.

---

## 3. Sticky file header

1. Scroll until file header is **stuck** under master header.
2. Toggle fields that **change** file chrome height (e.g. long title edit, snooze banner if visible).
3. Watch for: **jump** in `scrollTop`, **overlap** with first modular section, **`scroll-margin`** feeling wrong for `#file-details`.

---

## 4. Layout shift clues

1. Trigger **focus mode** (scroll down until bottom nav hides + compact chrome).
2. Scroll back to top — observe **padding** change on `main` inner wrapper (`mobileContentBottomPadTransition`).
3. Note **CLS** if using Lighthouse / Web Vitals locally.

---

## 5. Overlays

1. Open **Global Search** / **TaskDrawer** / **LenderDrawer** while scrolled mid-page.
2. Close overlay — confirm **`main`** scroll position **unchanged** (expected) vs reset (bug).

---

## 6. Product tour (if enabled)

1. Start tour on a page with scrolling.
2. Observe **stutter** — tour attaches **`window` scroll capture** + `setInterval` **`refreshRect`** (`ProductTourOverlay.tsx`).

---

## 7. Placeholder for device captures

| Device | OS version | Browser | Outcome | Screenshot / trace link |
|--------|------------|-----------|---------|-------------------------|
| *To be filled by QA* | | | | |

---

*End of mobile reproduction report.*
