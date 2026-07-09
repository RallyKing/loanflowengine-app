# Loan Flow Pro — Unified Registry Integration Bundle

Source: **Direct Lending Connection** (`lender-app/`) — Phases Registry-1 (data foundation), Registry-2 (federated read model), Registry-3 (Unified Registry Explorer UI + CRUD).

Everything referenced below is staged in **`/export-bundle`** at the workspace root, mirroring the target directory layout. The running application was not modified.

---

## 1. Bundle Contents & File Mapping

Copy each file to the identical path in the Loan Flow Pro repo (paths are relative to the Next.js app root, e.g. `src/` or repo root depending on your layout).

### 1a. Core data models (Phase 1 & 2)

| Bundle file | Target path | Purpose |
|---|---|---|
| `lib/registry/universalRoles.ts` | `lib/registry/universalRoles.ts` | Canonical `RegistryRoleId` catalog, display names, legacy→registry maps, `coerceRegistryRoleId`, conversion defaults |
| `lib/registry/registryItem.ts` | `lib/registry/registryItem.ts` | `RegistryItem` federated interface + doc→item mappers, search/role/type filters, sorters (shared client/server) |
| `convex/registryRoleValidators.ts` | `convex/registryRoleValidators.ts` | Convex `v.union` validator mirroring the role catalog (`registryRoleIdV`) |
| `convex/schema.registry-extract.ts` | *(merge — see §3)* | Verbatim table definitions: `contacts`, `clients`, `lenders`, `entityContactLinks`, `clientContactLinks`, `contactFileLinks`, `contactLenderLinks`, `libraryDocumentLinks` |
| `convex/registry.ts` | `convex/registry.ts` | Federated `api.registry.list` read model (contacts + clients + lenders) |
| `convex/crmConsolidation.ts` | `convex/crmConsolidation.ts` | Non-destructive `convertContactToEntity` mutation (+ merge tooling) |
| `convex/entityContactLinkHelpers.ts` | `convex/entityContactLinkHelpers.ts` | `upsertEntityContactLink` — idempotent entity↔contact junction writes |
| `convex/libraryDocumentRegistryAccess.ts` | `convex/libraryDocumentRegistryAccess.ts` | ACL helpers for entity (`clientId`) and lender (`lenderId`) document-vault links |
| `lib/contact/contactRoles.ts` | `lib/contact/contactRoles.ts` | Legacy master-role helpers consumed by `registryItem.ts` and the edit modal |
| `lib/contact/contactMethods.ts` | `lib/contact/contactMethods.ts` | Primary email/phone resolvers over multi-value `emails[]`/`phones[]` |

### 1b. UI / navigation components (Phase 3)

| Bundle file | Target path | Purpose |
|---|---|---|
| `components/registry/RegistryWorkspaceClient.tsx` | same | Orchestrator: filters state, `useQuery(api.registry.list)`, modal wiring, delete flows |
| `components/registry/RegistryCommandBar.tsx` | same | Sticky command bar (`sticky top-0 z-40 bg-white/95 backdrop-blur border-b`): Add New dropdown, debounced search (`useRegistrySearchDebounce`), type + role multi-select filters |
| `components/registry/RegistryDataTable.tsx` | same | High-density table: type icons, role badges, contact info, relative `updatedAt`, row-click hub routing, `...` action menu (Edit / View Vault / Promote to Entity / Delete) with `stopPropagation` isolation |
| `components/registry/RegistryEditModal.tsx` | same | Unified edit modal — branches mutations by `registryType` (see §5) |
| `components/registry/RegistryCreateLenderModal.tsx` | same | Quick-create lender (company/email/phone → `api.lenders.upsert`) |
| `components/registry/RegistryRoleMultiSelect.tsx` | same | Universal-role checkbox multi-select (editable for contacts; read-only display otherwise) |
| `components/registry/RegistryExplorerShell.tsx` | same | **Single scroll owner** — `[data-registry-workspace-scroll]` is the only `overflow-y-auto` on the route (see §4) |
| `components/contacts/hub/HubDataTable.tsx` | same | Generic table primitive (now supports `onRowClick` + keyboard activation) |
| `components/contacts/ConvertToEntityModal.tsx` | same | Non-destructive "Promote to Entity" modal (supports `navigateOnSuccess={false}` for in-place list refresh) |
| `components/contacts/UniversalContactModal.tsx` | same | Add Contact / Add Entity create modal (`defaultKind` prop selects the flow) |
| `lib/registry/registryRoutes.ts` | same | `registryCommandCenterHref(item)` — dynamic hub routing by `registryType` |
| `lib/navigation/isRegistryRoute.ts` | same | Route matcher used by the app shell to delegate scroll (see §4) |
| `lib/formatRelativeTimestamp.ts` | same | Compact relative-time formatter used by the table |
| `app/registry/page.tsx` | `app/registry/page.tsx` | Route entry with Convex query error boundary |

