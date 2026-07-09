# UX Audit — Workspace Hierarchy Psychology (Phase 17.5)

**Mode:** READ-ONLY  
**Focus:** Client → Project → Loan File mental model, graph overlays, relationship surfaces

## Model in code

- **Canonical graph:** Convex pipeline graph + `graphProjection.ts` (client-side index, projection modes).
- **Visual tree:** `PipelineHubHierarchyView` inside table hub shell (`data-testid="pipeline-hub-hierarchy-shell"`).
- **Orientation aid:** `PipelineHierarchyBreadcrumb` — file workspace, task drawer attachment context.
- **Deep links:** `pipelineHubClientHref`, `pipelineHubProjectHref`, query params `hubClient`, `hubProject`.

## Assessment: graph vs nested modules

**Verdict:** The platform is **hybrid** — data behaves as an **operational graph** (multi-client, lender/referral/team indexes, task projection), but presentation often feels like **disconnected nested modules** because:

1. Projection modes re-slice the same graph without persistent visual “graph” metaphor.
2. Board view ignores hierarchy entirely.
3. Breadcrumbs appear only after entering a file or task — not on hub.
4. Relationship badges (`PipelineHubRelationshipBadges`, `ClientRelationshipBadge`) are dense on rows but not explained in a legend.

| Criterion | Score (1–5) | Notes |
|-----------|-------------|-------|
| Visual clarity | 3 | Indent tree OK; projection lists flatten context |
| Nesting comprehension | 3 | Expansion state persisted (`loadHubHierarchyExpansion`) |
| Discoverability | 2 | Hierarchy hidden inside table view; mobile cards alternate |
| Breadcrumb effectiveness | 3 | Good on file; absent on hub; compact mode small |
| Grouping intuition | 3 | Client/project headers use `RowShell` (17.2) |
| Contextual awareness | 2 | Filters + projection compete |
| Relationship understanding | 2 | Multi-client / referral / lender overlays require domain knowledge |

---

## Where hierarchy feels rigid

- **Cascade delete** (`HierarchyCascadeDeleteConfirm`) — powerful but frightening; copy-heavy modals break flow.
- **Project assignment** (`ChangeFileProjectControl`) — modal/form pattern vs inline on row.
- **Board columns** — stage-only grouping; cannot drag across client boundaries with hierarchy visible.
- **Table density modes** — analyst mode shows graph columns whether user thinks in clients or loans.

## Where hierarchy feels hidden

- Default hub attention on **filtered loan list** not tree — tree is sibling panel inside table mode.
- **Projection modes** (`lender`, `referral`, `team`, `task`) replace tree with flat indexes — users may not map these back to client/project/file.
- **Global search** returns files/contacts/events without showing parent client/project in all groups equally.
- **Shared workspace** lists resources without hierarchy path (title + type only).

## Where users lose orientation

1. Switching projection from **client** to **lender** — same page, different primary entity, no animation or persistent header.
2. **hubFocusFileId** highlight vs open file — two “selection” concepts.
3. **Intake / deal** route (`/pipeline/file/[fileId]/deal`) — parallel workspace; breadcrumb may not include “Deal analysis.”
4. **Portal** path (`/portal/file/`) — different chrome; hierarchy not shown to client.

## Mentally exhausting grouping

- **Client involvement filters** + **capital stack filters** + stage chips + momentum — combinatorial filter fatigue.
- **Expanded hierarchy** with hundreds of files — virtualization helps performance, not cognitive load.
- **Indexed overlays** (lender/referral/team rows) — each row shows relationship chips; scanning is hard at scale.

---

## Relationship surfaces audited

| Surface | Graph behavior | UX gap |
|---------|----------------|--------|
| `PipelineHubProjectionView` | Top-level entities per mode | Mode label in switcher only |
| `PipelineHubRelationshipBadges` | Edge types as chips | No tooltip glossary on hub |
| `LinkedClientsEditor` | Multi-client on file | Local `ClientRowShell` vs hub `RowShell` |
| `PipelineHubTaskFocusBadges` | Task linkage | Competes with stage badges |
| Event detail sharing | Collaborators | Different badge component than pipeline |
| Team projection | Member → files | Overlaps contacts CRM |

---

## Coherent operational graph — gap analysis

**To feel like one graph**, users need:

- Consistent **parent path** on every row (client / project) in all projections.
- **One expansion model** (tree vs flat) chosen by task, not by accidental view mode.
- **Relationship legend** or progressive disclosure for badge semantics.

**Current state:** **2** on a 1–5 “coherent graph” scale — technically one index, experientially modular.

## Phase 18 hierarchy psychology priorities

1. Hub **context header** (client › project › mode) above list.
2. Parent path on projection rows (metadata line).
3. Breadcrumb on hub when `filterClientKey` / `filterProjectKey` set.
4. Board view: optional “group by client” or link to hierarchy filter.
5. Unify relationship badges with `MetadataLine` + glossary.
