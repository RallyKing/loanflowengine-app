# Final Clerk eradication status

**Classification:** Runtime product code is **off Clerk SDK**. Remaining matches are **documentation**, **migration tooling**, **audit script literals**, or **Convex identity field names** (not the Clerk vendor).

## Patterns searched (representative)

`clerk`, `Clerk`, `@clerk`, `org_`, `FIXED_VIEWER`, `APP_AUTH_FIXED_ORG_ID`, `clerkOrganizationId`, `sessionClaims`, `identity.subject`, `tokenIdentifier`

## Exact paths with matches (lender-app)

### A. Intentional governance / lockfile (not runtime Clerk)

| path | reason |
|------|--------|
| `lender-app/scripts/audit-no-clerk.mjs` | Banned-substring list and lockfile check for **`@clerk`** install entries |
| `lender-app/package-lock.json` | **`convex`** package **peerDependencies** mention `@clerk/*` (npm metadata only; not installed app deps) |

### B. Migration and regression tooling (legacy token handling)

| path | reason |
|------|--------|
| `lender-app/convex/dataMigration.ts` | Production migration / audit for vendor-shaped `user_` / `org_` tokens |
| `lender-app/convex/migrations/joshuaLegacyUserKeyCleanup.ts` | Admin migration for legacy vendor-shaped user keys |
| `lender-app/scripts/migration-cli.ts` | CLI wrapper for migration analyze/execute |
| `lender-app/scripts/regression-protection-tests.ts` | Unit tests for `isLegacyExternalUserId` / `isLegacyExternalOrgId` sentinels |

### C. Convex “identity” language (not Clerk SDK)

| path | reason |
|------|--------|
| `lender-app/convex/schema.ts` | **Comment** referencing `identity.subject` as conceptual session id |
| `lender-app/convex/organizationAccess.ts` | Reads Convex **`identity.subject`** / **`identity.tokenIdentifier`** from passed identity object |
| `lender-app/convex/viewerIdentity.ts` | Builds **`tokenIdentifier`** string for local/session viewer |

### D. Index names and schema comments containing `org_` / `by_org_`

Many lines in `lender-app/convex/schema.ts` and Convex modules use **`by_org_*`** index names and org-scoped fields. These are **internal** org IDs (`Id<"organizations">`), **not** Clerk `org_` external IDs. No file paths enumerated here (high volume, low signal).

## Runtime UI / API surface (`app/`, `lib/`, `components/`)

- **No** `@clerk/*` imports, **`useClerk`**, or **`ClerkProvider`** found under `app/`, `lib/`, `components/`.

## Workspace docs (`docs/` outside lender-app)

Migration narratives (e.g. `docs/auth-removal-audit.md`) still say **Clerk** for historical accuracy. The **`audit:no-clerk`** script no longer scans parent `docs/` (see script comments).

## Conclusion

**Clerk SDK eradication:** **Pass** for shipped Next.js UI and shared client libs.  
**String-level “Clerk” in repo:** Present only in **expected** migration/governance locations above.