---

## 2. Dependency Checklist (target repo must provide)

### npm packages
- [ ] `convex` (client + server; bundle built against Convex `defineTable`/`v` API and `convex/react` `useQuery`/`useMutation`)
- [ ] `next` (App Router; `next/navigation` `useRouter`)
- [ ] `react` 18+
- [ ] `lucide-react` (icons: `UserRound`, `Building2`, `Landmark`, `MoreHorizontal`, `Plus`, `Search`, `ChevronDown`, `X`)
- [ ] `tailwindcss` (see design tokens below)

### Design-system primitives (import paths referenced by the components)
- [ ] `components/ui/Button.tsx` — variants `primary | outline | ghost | danger`
- [ ] `components/ui/Input.tsx` — `Input`, `Label`
- [ ] `components/ui/DropdownMenu.tsx` — `DropdownMenu`, `DropdownMenuItem`, `DropdownMenuSeparator` (portal-based, close-on-select)
- [ ] `components/ui/OverlayShell.tsx` — modal/bottom-sheet overlay host
- [ ] `components/ui/OperationalSkeleton.tsx` — `OperationalSkeletonList` loading state
- [ ] `components/ui/OperationalConfirmDialog.tsx` — `useOperationalConfirm()` imperative confirm
- [ ] `components/ConvexQueryBoundary.tsx` — Convex error boundary for the page
- [ ] `lib/cn.ts` — className combiner
- [ ] `lib/ui/confirmDestructive.ts` — `simpleDeleteConfirm` payload builder
- [ ] `lib/ui/operationalInputs.ts` — `OP_WORKSPACE_ISLAND` surface class
- [ ] `components/contacts/hub/hubDetailStyles.ts` — table hint styles (or replace with local classes)

If Loan Flow Pro uses a different design system, these are the **only** touch points — swap the imports; the registry logic has no other UI coupling.

### Tailwind tokens referenced
`rounded-dlc-*`, `shadow-dlc-*`, `duration-dlc-*`, `ease-dlc-*`, `text-dlc-*`, `bg-dlc-surface-high`, `bg-brand-accent` — map to your token set or alias in `tailwind.config`.

### Backend mutations the UI calls (must exist in target Convex API)
- [ ] `api.contacts.update`, `api.contacts.remove`
- [ ] `api.hierarchyCrudMutations.patchClient`, `api.hierarchyCrudMutations.deleteClient` (supports `forceCascade`)
- [ ] `api.lenders.get`, `api.lenders.update`, `api.lenders.upsert`, `api.lenders.remove`
- [ ] `api.crmIngestionMutations.ingestBusinessEntity` / `ingestIndividual` (used by `UniversalContactModal`; substitute your own create mutations if different)

If names differ in Loan Flow Pro, update the `useMutation(...)` call sites in `RegistryWorkspaceClient.tsx`, `RegistryEditModal.tsx`, `RegistryCreateLenderModal.tsx`, and the two contact modals — the mutation contracts are documented inline in §5.

