# Phase 14 Step 3 — Capital Stack & Funding Gap Engine

## Scope

Per-project capital requirements, funding sources (optional loan file linkage), partial allocations, automatic gap rollups, hub visibility, filters, and permission-gated editing. **No ACL schema changes**, no ownership model changes, no hierarchy redesign.

## Schema (additive)

| Table | Purpose |
|-------|---------|
| `projectCapitalRequirements` | Required capital by type + priority |
| `projectCapitalSources` | Committed / approved / funded amounts; optional `pipelineId` |
| `projectCapitalAllocations` | Partial source → requirement fulfillment |

## Rollups

`computeProjectCapitalRollup` (pure, `lib/projectCapitalStack.ts`) computes:

- `totalRequired`, `totalCommitted`, `totalApproved`, `totalFunded`
- `remainingGap`, `fundingCoveragePercent`
- `gapHealth`: `complete` (gray) · `partial` (yellow) · `unfunded` (red)
- `sourceTypes`, `searchBlob` (notes for hub search)

Linked loan files contribute live amounts via `max(stored, pipeline.fundingAmount)` on read. `syncCapitalSourcesFromProjectLoans` persists loan funding into linked sources on `pipeline.patch` / `patchDeal` funding changes.

## API

`convex/projectCapitalStack.ts` — loaders, rollups, batch hub enrichment, loan sync.

`convex/projectCapitalStackMutations.ts` — `getProjectCapitalStack` + CRUD/reorder/allocations; **edit** requires `resolveProjectAccessLevel === "edit"`.

`listTablePreview` attaches `projectCapitalRollup` per row (by `projectId`).

## UI

- **`ProjectCapitalStackEditor`** — project hub expanded section: gap meter, requirements, sources, loan link, allocations, view-only banner.
- **Hub collapsed project rows** — required / funded / coverage pills + gap badge.
- **Filters** — `lib/pipeline/capitalStackFilters.ts`, persisted `dlc.pipeline.hub.capitalStackFilters.v1`: underfunded, fully funded, source type, gap threshold; search includes capital source notes.

## Production proof

```bash
cd lender-app
npx tsx scripts/run-phase14-step3-capital-stack-engine.ts
```

Operator: `operator/pipelineCapitalStackStep14_3:runCapitalStackProof` — 3 requirements, 3 loan-linked sources, partial coverage, loan funding recalc, project share view/edit/revoke (existing `resourceShares` only).

Report: `migration-reports/phase14-step3-capital-stack-engine.json`

## Validation (ship gate)

From `lender-app/`:

1. `npm run convex:codegen`
2. `npm run build`
3. `npm run convex:deploy:prod`
4. `npm run deploy:prod`
5. `npm run auth:validate`
6. Production proof script (above)

## Out of scope

Automation workflows, lender matching AI, analytics dashboards.
