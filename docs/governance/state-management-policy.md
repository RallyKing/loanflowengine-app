# State management policy

**Binding** for React and Convex client patterns.

---

## Every piece of state MUST declare

- **Owner** — component/facade/hook name.
- **Derivation source** — server record, URL, user preference, ephemeral UI.
- **Sync strategy** — optimistic vs pessimistic; how conflicts resolve.
- **Persistence** — local only, Convex, or both; TTL if any.

---

## MUST avoid

- **Duplicated derived state** — derive from source of truth or memoize intentionally.
- **Hidden coupling** — globals, `window` hacks, cross-feature mutable singletons.
- **Implicit mutations** — side effects that mutate shared objects without going through Convex or documented buses (`fileSharedState`).
- **Cross-component ownership confusion** — two parents fighting one form state without lifting boundary.

---

## Maps

See **`state-ownership-map.md`** for platform-wide expectations.

---

## Related

- `canonical-source-rules.md`
- `component-architecture-policy.md`
