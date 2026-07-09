# Phase 12.2 — Legacy static pipeline stage removal

Phase 12.1 ships org-scoped dynamic stages (`organizationPipelineStages`, `organizationPipelineSubStages`) with a mirrored legacy `pipeline.status` string. Phase 12.2 removes static funnel constants and hidden fallbacks.

## Deprecated artifacts (Phase 12.1)

| Artifact | Path | Current role |
|----------|------|--------------|
| `PIPELINE_STATUSES` | `lender-app/lib/pipelineStatus.ts` | Seed source only (`legacyStageSeed.ts`); hub filter fallback when no org stages |
| `PipelineStatusValue` | same | Type for legacy styling helpers |
| `LEGACY_STATUS_MAP` | same | Migration slug resolution |
| `getPipelineStatusSelectOptions` | same | Table inline status (replace with `PipelineStageSelector`) |
| Hub legacy chip fallback | `PipelinePageClient.tsx` | Renders when `stageIndex.tree.length === 0` |

## Removal checklist (Phase 12.2)

1. **Data gate** — All production orgs pass `verifyOrganizationIntegrity` with zero counts for `missingStageId`, `invalidStageId`, `orphanedSubStageId`, `statusMirrorMismatch`, `nullAssignmentDrift`, and `defaultStageOk === true`.
2. **UI** — Remove hub filter fallback to `PIPELINE_STATUSES`; require seeded org stages (blocking empty state → settings CTA).
3. **Table** — Replace `InlineSelect` + `statusOptions` in `PipelineHubVirtualizedTableRows` with `PipelineStageSelector` (`stageId` / `subStageId` patches only).
4. **Reports / exports** — Resolve stage labels from org stage bundle, not `getPipelineStatusInfo`.
5. **Settings colors** — Migrate `pipelineStageStyles` keyed by slug to org stage color fields or drop slug-keyed map.
6. **Schema** — Optional: drop `pipeline.status` column after one release of mirror-only writes (requires migration + backfill proof).
7. **Delete** — Remove `PIPELINE_STATUSES`, slim `pipelineStatus.ts` to `LEGACY_STATUS_MAP` + normalize helpers until status column dropped.
8. **Tests** — Update e2e that assert static funnel labels; add board DnD + dynamic column order tests.

## No hidden fallback rule

After Phase 12.2, code must not:

- Render funnel columns/chips from `PIPELINE_STATUSES`
- Patch `pipeline.status` directly from hub/board/table (only `stageId` / `subStageId`)
- Seed org stages from static constants at runtime except one-time migration tooling

## Verification commands

```bash
# From lender-app/
node scripts/run-pipeline-stage-migration.mjs --verify
npx convex run migrations/migrateOrganizationPipelineStages:verifyOrganizationIntegrity '{"adminSecret":"…","organizationId":"…"}'
```

## Owner

Platform / pipeline workspace — coordinate with `docs/phase12-custom-stage-certification.md`.
