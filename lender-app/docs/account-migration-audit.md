# Account migration audit (Joshua / primary owner)

This runbook supports consolidating **all workspace identity keys** onto the canonical internal-auth user for:

`joshua@directlendingconnection.com`

Identity in production is the `authUsers` document id string (session `userKey`), **not** a browser `accountId`, **not** legacy `user_*` / `clerk_*` vendor subjects.

## Prerequisites

- `DATA_MIGRATION_ADMIN_SECRET` (or `ORG_INTEGRITY_ADMIN_SECRET`) set in the operator environment.
- Convex deployment URL: prefer `.env.convex.prod` / production `NEXT_PUBLIC_CONVEX_URL` when auditing prod.

## Phase 1 — Generate the audit payload

### A. Full integrity scan (legacy vendor ids, orphans, FK hints)

From `lender-app/`:

```bash
npx convex run dataMigration:integrityAudit --prod \
  '{ "adminSecret": "<SECRET>", "scanLimitPerTable": 100000 }' \
  > migration-reports/integrity-audit.json
```

Paste the relevant sections into this document (table counts, `joshua` block, `clerkPrefixedUserKeyHits`, `migrationScan` samples).

### B. Ownership key plan (anonymous + legacy keys → canonical auth id)

From `lender-app/` (uses `DATA_MIGRATION_ADMIN_SECRET` / URL from `.env.convex.prod` when present):

```bash
npm run migration:planJoshua
```

Optional: different email, or save JSON:

```bash
npm run migration:planJoshua -- user@example.com
npm run migration:planJoshua -- --out migration-reports/plan-account-ownership.json
```

`npx convex run` equivalent:

```bash
npx convex run accountOwnershipMigration:planAccountOwnershipMigration --prod \
  '{ "adminSecret": "<SECRET>", "email": "joshua@directlendingconnection.com" }' \
  > migration-reports/plan-account-ownership.json
```

Interpretation:

| Field | Meaning |
| --- | --- |
| `destinationUserKey` | Canonical `authUsers._id` string — target for all rekeys |
| `duplicateAuthUsersToMerge` | Other `authUsers` rows for the same email (merged by `mergeAuthUsersByEmail`) |
| `suggestedAdditionalKeysToRekey` | Browser / legacy keys safe to pass as `additionalKeysToRekey` |
| `otherAuthKeysStillReferenced` | **Live** other `authUsers` ids still present in data — merge those users by email first |

### C. Optional: `dataMigration.analyze`

```bash
npm run migration:analyze
```

Writes JSON under `migration-reports/`.

## Phase 2 — Execute consolidation (production)

The scripted pipeline (recommended):

```bash
cd lender-app
npx tsx scripts/run-full-ownership-migration.ts
```

This runs, in order:

1. `auth.globalAdminBootstrap.ensurePrimaryPlatformAdmin`
2. `accountOwnershipMigration.planAccountOwnershipMigration` → feeds **`additionalKeysToRekey`** into merge
3. `migrations.mergeAuthUsersByEmail` (dry run + execute) for the primary email (+ Gmail alias in script)
4. `migrations.normalizeAuthUserCasing`
5. `migrations.purgeLegacyExternalAuth`

For **vendor id rewrites** (`user_*` / `org_*` in cells), use `npm run migration:*` with `MIGRATION_MAPS_PATH` as documented in `scripts/migration-cli.ts`.

## Phase 3 — Post-migration verification

- `npx convex run dataMigration:verify --prod '{ "adminSecret": "<SECRET>" }'` — should trend toward `severity: "ok"`.
- App: sign in with **mixed-case email / username** — login path uses `normalizeUsername` / `normalizeAuthEmail`.
- **Getting started**: Global admins never see the checklist (by design). Other users: dismiss/minimize persists on `userPreferences` for session `userKey`.

## Diagnostics

Set on the **Next.js** server: `AUTH_DIAG=1` (or `MIGRATION_DIAG=1`) to emit structured `AUTH_TRACE` JSON lines from `/api/auth/login` (see `lib/diagnostics/structuredTrace.ts`).

---

## Record counts / destination (fill after running audits)

_`integrity-audit.json` → `tableCounts`, `joshua`, `migrationScan.counts`_

| Table | Count | Notes |
| --- | ---: | --- |
| _paste_ | | |

**Destination owner id (`destinationUserKey`):** _paste from plan JSON_

**Invalid / legacy samples:** _paste from `migrationScan` / `clerkPrefixedUserKeyHits`_

**Operator:** _______________ **Date (UTC):** _______________