### Auxiliary lib imports to resolve (small, easily inlined)
- `lib/navigation/isRegistryRoute.ts` imports `normalizeAppPathname` (trailing-slash/whitespace normalizer, ~10 lines) — inline it or copy `lib/navigation/isPipelineSurfaceRoute.ts`
- `RegistryCreateLenderModal.tsx` imports `blankLender` + `classifyEntity` from `lib/schema` / `lib/classify` (lender field defaults + entity-type heuristic)
- `RegistryEditModal.tsx` imports `LENDER_FIELDS` / `Lender` type from `lib/schema`
- `ConvertToEntityModal.tsx` imports `CLIENT_ENTITY_TYPES` from `lib/contacts/entityKycTypes` (LLC / S-corp / C-corp / partnership / sole prop list)
- `UniversalContactModal.tsx` imports `EntityContactAssociationEditor` and `lib/pipeline/routes` — bring those along or trim the association editor section if Loan Flow Pro doesn't need inline entity↔individual linking at create time

---

## 3. Convex Schema Merge Instructions

**Never overwrite the target `convex/schema.ts`.** Merge from `export-bundle/convex/schema.registry-extract.ts`:

1. **Copy `convex/registryRoleValidators.ts` first** — the schema extract and all junction tables import `registryRoleIdV` from it.
2. **For each table in `registryTables`:**
   - **Table does NOT exist in target** → paste the `defineTable` block into `defineSchema({...})` as-is.
   - **Table EXISTS in target** → merge additively:
     - Add any missing **fields**. Every Registry-1 addition is `v.optional(...)` (`registryRoleId` on the four junction tables; `clientId` + `lenderId` on `libraryDocumentLinks`), so existing production rows validate without a data migration.
     - Add any missing **indexes** (Convex builds new indexes online; this is safe on production data): critical ones are `libraryDocumentLinks.by_client_linkedAt`, `by_client_category`, `by_lender_linkedAt`, and `contacts.by_organization_updatedAt` + the `global_search` search index (the federated query depends on these).
     - **Do not remove** fields or indexes the target already has — extra fields are harmless to the registry code.
3. **External table references** (`organizations`, `pipeline`, `tasks`, `documentFolders`, `libraryDocuments`) must already exist in the target schema. If Loan Flow Pro names its loan-file table differently, update `v.id("pipeline")` references in `contactFileLinks` / `libraryDocumentLinks` and the corresponding code paths in `crmConsolidation.ts`.
4. **Search indexes:** `contacts.global_search` (field `globalSearchText`, filter `organizationId`) and `lenders.lender_scenario` (field `searchText`) power keyword search in `api.registry.list`. If the target lacks the denormalized blobs, either backfill them (source repo maintains them via `globalSearchSync.ts` / `lenderSearchText.ts`) or short-term: the query degrades gracefully — searches under 2 characters and the in-memory `registryItemMatchesSearchQuery` filter still work against index-fetched rows.
5. **Deploy order:** schema merge → `npx convex deploy` → then deploy the function files (`registry.ts`, `crmConsolidation.ts`, helpers). Convex validates schema before functions, so pushing everything in one deploy also works.

### `convex/registry.ts` / `crmConsolidation.ts` server-side dependencies

These files import target-repo modules that must exist (present in the source repo if you want to lift them too):

| Import | Contract |
|---|---|
| `./organizationAccess` → `assertOrgMember`, `assertOrgPermission`, `assertOrgScopeArgs`, `sessionKeyIsGlobalAdmin` | Tenant/RBAC guards (see §6) |
| `./resourceAccess` → `resolveClientAccessLevel`, `ownerFieldsForInsert` | Per-record ACL: returns `"none" | "view" | "edit"` for a client row + member key |
| `./contacts` → `deleteContactGraph` | Cascade cleanup used by the (separate) merge path in `crmConsolidation.ts` |
| `./hierarchyEntityCleanup` → `deleteClientGraphEdges` | Entity edge cleanup (merge path only) |
| `./indexedGraphEdgeSync` → `upsertFileClientEdge` | Keeps denormalized file↔client edges in sync after conversion |
| `./globalSearchSync` → `refreshContactGlobalSearchText` | Rebuilds `globalSearchText` after contact writes |
| `./pipelineHierarchyCompat` → `normalizeHierarchyName` | Lowercase/trim name normalizer for `clients.normalizedName` |
| `../lib/contacts/borrowerIdentityFromDeal`, `../lib/pipelineClientRelationships` | Deal-sync helpers used by conversion when migrating file links |

