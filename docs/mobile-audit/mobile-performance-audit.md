# Mobile performance audit

**Audit date:** 2026-05-07 · **Diagnostic only** — no profiler captures in this pass.

---

## 1. Summary

Performance risk is **concentrated** in: (a) **scroll-linked React state** (`MobileChromeController`, pipeline compact observers), (b) **large client surfaces** (`PipelineFileWorkspace`, intake, lenders directory), (c) **unvirtualized lists/tables** on data-heavy orgs, (d) **global listeners** (product tour / scroll capture per prior diagnostic).

**FPS / layout / paint profiling** was **not** executed here; this document ranks **risk** and prescribes **how** to profile before fixes.

---

## 2. Rerender & React churn (static signals)

| Area | Signal | Risk |
|------|--------|------|
| Pipeline file workspace | Very large component file; many hooks/queries | **High** — any scroll/layout update may fan out |
| Mobile chrome | Scroll + IO listeners updating context/state | **High** |
| Pipeline list table | Wide DOM (`min-w-[1500px]`), many cells | **High** on low-end Android |
| Tasks page | Matrix + subtasks + `max-h` scroll regions | **Medium–High** |
| Convex subscriptions | Multiple `useQuery` on file page | **Medium** — watch over-subscription |

---

## 3. Layout & paint

- **Sticky + measured heights** → repeated **layout** when `ResizeObserver` fires.
- **Transform-based** nav animation — good (compositor-friendly).
- **Table sticky header** + shadows — can increase **paint cost** during scroll of inner scrollport.

---

## 4. Hydration & SSR

- Next.js 15 App Router — client-heavy workspace likely **waits** on JS for full interactivity.
- **Risk:** layout shift when client-only chrome kicks in — ties to CLS specs.

---

## 5. Input lag

- Dense tables + touch pan-x/pan-y competition may feel **sluggish** even if FPS is OK.
- Search palettes / debounced queries — verify **not** blocking main thread on each keystroke beyond reason.

---

## 6. Observers & listeners (systemic)

Prior **`scroll-rerender-analysis.md`** theme: intersection observers + scroll handlers should be **throttled** / **passive** / **scoped**.

- **Action (future):** Chrome Performance panel → record 10s pipeline scroll on throttled CPU 4×.

---

## 7. Recommended profiling protocol (before fixes)

1. **Physical iPhone** + Safari Web Inspector — **Performance** trace: scroll pipeline file 20s, open/close task drawer.
2. **Chrome remote debugging** on Pixel — same flow.
3. **React Profiler** (local dev): record **PipelineFileWorkspace** mount/update counts during compact toggle.
4. **Lighthouse mobile** on staging — **TBT**, **CLS**, **INP** (field data if available).

---

## 8. Quick automated hooks existing today

- `tests/mobile/performance/scroll-burst-budget.spec.ts` — optional `PERF_SCROLL_MS`.
- CLS spec — `scroll-stability-cls.spec.ts`.

---

*Issues tracked as PERF-\* in `mobile-issue-inventory.md`.*
