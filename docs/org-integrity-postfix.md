# Organization integrity (post-fix notes)

**Date:** 2026-05-09

## Automated analyze (blocked without secret)

```bash
npm run migration:analyze
```

**Result in this workspace:** exited with  
`Set DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) in .env.local`

No database scan or repair was executed against live Convex data in this pass.

## What “repair automatically” implies in-repo

The codebase provides:

- **`scripts/migration-cli.ts`** — `analyze` / `dry-run` / `execute` with admin secret and optional `MIGRATION_MAPS_PATH` for legacy token maps.
- **`convex/dataMigration.ts`** — reporting and execution surfaces for Clerk-shaped identifiers (migration-era).
- **`convex/migrations/joshuaLegacyUserKeyCleanup.ts`** — targeted cleanup for legacy user keys (admin-gated).

**Automatic repair without human review is not run here.** After configuring the secret:

1. `npm run migration:analyze` — capture JSON/report.
2. `npm run migration:dry-run` — confirm planned writes.
3. `npm run migration:execute` — only if dry-run is acceptable.

## Static checks available without DB

- **`npm run audit:no-clerk`** with **`SKIP_CONVEX_ORG_SCAN` unset** runs  
  `orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix` on the **CLI-selected** deployment.  
  In this session that scan failed when the CLI targeted a misaligned/local backend; fix Convex CLI context before treating as data corruption.

## Rows / contamination (unverified)

| check | status |
|-------|--------|
| Invalid table refs | **Not scanned** (needs migration CLI or Convex dashboard) |
| Duplicate memberships | **Not scanned** |
| Orphan memberships | **Not scanned** |
| Legacy Clerk IDs in live rows | **Not scanned** |
| Cross-table contamination | **Not scanned** |
| Bad `localStorage` hydration | **Behavioral** — verify `useOrgPermissions` + `reconcileActiveOrgWithSession` under multi-tab |

## Recommendation

Run **`migration:analyze`** with secret against **staging first**, then production, and append the JSON summary as an annex to this file when available.
