# No shadow systems policy

**Binding.** Shadow systems = duplicate implementations, parallel UX, or hidden flows that bypass canonical owners (`canonical-source-rules.md`).

---

## Forbidden without explicit exception

- **Parallel “mini apps”** — new top-level navigation or shells that duplicate AppChrome responsibilities.
- **Duplicate domain systems** — second contact store, second pipeline model, second task engine, second lender directory.
- **Hidden workflows** — automation or mutations only reachable from one obscure UI with no shared validation path.
- **Redundant block systems** — new modular regions outside `pipelineBlockRegistry` / documented block patterns **unless** extending the registry.
- **Shadow scroll owners** — vertical scroll on `document.body` or route wrappers that compete with the **active** owner: `<main>` on default routes **or** **`[data-pipeline-workspace-scroll]`** on the pipeline file route (`scroll-architecture-rules.md`, **`runtime-workspace-scroll-authority.md`**).

---

## Before ANY new system

1. **Search** the repo and read `duplicate-system-watchlist.md` + `project-intelligence-summary.md`.
2. **Reuse** existing blocks, Convex modules, and UI primitives.
3. **Justify duplication** in writing (ADR or PR rationale): cost of reuse vs risk; link from `duplicate-system-watchlist.md` if the exception is long-lived.

---

## Enforcement

- Code review + AI review against this policy.
- `verify:governance:docs` ensures policies stay present.
- Architecture maps (`canonical-system-map.md`) must stay accurate when ownership changes.

---

## Related

- `temporary-code-policy.md`
- `component-architecture-policy.md`
