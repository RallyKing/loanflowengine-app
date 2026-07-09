# Auth integration removal — audit report

This document records the migration away from the legacy **Clerk**-shimmed stack (in-repo shims, Convex sync hooks, and `clerkOrganizationId` schema fields) to a single **HMAC cookie session** aligned with **`viewerIdentity`** fallbacks on Convex.

## Files modified (representative)

- **Session & client UI**
  - `lender-app/lib/sessionAuth.ts` — cookie payload now uses `organizationId`, `organizationName`, `workspaceRole`; env-driven profile via `APP_AUTH_USER_*` / `APP_AUTH_ORGANIZATION_*`.
  - `lender-app/lib/sessionContext.tsx` — `ClientViewer` matches the new payload.
  - `lender-app/lib/sessionUiClient.tsx` — replaces `@clerk/nextjs` hook surface without third-party SDK.
- **Removed**
  - `lender-app/lib/clerkShimClient.tsx`, `lender-app/lib/clerkShimServer.ts`, `lender-app/lib/convexReactClerkShim.tsx`
  - `lender-app/convex/clerkAuth.ts` → `lender-app/convex/viewerIdentity.ts`
  - `lender-app/convex/auditNoClerk.ts` (superseded by neutral module name) → `lender-app/convex/orgLegacyTokenAudit.ts`
- **Build config**
  - `lender-app/next.config.mjs` — removed webpack aliases to Clerk shims.
  - `lender-app/tsconfig.json` — removed `@clerk/*` path mappings.
- **Convex**
  - `lender-app/convex/schema.ts` — dropped `organizations.clerkOrganizationId` and `by_clerk_organization` index.
  - `lender-app/convex/organizations.ts` — removed Clerk sync/query surface; rename guard no longer references external org linkage.
  - `lender-app/convex/legacyAssignToOwner.ts` — args are now `ownerUserKey`, `orgName`, optional Convex `organizationId`.
  - `lender-app/convex/organizationCustomDomains.ts` — custom domains no longer require a “linked” external org id; `resolveHostBinding` returns only `organizationId`.
  - `lender-app/convex/organizationRbac.ts`, `organizationAccess.ts` — fallback user key from `APP_AUTH_USER_KEY` via `platformUserKeyFallback()`.
- **Next / UI copy**
  - `OrganizationSettingsPanel.tsx`, `CustomDomainsSettingsPanel.tsx`, `AppChrome.tsx`, onboarding/settings components — imports from `sessionUiClient`; copy no longer references Clerk widgets.
- **Tests**
  - `lender-app/tests/helpers/workspace-auth.ts` — `signInWorkspaceSession`, `workspaceSessionReady`, `registerWorkspaceSessionHook`.
  - Playwright specs updated; `clerk-keys-dev.ts` and `clerk-workspace-auth.ts` removed as obsolete.
- **Scripts**
  - `lender-app/scripts/run-legacy-assign*.mts` — env-driven; no hard-coded `org_*` ids in source.
  - `lender-app/scripts/audit-no-clerk.mjs` — repository gate (see below).
- **Docs** (parent `docs/` tree) — neutral wording where the old vendor was mentioned historically.

## Migration summary

| Area | Change |
|------|--------|
| Session cookie | Fields renamed; legacy cookies with `orgId` / `orgRole` are normalized once on verify, or users re-sign-in. |
| Convex identity | `requireIdentity` + `activeOrganizationId` on fallback JWT-shaped object; mirrors `APP_AUTH_ORGANIZATION_ID`. |
| Organizations table | Removed external org string column and index; tenants are Convex `organizations` documents only. |
| Custom domains | Gated only on org membership / settings permission, not on external linkage. |
| Client imports | No `@clerk/*` imports; use `@/lib/sessionUiClient`. |

## Removed dependencies

- No direct `@clerk/*` packages were listed in `package.json`. Shim-only usage was deleted; **`package-lock.json`** was regenerated so **`node_modules/@clerk/*` lockfile stubs are absent** (peer-only strings may still appear inside the **`convex`** package metadata block — the audit script only fails on installed `node_modules/@clerk/*` entries).

## Environment variables

**Removed (conceptual / obsolete)**

- `FIXED_VIEWER` / `APP_AUTH_FIXED_ORG_ID` patterns (hard-coded single-tenant constants).

**Required for primary login profile (Next + Convex)**

- `APP_AUTH_USERNAME`, `APP_AUTH_PASSWORD`, `APP_AUTH_SESSION_SECRET` (unchanged semantics).
- `APP_AUTH_USER_KEY`, `APP_AUTH_USER_EMAIL`, `APP_AUTH_USER_FULL_NAME`
- `APP_AUTH_ORGANIZATION_ID` (Convex `Id<"organizations">` string)
- `APP_AUTH_ORGANIZATION_NAME`
- Optional: `APP_AUTH_WORKSPACE_ROLE` (`member` → `workspace:member`; default admin)

**Legacy assign scripts**

- `LEGACY_ASSIGN_OWNER_USER_KEY`, `LEGACY_ASSIGN_ORG_NAME`, optional `LEGACY_ASSIGN_ORGANIZATION_ID`
- Local script admin auth: `CONVEX_ADMIN_KEY` (replaces committed key material).

## Removed database relationships

- `organizations.clerkOrganizationId` (optional field) and `by_clerk_organization` index.
- Convex functions: `syncFromClerk`, `lookupOrganizationIdByClerkId`, `getForViewerByClerkId`.

**Operational note:** Existing deployments may still hold the old field in stored documents until rewritten. Run `npx convex run orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix '{}'` after deploy; any non-zero `rowsWithLegacyOrgToken` indicates JSON containing `org_` tokens that should be cleaned.

## Verification

| Check | Result |
|--------|--------|
| `npm run build` (`lender-app/`) | **Passed** (Next.js 15.5.15; ESLint warnings only, no errors). |
| `npm run audit:no-clerk` | **Passed** with `SKIP_CONVEX_ORG_SCAN=1` in this workspace run (Convex scan requires a logged-in CLI / deployment). |
| Lockfile | No `"node_modules/@clerk/` install entries after fresh `npm install`. |

Full CI should run **`npm run audit:no-clerk` without `SKIP_CONVEX_ORG_SCAN`** so the Convex query executes against the target deployment.

## Command reference

```bash
cd lender-app
npm run audit:no-clerk
# Optional if Convex CLI cannot run in a sandbox:
# SKIP_CONVEX_ORG_SCAN=1 npm run audit:no-clerk
```