If Loan Flow Pro doesn't have equivalents, either copy those modules from the source repo or stub the ones on code paths you don't use (e.g. the merge tooling in `crmConsolidation.ts` beyond `convertContactToEntity`).

---

## 4. Single-Scroll-Owner Architecture (required wiring)

The registry route delegates vertical scrolling to `[data-registry-workspace-scroll]` inside `RegistryExplorerShell`. The sticky command bar only works if **no ancestor between it and that scrollport clips or scrolls**. Wire the target app shell:

1. **Route matcher:** use `isRegistryRoute(pathname)` (bundled) in your layout/`AppChrome` equivalent.
2. **On `/registry`:** the shell `<main>` must be `overflow-y-hidden` with a `flex min-h-0 flex-1 flex-col` chain down to the shell, and its route wrapper must not apply max-width padding (the command bar spans full width; the table body applies its own gutters). In the source repo this is a `data-main-scroll-mode="workspace-delegated"` branch:
   ```tsx
   const isRegistryWorkspace = resolveRegistryRoute(pathname);
   // <main> className: isRegistryWorkspace ? "overflow-y-hidden" : "overflow-y-auto"
   ```
3. **Everywhere else:** shell `<main>` remains the primary scroller — this delegation is route-scoped.
4. **Do not** add `overflow-auto`, `overflow-hidden`, or `h-screen` to children of the shell on this route; `RegistryExplorerShell` already owns the scrollport (`touch-scroll-y overflow-y-auto overscroll-contain`).
5. Optional CSS parity (from source `globals.css`): give `[data-registry-workspace-scroll]` the same interaction contract as your main scroller —
   ```css
   [data-registry-workspace-scroll] {
     scroll-behavior: smooth;
     -webkit-overflow-scrolling: touch;
     touch-action: pan-y;
     overscroll-behavior: contain;
   }
   ```

---

## 5. Federated Query & Mutation Contracts

### `api.registry.list` (query)
```ts
args: {
  organizationId: Id<"organizations">;   // tenant scope — required
  memberUserKey: string;                 // acting member identity — required
  searchQuery?: string;                  // >=2 chars uses search indexes; AND-token match otherwise
  typeFilter?: ("contact" | "entity" | "lender")[];
  roleFilter?: RegistryRoleId[];         // AND semantics (item must have every role)
  limit?: number;                        // capped at 2000
  sortBy?: "updatedAt" | "displayName";  // default "updatedAt" desc
}
returns: RegistryItem[]
// RegistryItem: { _id, registryType, displayName, primaryEmail, primaryPhone, roles, updatedAt }
```
Role derivation: contacts → `contactRoleIds` coerced through `coerceRegistryRoleId`; entities → `["client"]`; lenders → `["lender_rep"]`.

### `api.crmConsolidation.convertContactToEntity` (mutation — non-destructive)
```ts
args: {
  organizationId, memberUserKey,
  contactId: Id<"contacts">,
  displayName: string,
  entityType?: "llc" | "s_corp" | "c_corp" | "partnership" | "sole_proprietorship",
  ein?: string,
}
returns: { entityId: Id<"clients"> }
```
Behavior: creates/uses a `clients` row, **preserves the contact**, links it via `entityContactLinks` with `registryRoleId: "authorized_signer"` (`CONVERSION_DEFAULT_GATEWAY_ROLE`), migrates `contactFileLinks` deal edges to entity edges, sets `pipeline.clientId` only when currently null.

