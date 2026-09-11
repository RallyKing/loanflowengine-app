# Performance budget policy

**Binding** for shipped UX: scrolling, lists, pipeline file shell, and global chrome.

---

## MUST avoid

- **Render storms** — context/store churn forcing full-tree rerenders; narrow subscriptions.
- **Layout thrashing** — read/write layout loops; batch ResizeObserver updates.
- **Unbounded live subscriptions** — filter/paginate at source where feasible.
- **Runaway Convex consumption** — polling timers, unstable `useQuery` args, `Date.now()` inside query handlers, unbounded `.collect()`, idle `runAfter(0, self)` pumps, sub-15-minute crons. Binding rules: **`resource-consumption-policy.md`**.
- **Oversized DOM** — virtualize long pipeline lists and heavy tables where product allows.
- **Scroll blocking** — long tasks on main thread during scroll; defer work.
- **Bundle bloat** — lazy load rare panels; audit imports on large routes.

---

## Thresholds & measurement

Numeric guidance and CI hooks: **`performance-budget-thresholds.md`** + `docs/performance-rules.md`.

Convex-side budgets (subscription counts, idle write rates, monthly cost units) live in `lender-app/lib/convexCostBudget.ts` and are asserted by `tests/e2e/convex-cost-budget.spec.ts` and `tests/e2e/pipeline-idle-write-budget.spec.ts`. Static enforcement: `npm run verify:resource-safety`.

---

## Related

- **`resource-consumption-policy.md`** — Convex resource & cost safety (blocking)
- `component-architecture-policy.md`
- `observability-policy.md`
