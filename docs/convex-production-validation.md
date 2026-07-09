# Convex production validation

**Date:** 2026-05-09

## Deploy command

```bash
cd lender-app && npx convex deploy -y --typecheck disable
```

## Result summary

- **Target:** `https://basic-anaconda-984.convex.cloud` (canonical production deployment; historical notes may reference an older slug).
- **Status:** Succeeded — functions uploaded, schema validation complete, push finalized.

## Index / schema changes observed (excerpt)

- **Removed:** `organizations.by_clerk_organization` (legacy Clerk linkage index).
- **Added:** Multiple auth and migration-related indexes (e.g. `authUsers.by_normalizedUsername`, `authSessions.by_publicId`, `organizationPermissions.*`, etc.).

This aligns with **native auth** and **RBAC** tables; no indication of stale generated-only drift after deploy.

## Generated API alignment

After deploy, the CLI ran **TypeScript generation** server-side. Local regeneration was previously verified with `npx convex codegen --typecheck disable`; **`npm run build`** and **`npx tsc --noEmit`** succeed, which implies:

- Referenced `api.*` paths resolve against current modules.
- No wholesale missing exports detected by the compiler.

## Registration drift / missing queries

- **None observed** in compiler or deploy output.
- If a function were missing, `next build` Convex references in app code would fail.

## Deployment / CLI alignment warning

After a successful **`convex deploy`** from this workspace, **`npx convex run orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix`** still failed and the “Available functions” dump listed **`organizations:syncFromClerk`** / **`getForViewerByClerkId`** — strings **absent** from current `convex/_generated/api.d.ts` and `convex/organizations.ts` source.

**Interpretation:** The CLI instance used for **`convex run`** is almost certainly pointed at a **different or stale Convex deployment** (e.g. dev vs prod, or another project slug) than the one that received the push, or `.env.local` selects a backend that has not received this repo’s bundle.

**Action:** In `lender-app/.env.local`, confirm **`CONVEX_DEPLOYMENT`** / deployment URL matches the project you intend, then re-run:

```bash
npx convex run orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix '{}'
```

Until that aligns, treat **cloud function lists from `convex run`** as **unverified** for this codebase.

## Clerk note

Deploy output explicitly **deleted** `by_clerk_organization` — consistent with **`clerkOrganizationId` removal** from the product schema path.
