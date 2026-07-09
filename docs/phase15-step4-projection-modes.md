# Phase 15 Step 4 — Pipeline Hub Projection Modes

**Status:** Step 4 complete — projection switching shipped on certified indexed graph foundation.  
**STOP:** Awaiting review before further hub/filter work.

---

## Objective

Switch the Pipeline Hub between seven indexed projection lenses using **one ACL-filtered subscription** and **client-side grouping** — no duplicate canonical files, no ACL changes, no production data mutations (UI preference only).

---

## Architecture

| Layer | Module |
|-------|--------|
| Single subscription | `api.pipeline.listTablePreview` (unchanged query name) |
| Graph link enrichment | `convex/pipelineGraphPreviewLinks.ts` → `row.graphLinks` |
| Client projection engine | `lib/pipeline/graphProjection.ts` |
| Hub UI | `PipelineHubProjectionView` + `PipelineHubProjectionSwitcher` |
| Persistence | `dlc.pipeline.projectionMode.v1` (`pipelineHubPersistence.ts`) |
| Return path | `hubMode` / `hubEntity` query params + file workspace breadcrumbs |

**ACL contract:** Unchanged. `resourceShares` and `filterPipelineRowsForMember` remain authoritative. Projections only regroup rows already returned by `listTablePreview`.

**Canonical file contract:** Each `pipeline._id` appears once in Loan File Focus. Other modes may **place the same row object** under multiple grouping nodes (e.g. multi-client Client Focus) without duplicating database rows.

---

## Projection modes

| Mode | Key | Grouping |
|------|-----|----------|
| Client Focus | `client` | Clients → projects → files (multi-client placement) |
| Project Focus | `project` | Projects → files + linked clients |
| Loan File Focus | `file` | Flat deduped canonical list |
| Lender Focus | `lender` | Lenders with linked files (expand) |
| Referral Partner Focus | `referral` | Referral contacts with linked files |
| Team Member Focus | `team` | Shared users with linked files |
| Task Focus | `task` | Tasks grouped by linked file |

Default: **Client Focus** (preserves Client → Project → Loan hierarchy behavior).

---

## UI features

- **Top switcher** in hub toolbar (`data-testid="pipeline-hub-projection-mode"`)
- **Instant mode switch** — no route reload; `useMemo` projection trees from `filtered` rows
- **Relationship badges** on every file row (`PipelineHubRelationshipBadges`): clients, projects, lenders, referrals, team, tasks
- **Search** respects active mode via `projectionSearchHaystack` (+ capital stack haystack)
- **Breadcrumbs** in file workspace preserve projection return path via URL params

---

## Graph links on preview rows

Each `listTablePreview` row includes optional `graphLinks` built from:

- Phase 15 junction tables (`fileClients`, `fileLenders`, etc.)
- Legacy dual-read sources (FKs, arrays, `contactFileLinks`, `tasks.relatedFileId`)

Edges do **not** grant ACL; they are display/grouping metadata only.

---

## Production proof

Run from `lender-app/`:

```bash
npx tsx scripts/run-phase15-step4-projection-modes.ts
```

Report: `migration-reports/phase15-step4-projection-modes.json`

Proof verifies:

- Same `pipeline._id` object references across projections
- Zero duplicate rows in flat file list
- Joshua org grouped projections populated
- eballard sees ACL subset only (≤ Joshua file count)
- Single `listTablePreview` subscription architecture
- `graphLinks` present on all visible rows
- Idle write budget unchanged (read-only proof)

---

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | required |
| `npm run build` | required |
| `npm run convex:deploy:prod` | required |
| `npm run deploy:prod` | required |
| `npm run auth:validate` | required |

---

## Not changed

- ACL / `resourceShares` mutation paths
- Convex edge table data (Step 3 backfill only)
- Board view grouping (still hierarchy-based on same `filtered` rows)

---

## Files touched (summary)

- `convex/pipelineGraphPreviewLinks.ts` — batch graph link loader
- `convex/pipeline.ts` — attach `graphLinks` to preview rows
- `lib/pipeline/graphProjection.ts` — projection builders + search haystack
- `components/pipeline/PipelineHubProjectionView.tsx` — mode renderers
- `components/pipeline/PipelineHubRelationshipBadges.tsx` — link badges
- `app/pipeline/PipelinePageClient.tsx` — switcher + projection wiring
- `components/PipelineFileWorkspace.tsx` — projection-aware breadcrumbs
- `convex/operator/indexedGraphProjectionProofStep15_4.ts` — prod proof
