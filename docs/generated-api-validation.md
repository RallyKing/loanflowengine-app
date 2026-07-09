# Generated Convex API validation

## Regeneration procedure (performed)

From `lender-app/`:

1. Removed `convex/_generated/` entirely.
2. Ran `npx convex codegen --typecheck disable` (synced with deployment, regenerated bindings).

## Artifacts verified

| file | role |
|------|------|
| `convex/_generated/api.d.ts` / `api.js` | Public `api` tree for `useQuery` / mutations / actions |
| `convex/_generated/server.d.ts` / `server.js` | Server-side helpers |
| `convex/_generated/dataModel.d.ts` | Table IDs and document types |

## Spot checks

- **`api.d.ts`** imports modules under `convex/` (e.g. `organizations`, `tasks`, `organizationResolver`, `auth/*`) and exports a single `api` object typing them. No duplicate root namespaces observed in the generated header.
- **No evidence** in this failure of “missing export” or “stale function removed” — the runtime error occurred **before** the client could resolve a UDF name, because the hook received a **non-reference** first argument.

## Stale signatures / orphans

Full diff of pre/post codegen was not hand-diffed line-by-line; regeneration was clean (command exit 0). If a symbol were missing, TypeScript would fail on `api.foo.bar` imports — **`next build` succeeded** after the hook fix.

## Clerk-specific note

Generated API still includes auth modules under `convex/auth/*` in typings; presence of those paths is **orthogonal** to the `[object Object]` error (wrong `useQuery` overload).
