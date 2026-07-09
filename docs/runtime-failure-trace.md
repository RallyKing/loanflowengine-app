# Runtime failure trace

## Error string

`[object Object] is not a functionReference`

## Static trace (no production instrumentation required)

Convex client `useQuery` implementation (`node_modules/convex/dist/esm/react/client.js`, ~448–465):

1. `query` parameter receives the **first argument** from the call site.
2. `queryReference = typeof query === "string" ? makeFunctionReference(query) : query`
3. `queryName = getFunctionName(queryReference)` — expects a real `FunctionReference`.

When the call site passed `{ query: api.tasks.countTaskFilesForTasks, args, throwOnError: false }`:

- `queryReference` became that **plain object**.
- `getFunctionName` / internal validation rejected it → **`[object Object] is not a functionReference`**.

The **first invalid object** entering Convex’s query subscription path was therefore the **options object**, not a bad `api` export.

## Why full hook instrumentation was not applied

Repo-wide wrapping of every `useQuery` would be high-churn and redundant once the SDK source and the five call sites were aligned. If future ambiguity remains, **targeted** logging at app bootstrap can assert:

```ts
function assertFunctionReference(label: string, ref: unknown) {
  if (ref == null || typeof ref !== "object") {
    console.error(label, "not an object", ref);
    return;
  }
  // Convex references are opaque; log constructor/name keys only in dev
  console.debug(label, ref);
}
```

…immediately **before** each suspect call (not committed here).

## Execution order / user impact

Any route mounting **`useEffectivePermissionsQuery`** (used widely via **`useOrgPermissions`**) would throw early in the session. Task surfaces using attachment counts would throw when those components mounted. This matches a **global** “app broke after refactor” report.
