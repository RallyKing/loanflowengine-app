# Function reference audit (Convex)

**Symptom:** `[object Object] is not a functionReference`

**Scope:** `lender-app/` — all `useQuery` / `useMutation` / `useAction` / `convex.*` usages were searched. The generated `api` object itself was not corrupted; the failure was **passing a plain options object into the wrong `useQuery` overload**.

## Method

Ripgrep patterns: `useQuery(`, `useMutation(`, `useAction(`, `convex.query(`, `convex.mutation(`, `api.`, `internal.`, `useEffectivePermissionsQuery`, `useOrgPermissions`, `OrganizationSettingsPanel`, `ConvexProvider`, `ConvexReactClient`.

**Expected shape (stable `useQuery`):** first argument must be a Convex **function reference** (e.g. `api.organizations.listMembers`) or a string UDF name; second argument is args or `"skip"`.

**Invalid for stable `useQuery`:** first argument = `{ query, args, throwOnError }` (that shape is for `useQuery_experimental` in Convex 1.38.x).

## Violations (confirmed)

All of the following used **`useQuery({ query: …, args: …, throwOnError: … })`**, which forwards the **entire object** as the “query” to `useQuery(query, …args)`. Runtime then treats that object as a `FunctionReference` and fails.

| file | line (pre-fix) | expected | actual (invalid) | why invalid | confidence |
|------|----------------|----------|------------------|-------------|------------|
| `lender-app/lib/useEffectivePermissionsQuery.ts` | ~75–86 | `useQuery_experimental({…})` or `useQuery(api.organizations.effectivePermissions, args)` | `useQuery` + cast, object as first arg | Wrong overload; object is not a function reference | **High** |
| `lender-app/components/TaskDrawer.tsx` | ~195–202 | same | `useQuery({ query, args, throwOnError })` | Same | **High** |
| `lender-app/hooks/usePipelineFileWorkspaceData.ts` | ~122–129 | same | same | Same | **High** |
| `lender-app/app/tasks/page.tsx` | ~1370–1377 | same | same | Same | **High** |
| `lender-app/components/TaskAttachmentsPanel.tsx` | ~129–133 | same | same | Same | **High** |

## Non-violations (sample)

- **Positional** `useQuery(api.foo.bar, args)` and `useQuery(api.foo.bar, "skip")` across the app — **valid**.
- **`useMutation` / `useAction`** — first arg is always a function reference in this repo; **no object-form misuse found**.
- **`lender-app/lib/organizationResolver.ts`** — `useQuery(api.organizationResolver.listAllOrganizations, …)` — **valid**.
- **`lender-app/components/OrganizationSettingsPanel.tsx`** — `useQuery(api.organizations.brandingForMember, …)` and other positional calls; `useEffectivePermissionsQuery` was the risky path — **valid after wrapper fix**.
- **`ConvexClientProvider.tsx`** — standard `ConvexReactClient` + `ConvexProvider` — **valid**.

## Barrel / serialization checks

No matches for spreading `api` / `internal`, or `JSON.parse` of API refs.

## Remediation direction

Replace object-form calls with **`useQuery_experimental`** from `convex/react`, or use positional `useQuery(ref, args)` only.
