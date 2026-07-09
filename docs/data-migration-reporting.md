# Data migration reporting

This document describes the production migration CLI under `lender-app/`, the Convex module `convex/dataMigration.ts`, and how to read reports, rollback snapshots, and idempotency behavior.

## Commands

Run from `lender-app/` with Convex reachable (same `NEXT_PUBLIC_CONVEX_URL` as the app):

| Command | Purpose |
| --- | --- |
| `npm run migration:analyze` | Read-only scan; writes `migration-reports/analyze-<timestamp>.json` |
| `npm run migration:dry-run` | Runs `dataMigration:run` with `dryRun: true` (no writes) |
| `npm run migration:execute` | Writes a **pre-execute analyze snapshot** file, then runs `dataMigration:run` with `dryRun: false` |
| `npm run migration:verify` | Same scan as analyze + exit code `2` if issues remain (`severity: warn`) |

## Environment

| Variable | Location | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex deployment URL |
| `DATA_MIGRATION_ADMIN_SECRET` | Convex deployment **and** `.env.local` | Preferred secret; must match server env |
| `ORG_INTEGRITY_ADMIN_SECRET` | Fallback if `DATA_MIGRATION_ADMIN_SECRET` unset | Same value may be used for both |
| `MIGRATION_MAPS_PATH` | Shell / `.env.local` (read by CLI) | Optional JSON file path for legacy external id → native maps |
| `MIGRATION_PURGE_EXPIRED_SESSIONS` | `1` or `true` | Also delete **expired** (absolute clock) `authSessions`, not just orphans |
| `MIGRATION_FORCE` | `1` | Re-run execute even if the same fingerprint completed (`dataMigrationRuns`) |
| `MIGRATION_SCAN_LIMIT` | Max docs per table for **analyze** sampling (default `25000`) | Raise if scans truncate |

Set `DATA_MIGRATION_ADMIN_SECRET` on the Convex dashboard under **Settings → Environment variables** (not only locally).

## What the scanner looks for

- **Vendor-shaped identifiers**: `user_…` on string fields treated as actor/member keys; `org_…` on portal `orgScope`, feed `scopeId`, etc.
- **Malformed org scope strings**: `activityFeed` rows with `scopeKind === "org"` but `scopeId` not a valid Convex org id string (and not portal `"none"`).
- **Duplicate `organizationMembers`**: more than one row for the same `(organizationId, userKey)` (merged on execute by keeping the newest `_creationTime`).
- **Orphan membership**: `organizationMembers` whose `organizationId` does not resolve.
- **Stale / bad sessions**: `authSessions` with missing `authUsers` parent; optional purge of clock-expired sessions.
- **Invalid foreign keys** (bounded **analyze** sample): examples include `pipeline.lenders[]` → `lenders`, `ledger.fileId` → `pipeline`, `tasks.relatedContactId` → `contacts`, auth token tables → `authUsers`.
- **Execute** additionally prunes **dangling lender ids** from `pipeline.lenders` and clears `selectedLenderId` when it no longer references a row in `lenders` (snapshot-backed).
- **Dangling `organizationId`**: optional org fields pointing at deleted organizations (cleared on execute over **full** table scans).

Bounded **analyze** may set `truncatedTables` when a table hits `scanLimitPerTable`; treat wide counts as **lower bounds** until you raise the limit or rely on **execute** (which uses full collects for repairs).

## Migration maps (legacy external → internal)

Optional JSON (e.g. `maps.production.json`):

```json
{
  "legacyUserMap": {
    "user_2AbCexample": "kh7xxxxxxxxxxxxxxxxx"
  },
  "legacyOrgMap": {
    "org_1XyZexample": "jd7xxxxxxxxxxxxxxxxx"
  }
}
```

- `legacyUserMap` values must be existing `authUsers` document ids.
- `legacyOrgMap` values must be existing `organizations` document ids.
- Historical map files may still use older JSON keys; the CLI accepts those when loading.

Point the CLI at the file:

```bash
set MIGRATION_MAPS_PATH=maps.production.json
npm run migration:execute
```

When maps are **non-empty**, **execute** performs a **full collect** of vendor-shaped fields on the tables enumerated in `collectAllLegacyExternalUserKeyHits` / `collectAllLegacyExternalOrgScopeHits` so rewrites are not missed by sampling.

Any legacy external token **without** a map entry is listed under `summary.unresolved` / `unresolvedCorruption` (report-only for those keys).

## Reports and snapshots

### Files on disk (`migration-reports/`)

Ignored by git (see `lender-app/.gitignore`). Typical artifacts:

- `analyze-*.json` — full `buildScanReport` payload.
- `verify-*.json` — `{ severity, openIssues, report }`.
- `manifest-*.json` — run id, map sizes, flags (rollback **metadata**, not row data).
- `pre-execute-snapshot-*.json` — `analyze` output captured immediately before **execute**.
- `dry-run-*.json` / `execute-*.json` — mutation results (`summary`, `fingerprint`, etc.).

### Convex rollback chunks

Table `dataMigrationRollbackChunks`: batched **pre-images** (`before` document, `op: patch | delete`) keyed by `runId` and `seq`.

- Used for **manual** rollback (re-insert deleted docs or `patch` back from `before`).
- There is **no** automatic rollback mutation in v1; restore from chunks or from a full `dataBackupSnapshots` export if you maintain one.

Table `dataMigrationRuns`: audit + **idempotency** (`fingerprint`, `mode`, `status`, `summary`, `error`).

## Idempotency

- **Fingerprint** is derived on the server from `legacyUserMap`, `legacyOrgMap`, and `purgeExpiredSessions`.
- A **completed** `execute` with the same fingerprint **short-circuit**s unless `force: true` (`MIGRATION_FORCE=1`).
- Per-row rewrites skip when the target value is already applied (e.g. `userKey` already equals mapped internal id).

## Dry-run vs execute

- **Dry-run** records a `dataMigrationRuns` row with `mode: "dry_run"` and returns counts / unresolved keys **without** writing data (rollback buffer is empty).
- **Execute** writes rollback chunks for destructive steps, then applies patches/deletes.

## Operational checklist

1. Run `migration:analyze` in staging; review `truncatedTables`, `invalidForeignKeys`, `legacyExternalUserKeyHits`.
2. Prepare maps; validate targets exist in Convex.
3. Run `migration:dry-run`; confirm `summary` aligns with expectations.
4. Take a **full** backup (e.g. existing `dataBackup` flow) if available.
5. Run `migration:execute`; retain `migration-reports/` and note `runId` for rollback chunks.
6. Run `migration:verify`; resolve remaining `unresolved` items or document as accepted risk.

## Related

- Org model: `docs/org-system-rewrite.md`
- Org integrity helpers: `convex/orgIntegrity.ts`
