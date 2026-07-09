# Package integrity report

## Core stack (`lender-app/package.json`)

| dependency | version |
|------------|---------|
| `next` | 15.5.15 |
| `react` / `react-dom` | ^18.3.1 |
| `convex` (declared) | ^1.17.0 |

## Lockfile resolution

- **`convex`:** **1.38.0** (single `node_modules/convex` entry in `package-lock.json`).

No duplicate Convex installs or mixed minor versions detected in the lockfile grep.

## Typings vs runtime

`convex` ships `dist/esm-types/react/index.d.ts` exporting both `useQuery` and `useQuery_experimental`. The stable `useQuery` typing is **arity-2**, which previously encouraged an incorrect cast in `useEffectivePermissionsQuery` instead of importing the experimental hook.

## Typecheck status

`npx tsc --noEmit` currently fails on an **unrelated** test import:

- `tests/visual/mobile-shell.spec.ts` — cannot resolve `../../helpers/workspace-auth`.

This predates / is outside the Convex hook fix. **`npm run build` (Next.js)** completed successfully.

## Compatibility conclusion

No version skew between `convex`, `convex/react`, and generated `api`; the failure mode was **incorrect hook selection**, not a broken package graph.
