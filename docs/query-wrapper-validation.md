# Query wrapper validation

## Installed runtime

| package | declared | resolved (`package-lock.json`) |
|---------|----------|--------------------------------|
| `convex` | `^1.17.0` | **1.38.0** |

Path: `lender-app/node_modules/convex/dist/esm/react/client.js`

## Hook contracts (Convex 1.38.0)

### `useQuery(query, ...args)`

- `query`: **`FunctionReference`** or string UDF name.
- `args`: first rest arg is the argument object or `"skip"`.
- **Does not** accept `{ query, args, throwOnError }`.

### `useQuery_experimental(options)`

- `options.query`: function reference.
- `options.args`: args or `"skip"`.
- `options.throwOnError`: optional; `false` yields `{ status, data?, error? }` instead of throwing.

Exported from `convex/react` alongside `useQuery` (see `dist/esm-types/react/index.d.ts`).

## Wrapper: `useEffectivePermissionsQuery`

| aspect | before | after |
|--------|--------|-------|
| Hook used | `useQuery` + unsafe cast | `useQuery_experimental` |
| Passes raw ref? | Yes (`api.organizations.effectivePermissions`) | Yes |
| Invalid pattern? | Object form on **wrong** hook | **Fixed** |

## Wrapper: `useOrgPermissions`

- Does not call Convex hooks directly except via `useEffectivePermissionsQuery`.
- **Valid** once inner hook uses `useQuery_experimental`.

## Object-form `useQuery` elsewhere

`TaskDrawer`, `usePipelineFileWorkspaceData`, `tasks/page`, `TaskAttachmentsPanel` — all updated to `useQuery_experimental` for `{ throwOnError: false }` + tri-state handling via `normalizeSoftQueryRecord` / similar.

## Positional syntax requirement

For **non-experimental** behavior with error throwing, use:

```ts
useQuery(api.mod.fn, argsOrSkip);
```

For **object form + `throwOnError: false`**, use **`useQuery_experimental` only**.
