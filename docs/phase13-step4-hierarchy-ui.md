# Phase 13.3 Step 4 — Hierarchy pipeline UI

## Goal

Replace flat file-first pipeline UX with **Client → Project → Loan File** navigation using normalized production data from Step 3 backfill. No destructive migrations.

## Architecture constraints

- **Single hub subscription:** `api.pipeline.listTablePreview` only; tree built client-side via `buildHubHierarchyTree()`.
- **Expansion state:** `localStorage` key `dlc.pipeline.hub.hierarchy.expansion.v1` (collapsed by default).
- **Create flows:** `NewPipelineHierarchyCreateDialog` — transactional mutations in `pipelineHierarchyMutations` (`full` | `project` | `loan`).
- **ACL badges:** `resolvePipelineHierarchyAccessLabel` on ownership presentation (`Explicit Loan Share`, `Inherited from Project`, `Inherited from Client`).

## UI surfaces

| Surface | Implementation |
|---------|----------------|
| Pipeline hub (table view) | `PipelineHubHierarchyView` + client/project filters |
| Board | `groupBoardRowsByHierarchy` in `PipelineBoardView` |
| Workspace header | `PipelineHierarchyBreadcrumb` in `PipelineFileWorkspace` |
| Global search (files) | `globalSearch` hierarchy fields + grouped palette |
| Task drawer | `resolvePipelineFileHierarchy` + Attached to breadcrumb |
| Create CTA | New… → Client / Project / Loan wizard |

## Hub deep links

- `?hubClient=` — filter hub to client
- `?hubProject=` — filter hub to project (with client)
- `?focus=` — highlight loan row (unchanged)

## Validation (required)

From `lender-app/`:

```bash
npm run convex:codegen
npm run build
npm run convex:deploy:prod
npm run deploy:prod
npm run auth:validate
```

Operator proof:

```bash
npx tsx scripts/run-phase13-step4-hierarchy-ui-proof.ts
```

Report: `migration-reports/phase13-step4-hierarchy-ui.json`

## Production smoke (Joshua / canonical org)

1. Hub shows 12 clients/projects/loans in hierarchy; expansion persists on reload.
2. Create client + project + loan; add project to client; add loan to project.
3. Board columns group cards by client/project stacks.
4. Global search file hits grouped under client → project.
5. File workspace breadcrumb navigates up to hub filters.
6. Task related file shows Attached to breadcrumb.
7. Sharing lines show hierarchy inheritance badges where applicable.

## STOP

Step 4 ends at this doc + migration report. Further hierarchy work is a new phase.
