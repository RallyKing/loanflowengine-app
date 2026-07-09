# Root cause — final report

## Exact offending pattern

**Using the object/options shape `{ query, args, throwOnError }` with `useQuery` instead of `useQuery_experimental`.**

Stable `useQuery` interprets the first parameter as the **function reference**. A plain object coerces to the string **`[object Object]`** in error messages when validated as a `FunctionReference`.

## Primary file (broadest blast radius)

| file | role |
|------|------|
| `lender-app/lib/useEffectivePermissionsQuery.ts` | Powers **`useOrgPermissions`**, used across pipeline, tasks, settings, contacts, ledger, etc. |

**Invalid shape:** options object passed as first argument to **`useQuery`**.

**Why it became an object instead of a functionReference:** the code assumed “Convex supports object-form `useQuery` with `throwOnError`” and used a TypeScript cast to silence arity mismatch. At runtime, **`useQuery` has no such overload** — that behavior is **`useQuery_experimental`**.

## Secondary call sites (same mistake)

| file |
|------|
| `lender-app/components/TaskDrawer.tsx` |
| `lender-app/hooks/usePipelineFileWorkspaceData.ts` |
| `lender-app/app/tasks/page.tsx` |
| `lender-app/components/TaskAttachmentsPanel.tsx` |

## What did *not* cause this

- Stale `convex/_generated` / missing `api.organizationResolver` (regenerated; build green).
- Barrel-export corruption of `api` (no evidence).
- Clerk removal or schema rewrite (orthogonal; error is hook overload misuse).

## Likely refactor that introduced it

Introduction of **“soft” queries** (`throwOnError: false`) and tri-state handling (`normalizeSoftQueryRecord`) using the **experimental** Convex API shape, but wired to **`useQuery`** — possibly copied from internal docs/snippets that reference experimental hooks, or conflated with a different Convex version’s API.

## Minimal fix applied

1. **`useEffectivePermissionsQuery`:** import and call **`useQuery_experimental`**; remove incorrect `useQuery` cast.
2. **Task attachment / count queries:** switch those object-form calls to **`useQuery_experimental`**; remove `as never` hacks.
3. **Docs in repo:** `lib/auth/safeConvexQuery.ts`, `lib/convexSoftQuery.ts` comments corrected to name **`useQuery_experimental`**.
4. **Regenerated** `convex/_generated/` via `npx convex codegen --typecheck disable`.

## Proof issue resolved

- `npm run build` in `lender-app/` succeeds after changes.
- Convex SDK source confirms **`useQuery_experimental`** is the only hook that accepts `{ query, args, throwOnError }` in 1.38.0.

## Follow-ups (optional)

- Fix `tests/visual/mobile-shell.spec.ts` missing `workspace-auth` helper so `npx tsc --noEmit` is clean.
- Run **`npx convex deploy`** in your environment when ready (not run from this session).
