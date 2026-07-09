# Performance rules (mandatory)

**Status:** Permanent standards for runtime efficiency and perceived speed.  
**Primary constraint:** **Optimize for mobile first** — low CPU, constrained memory, and scroll compositing dominate.

---

## Rendering and React

1. **Prevent rerender storms** — Narrow Context providers; memoize hot selectors; stable list keys; avoid inline object/array literals in props on heavy trees.
2. **Avoid layout thrashing** — Batch DOM reads/writes; avoid synchronous layout queries inside scroll handlers.
3. **Lazy loading** — Route-level and heavy block-level `dynamic`/lazy imports where appropriate (especially pipeline blocks).
4. **Virtualize large lists** — Tables and directories beyond trivial row counts should use virtualization patterns already established in the codebase.
5. **Maintain smooth scrolling** — Prefer GPU-friendly properties (`transform`, `opacity`); keep main-thread work off scroll-critical paths.
6. **Observers and listeners** — Do not register ResizeObserver/MutationObserver/intersection listeners without teardown; debounce resize-driven style mutations; avoid feedback loops (see scroll architecture doc).
7. **Validate on mobile** — Scroll bursts, drawer open/close, and typing must remain responsive; use Playwright perf-oriented specs where present (`tests/mobile/performance/`, optional `PERF_SCROLL_MS`).

---

## Data layer (Convex / client)

- Prefer **targeted queries** over fetching oversized graphs for simple views.
- Avoid redundant **subscriptions** when a single combined query suffices.
- Client caches: respect Convex patterns; do not duplicate authoritative server state in unbounded local structures.

---

## Assets

- Images: appropriate sizing, modern formats where applicable, lazy loading below the fold.
- Fonts: minimize FOIT/FOUT‑induced CLS; reserve layout where needed.

---

## Testing expectations

- **Build** must pass (`npm run build`).
- **Mobile automated suites** must pass for changes touching layout, lists, or shell (`npm run test:mobile` minimum).
- Deep regressions: `npm run test:mobile:matrix`, pipeline scroll suites as documented in `docs/mobile-testing-rules.md`.

---

## References

- `docs/scroll-architecture-rules.md` — scroll-specific compositing and observer discipline.
- `docs/ai-development-rules.md` — summary performance bullets.

---

*These rules are required reading before performance-sensitive refactors.*
