# Phase 14 Step 2 — Multi-client relationship editing UI

**Status:** UI on certified Step 1 foundation. ACL and hub structure unchanged.

## Surfaces

| Surface | Component | Behavior |
|---------|-----------|----------|
| Hub project (expanded) | `LinkedClientsEditor` scope=`project` | Add/reorder/remove/promote project clients |
| File workspace | `LinkedClientsEditor` scope=`loan` | Loan clients + optional sync from project |
| Hub hierarchy | `PipelineHubHierarchyView` | Primary + `+N`; expanded chips with relationship badges |
| Global search | `GlobalSearchPalette` | `matchedRelationship` badge on file hits |
| Pipeline filters | `PipelinePageClient` | Client involvement, relationship type, primary-only (`localStorage`) |

## Convex APIs

`pipelineMultiClientMutations`:

- `getProjectClientEditor` / `getLoanClientEditor`
- `addProjectClientLink` / `updateProjectClientLink` / `removeProjectClientLink` / `reorderProjectClientLinks` / `promoteProjectClientToPrimary`
- Loan equivalents + `syncLoanClientsFromProject`
- `createOrgClient` (inline create)

`listTablePreview` now includes `linkedClients` and `projectLinkedClients` per row.

## Permissions

- Edit gated by `resolveProjectAccessLevel` / `resolvePipelineAccessLevel` === `edit`
- View-only: gray banner + disabled controls in `LinkedClientsEditor`
- Junction links do **not** grant access (unchanged)

## Production proof

```bash
npx tsx scripts/run-phase14-step2-multi-client-ui.ts
```

Operator: `operator/pipelineMultiClientUiStep14_2:runMultiClientUiProof`

Report: `migration-reports/phase14-step2-multi-client-ui.json`

## Validation

From `lender-app/`:

```bash
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npm run deploy:prod
npm run auth:validate
```

## Out of scope

- Phase 14 Step 3+
- Analytics / workflow automation
- ACL inheritance changes
