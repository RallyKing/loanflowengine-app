# Phase 15 Step 12 — Multi-Entity Projection Visibility & Primary Action Signposting

**Status:** Complete — awaiting review (STOP before Phase 16).

**Production:** https://dlcfunds.vercel.app

## 1. Cross-sharing (Client Focus)

### Problem
`buildClientFocusTree` could miss secondary-client placement when `graphLinks` was sparse on a row, because grouping leaned on the primary `pipeline.clientId` FK path in some fallbacks.

### Refactor (`lib/pipeline/graphProjection.ts`)

1. **`graphLinksForRow`** — Client-side merge of `row.graphLinks`, `row.linkedClients`, and `row.projectLinkedClients` before any projection (no new Convex queries).

2. **`buildGraphProjectionIndex`** — Unchanged contract; still one pass over rows using merged client links.

3. **`buildClientFocusTree`** — Now driven by **`index.clientToFileIds`** (all graph edges), not only the primary FK loop:
   - Every client id in the index gets a hub node.
   - Each linked file is placed under that client’s project stack.
   - **`HubLoanNode.clientPlacement`** records `relationshipType` + `isPrimary` per placement.

4. **UI badge** — `PipelineHubHierarchyView` shows an amber relationship badge (e.g. **Co-borrower**) when `clientPlacement.isPrimary === false`.

## 2. Project Focus

`buildProjectFocusTree` now accepts optional `GraphProjectionIndex` and uses **`index.projectToFileIds`** so files linked via secondary project edges (if present) appear under the correct project node. `PipelinePageClient` passes `graphIndex`.

Project-linked clients are still merged into `projectLinkedClients` from graph client edges so Client Focus hubs show projects with full client chips.

## 3. Primary client signposting

**`LinkedClientsEditor`** (loan scope, file on a project):

- Banner: primary is locked; use **Change project** at workspace top; do not delete primary here.
- Primary row inline hint: “Locked — use Change project above” with tooltip.

Matches Step 8/10 integrity rules: no orphan files from deleting primary in Linked Clients.

## 4. IntakeEditor link fix

Removed duplicate “Pipeline” breadcrumb. Single back link → `/pipeline` hub with `ArrowLeft` (Step 11 post-report cleanup).

## Automated proof

From `lender-app/`:

```bash
npx tsx scripts/run-phase15-step12-cross-sharing-visibility.ts
```

Fixture: one file linked to Client A (primary) + Client B (co-borrower) → tree contains both clients; B placement is non-primary with `coborrower` type.

Report: `migration-reports/phase15-step12-cross-sharing-visibility.json`

## Manual proof (Joshua)

1. Open a file (primary Client A). Add Client B as co-borrower in Linked Clients.
2. Pipeline hub → **Client Focus** → expand Client A: file visible (no secondary badge).
3. Expand Client B: same file visible with **Co-borrower** badge.
4. File workspace → Linked Clients: confirm signpost + primary row hint reference **Change project**.

## Validation

- `npm run convex:codegen`
- `npm run build`
- `npm run convex:deploy:prod`
- `npm run deploy:prod`
- `npm run auth:validate`
