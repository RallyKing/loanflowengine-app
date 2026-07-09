# Documentation synchronization policy

**Binding drift prevention.** Docs are part of the deliverable.

---

## After ANY of the following, update docs in the SAME PR (or immediately after, same release)

- Architectural / ownership change (maps in `docs/governance/*.md`).
- Layout / scroll / sticky behavior (`scroll-architecture-rules.md`, `route-ownership-map.md`, **`runtime-workspace-scroll-authority.md`** for pipeline file).
- State or data flow change (`state-ownership-map.md`, `canonical-system-map.md`).
- Workflow / automation / webhook semantics (`automation-webhook-safety-policy.md`, `integration-architecture-policy.md`).
- New route or auth behavior (`route-ownership-map.md`).
- Design-system primitive additions (`design-system-component-map.md`).

---

## Verification

- **`npm run verify:governance:docs`** — ensures manifest-listed files exist (not semantic drift).
- Teams SHOULD add checklist items in PR template referencing this policy.

---

## Related

- `ai-governance-policy.md`
- `feature-completion-policy.md`
