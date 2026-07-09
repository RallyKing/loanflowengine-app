# Performance budget thresholds

**Guidance + enforcement targets.** Pair with `performance-budget-policy.md` and `docs/performance-rules.md`.

---

## Interaction budgets (guidance)

| Metric | Target (shipped paths) |
|--------|-------------------------|
| Scroll jank | No persistent hitch on mid-range devices during **active** vertical scroll (`<main>` on default routes; **`[data-pipeline-workspace-scroll]`** on pipeline file) |
| Input latency | Typing in primary fields stays < 50 ms perceived delay |
| Drawer open | First paint < 200 ms perceived; heavy work deferred |

---

## List virtualization

- Lists **> ~100–200 visible rows** (product dependent) SHOULD use virtualization or paging.

---

## Bundle

- Avoid adding **large** dependencies to hot routes without lazy loading.
- Run `next build` and inspect size warnings when adding packages.

---

## Automated / opt-in

- `npm run test:performance` / `PERF_SCROLL_MS` gates where configured — use for risky scroll work.

---

## Related

- `component-risk-assessment.md`
- `observability-policy.md`
