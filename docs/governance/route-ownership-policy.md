# Route ownership policy

**Binding.** Every App Router route MUST have a clear owner for layout, scroll, loading, and auth behavior.

---

## MUST document (in `route-ownership-map.md` or route-level doc comment)

- **Scroll owner** — default: `AppChrome` `<main>`. **Pipeline file workspace:** delegated **`[data-pipeline-workspace-scroll]`** — MUST cite **`docs/governance/runtime-workspace-scroll-authority.md`** + `scroll-architecture-rules.md`. Other exceptions MUST cite `scroll-architecture-rules.md`.
- **Layout owner** — which shell (`AppChrome` classic vs SaaS vs portal).
- **Loading owner** — `loading.tsx` / suspense boundaries.
- **Auth behavior** — public, session-required, portal grant, etc.
- **Mobile behavior** — compact chrome, bottom nav applicability, wide shell routes.
- **Responsive behavior** — breakpoints that change chrome or columns.
- **Caching strategy** — static vs dynamic; revalidation where used.

---

## New routes

Adding a route MUST update **`route-ownership-map.md`** (or linked subsection) in the same PR whenever behavior is non-default.

---

## Related

- `documentation-sync-policy.md`
- `canonical-system-map.md`
