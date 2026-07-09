# Performance budget policy

**Binding** for shipped UX: scrolling, lists, pipeline file shell, and global chrome.

---

## MUST avoid

- **Render storms** — context/store churn forcing full-tree rerenders; narrow subscriptions.
- **Layout thrashing** — read/write layout loops; batch ResizeObserver updates.
- **Unbounded live subscriptions** — filter/paginate at source where feasible.
- **Oversized DOM** — virtualize long pipeline lists and heavy tables where product allows.
- **Scroll blocking** — long tasks on main thread during scroll; defer work.
- **Bundle bloat** — lazy load rare panels; audit imports on large routes.

---

## Thresholds & measurement

Numeric guidance and CI hooks: **`performance-budget-thresholds.md`** + `docs/performance-rules.md`.

---

## Related

- `component-architecture-policy.md`
- `observability-policy.md`
