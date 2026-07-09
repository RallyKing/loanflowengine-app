# Organization system (canonical Convex org ids)

## Canonical model

- **`organizations` is the single source of truth** for tenancy. All org relationships use native Convex **`Id<"organizations">`**. There is no separate external org map or stringly-typed external org identifier in product code paths.
- **`organizationMembers`** links users (`userKey`) to organizations with a tenant role and optional product role (`organizationRoles`).
- **`organizationRoles`** / RBAC define effective permissions; **`organizationPermissions`** stores per-org **deny** overrides for permission keys.

## Server validation

- **`assertOrganizationId(ctx, raw)`** (`convex/organizationValidators.ts`): normalizes input, enforces minimum id length, loads the `organizations` row, throws **`InvalidOrganizationIdError`** or **`OrganizationNotFoundError`** when the reference is missing or malformed.
- **`resolveOrganizationContext`**: asserts the org, resolves **`memberUserKey`**, then **`assertOrgMember`** so every “org + actor” path proves both a real org and membership.
- **`assertRowBelongsToOrganization`**: tenant isolation guard for rows that carry **`organizationId`**.
- **`assertPortalOrgScope`**: portal flows may use sentinel **`"none"`** for “no workspace org”; any other value must resolve to a live organization.

Utilities for ops (`convex/orgIntegrity.ts`, gated by secret):

- **`validateOrganizationIntegrity`**
- **`dedupeOrganizationMembers`**
- **`repairOrganizationReferences`**

## Telemetry

- **`ORG_INTEGRITY_TELEMETRY=1`** (Convex deployment env): emits **`ORG_INTEGRITY_TRACE`** for verbose stages.
- **`ORG_INTEGRITY_FAIL`**: structured **`console.error`** on integrity failures (always on in code paths that call `orgIntegrityFail`).
- **`ORG_INTEGRITY_ADMIN_SECRET`**: required to invoke admin integrity / repair mutations from the dashboard or scripts.

## Client behavior

- **`lib/orgIdValidation.ts`**: structural parse for Convex-style ids before trusting `localStorage`, cookies, or viewer hints.
- **`lib/activeOrganizationId.ts`**: persists only validated ids; drops malformed stored values and notifies subscribers.
- **`useOrgPermissions`**: resolves active org from host-mapped cookie, then stored id, then viewer default — each stage parsed safely.
- **`organizations.validateActiveScope`**: lightweight Convex query; **`OrgScopeRecoveryBanner`** (in **`AppChrome`**) clears a bad stored selection and shows a dismissible message with a link to Settings.

## Related docs

- Internal auth and session: `docs/internal-auth-architecture.md`
- Project-wide AI/dev rules: `docs/ai-development-rules.md`
