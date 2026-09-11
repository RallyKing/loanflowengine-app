# State management policy

**Binding** for React and Convex client patterns.

**Convex reactivity:** how to *read and write* that state (push subscriptions, no pull mirrors, exhaustive-deps, mutation retry-safety) is **`convex-reactivity-policy.md`**. Cost/loop bans are **`resource-consumption-policy.md`**. This file is ownership and derivation — not a third copy of either.

---

## Every piece of state MUST declare

- **Owner** — component/facade/hook name.
- **Derivation source** — server record, URL, user preference, ephemeral UI.
- **Sync strategy** — optimistic vs pessimistic; how conflicts resolve. If the source is a Convex document, the strategy is **`useQuery` subscription**, not poll-and-store.
- **Persistence** — local only, Convex, or both; TTL if any.

---

## Three layers (MUST)

| Layer | Owner | Persistence | Examples |
|-------|-------|-------------|----------|
| **Server-authoritative** | Convex tables via `useQuery` / `useMutation` | Convex | Pipeline file, contacts, tasks, lenders, `fileSharedState` |
| **Ephemeral UI** | React `useState` / URL colocated with the owner | Session / URL | Drawer open, form drafts, bulk-select, hub focus |
| **Persisted preferences** | `localStorage` or org preference tables | Disk / Convex settings | Inspector width, sidebar expanded, hub sort, color scheme |

Convex is the server-state owner. React state is **not** a cache of Convex documents. `localStorage` is **not** an online replica of server rows (offline snapshots in `OfflineSyncContext` are fallback-only when `canUseHub` is false).

---

## MUST avoid

- **Duplicated derived state** — derive from source of truth or memoize intentionally. Do not `useState`+`useEffect` a `useQuery` result just to render (`convex-reactivity-policy.md` §3.3).
- **Hidden coupling** — globals, `window` hacks, cross-feature mutable singletons.
- **Implicit mutations** — side effects that mutate shared objects without going through Convex or documented buses (`fileSharedState`).
- **Cross-component ownership confusion** — two parents fighting one form state without lifting boundary.
- **Redux / Zustand / Context mirrors** of Convex documents used as a second database. Feature contexts wrap subscriptions or drafts; they do not replace `useQuery`.
- **Manual refresh / cache-buster state** to force Convex to "update" — the subscription already pushes.

---

## Maps

See **`state-ownership-map.md`** for platform-wide expectations.

---

## Related

- `canonical-source-rules.md`
- `component-architecture-policy.md`
- `convex-reactivity-policy.md`
- `resource-consumption-policy.md`
