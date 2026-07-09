# Import corruption trace

## Question

Did a barrel export, default wrapper, or serialization strip Convex `FunctionReference` branding?

## Findings

| pattern | searched | result |
|---------|----------|--------|
| `const fn = { ...api.* }` | repo-wide | **none** |
| `JSON.parse` of api refs | repo-wide | **none** |
| `computedApi.organizations`-style re-exports mutating `api` | manual review of permission hooks | **none** |
| Wrong hook overload (object to `useQuery`) | `useQuery({` | **5 call sites + 1 wrapper** — see `function-reference-audit.md` |

## Chains reviewed

- `@/convex/_generated/api` → direct property access (`api.organizations.*`, `api.tasks.*`) — **clean**.
- `useOrgPermissions` → `useEffectivePermissionsQuery` — **wrapper passed refs correctly inside the options object, but called the wrong hook** (`useQuery` instead of `useQuery_experimental`).
- `lib/auth/safeConvexQuery.ts` — documentation only; updated to name `useQuery_experimental`.

## Conclusion

**No import corruption.** The bug was **API misuse at the React hook layer**, not a broken module graph or proxy-stripped references.
