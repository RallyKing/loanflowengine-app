# Phase 19.6 — Hub card visibility & legacy data migration

**Date:** 2026-05-28

## Goals

1. Make the relational audit log **visible** on primary hub hierarchy cards without changing card layout structure.
2. **Migrate** legacy `pipeline.notes` strings into `pipelineFileNotes` so historical data is not lost.

## Hub visibility

### `PipelineHubNotesIndicatorChip`

- Renders when `fileNotesCount > 0` (from `listTablePreview`, Phase 19.5).
- Lucide `MessageSquare` + tabular count.
- `stopPropagation` + `preventDefault` so the chip does not trigger the card’s main open action.
- Calls the same navigation as the table: `selectFileNotes` → `/pipeline/{fileId}?block=fileNotes`.

### Integration

| Surface | Location |
|---------|----------|
| `LoanStackRow` | Metadata row (funding, status, updated) — title block unchanged |
| `PipelineHubFileRow` | Secondary metadata line (file projection + entity sections) |

`selectFileNotes` is threaded: `PipelinePageClient` → `PipelineHubProjectionView` → hierarchy / file rows.

## Legacy migration

### `convex/migrations/migrateLegacyNotes.ts`

Mutation: `migrations/migrateLegacyNotes.migrateLegacyNotes`

| Arg | Purpose |
|-----|---------|
| `adminSecret` | `DATA_MIGRATION_ADMIN_SECRET` gate |
| `dryRun` | Optional — report only, no writes |

**Logic:**

1. Scan all `pipeline` rows.
2. Skip empty `notes`, missing `organizationId`, or files already having a `SYSTEM_MIGRATION` author note.
3. Insert `pipelineFileNotes` with `authorUserKey: "SYSTEM_MIGRATION"` and legacy string as `content`.
4. Clear `pipeline.notes` on the file after successful insert (field retained in schema).

**Run (after `convex deploy`):**

```bash
# Dry run
npx convex run migrations/migrateLegacyNotes:migrateLegacyNotes \
  '{"adminSecret":"YOUR_SECRET","dryRun":true}'

# Execute
npx convex run migrations/migrateLegacyNotes:migrateLegacyNotes \
  '{"adminSecret":"YOUR_SECRET","dryRun":false}'
```

## Verification

```bash
cd lender-app
npm run build
```

Manual:

- Hub client view → loan card with notes shows chip; click opens File notes block.
- Card body click still opens file normally.
- After migration, legacy strings appear in drawer feed as `SYSTEM_MIGRATION` entries.
