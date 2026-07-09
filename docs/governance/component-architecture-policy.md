# Component architecture policy

**Binding.** Components MUST respect separation of concerns and avoid “god components.”

---

## Layering

- **Pages / shells** — routing, layout chrome, data prefetch boundaries.
- **Feature modules** — domain UI (pipeline file, tasks hub).
- **Primitives** — design-system level buttons, inputs, panels.
- **Data hooks** — Convex subscriptions and mutations wrapped for the feature.

MUST NOT mix **unrelated domains** in one file without a named facade (e.g. pipeline file shell may orchestrate blocks, but must not embed lender enrichment logic inline unbounded).

---

## Maintainability thresholds (guidance)

Trigger a refactor discussion when a component:

- Exceeds **~800–1000 lines** of product logic without extraction, or
- Owns **both** unrelated **Convex** domains **and** **layout/chrome** concerns, or
- Requires **scroll/sticky hacks** that belong in shell utilities.

Tracked hotspots: see **`component-risk-assessment.md`**.

---

## Monitored files

`PipelineFileWorkspace`, `AppChrome`, `MobileChromeController` — changes MUST consider scroll/mobile contracts and rerender cost (`performance-budget-policy.md`).

---

## Related

- `no-shadow-systems-policy.md`
- `state-management-policy.md`