### Edit modal mutation branching (`RegistryEditModal.tsx`)
| `registryType` | Mutation | Notes |
|---|---|---|
| `contact` | `api.contacts.update` | `{ id, name, email, phone, contactRoleIds, contactRoleId, memberUserKey }` |
| `entity` | `api.hierarchyCrudMutations.patchClient` | `{ organizationId, memberUserKey, clientId, displayName, primaryContactEmail, primaryContactPhone }` |
| `lender` | `api.lenders.update` | Loads full doc via `api.lenders.get` first, then patches `{ company, email, phone }` over the full payload (the mutation replaces all fields) |

### Data synchronization
No manual refetch anywhere: Convex `useQuery(api.registry.list, ...)` re-runs reactively after any mutation touching `contacts` / `clients` / `lenders`. Modals just close on success.

---

## 6. Environment, Auth & Tenant Scoping

### Environment variables
| Var | Used by |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Convex React client (`ConvexProvider`) |
| `CONVEX_DEPLOYMENT` / `CONVEX_DEPLOY_KEY` | `npx convex deploy` in CI |

No registry module reads any other env var directly.

### Auth wrapper — `memberUserKey`
> Note: the source repo uses a **session-cookie auth system, not Clerk**. `memberUserKey` is an opaque string identifying the acting member; it is provider-agnostic.

Every federated query/mutation takes `memberUserKey` and validates it server-side via `organizationAccess.ts`:
- `assertOrgScopeArgs(ctx, organizationId, memberUserKey)` — arg sanity + scope guard
- `assertOrgMember(ctx, organizationId, memberUserKey)` — membership check against an `organizationMembers`-style table
- `assertOrgPermission(ctx, orgId, key, "contacts.view")` — RBAC gate (registry list requires `contacts.view`; UI gates mutations behind `contacts.manage`)
- `sessionKeyIsGlobalAdmin(ctx, memberUserKey)` — superuser bypass for org filters

**If Loan Flow Pro uses Clerk:** derive `memberUserKey` from the Clerk user (e.g. `user.id` or your member-mapping table key) in a client provider, and reimplement the four `organizationAccess` functions against Clerk-backed membership data. The registry code never inspects the key's format.

On the client, the source repo supplies these via two providers (bring or substitute):
- `useUserPreferences().accountId` → `memberUserKey`
- `useOrgPermissions()` → `{ activeOrganizationId, can(permission) }`

### Tenant scoping — `organizationId`
- `contacts` / `clients`: hard-scoped (`organizationId` on the row; entities additionally pass per-record `resolveClientAccessLevel`)
- `lenders`: hybrid — rows with `organizationId == null` are a shared global catalog visible to every org; org-scoped rows are private. Preserve this rule in `lenderVisibleInOrg` (in `registry.ts`) or tighten it to strict scoping for Loan Flow Pro by removing the `organizationId == null` branch.

---

## 7. Suggested Integration Order

1. Copy `lib/registry/*`, `lib/contact/*` (pure TS — compiles standalone).
2. Copy `convex/registryRoleValidators.ts`; merge schema per §3; `npx convex deploy`.
3. Copy `convex/entityContactLinkHelpers.ts`, `convex/registry.ts` (+ `organizationAccess`/`resourceAccess` equivalents); verify `api.registry.list` in the Convex dashboard.
4. Copy `convex/crmConsolidation.ts` + its server helpers; verify `convertContactToEntity` against a staging contact.
5. Copy UI components + `app/registry/page.tsx`; resolve the design-system imports from §2.
6. Wire the scroll delegation from §4 into the app shell; add `/registry` to navigation.
7. Smoke: search, type/role filters, row-click routing, Edit (all three types), Delete (incl. entity cascade path), Add New (contact/entity/lender), Promote to Entity.

---

## 8. Deliberately Excluded

- `convex/schema.ts` wholesale (4,400+ lines of unrelated tables) — extract provided instead.
- Convex `_generated/*` — regenerate in the target with `npx convex codegen`.
- Pipeline workspace, document vault UI, org settings, auth/session modules — outside the registry core; the ACL helper (`libraryDocumentRegistryAccess.ts`) is included as the integration seam for entity/lender vaults.
