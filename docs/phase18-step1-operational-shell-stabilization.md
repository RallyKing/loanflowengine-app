# Phase 18.1 — Operational Shell Stabilization

**Status:** COMPLETE (await operator review)  
**Scope:** Presentation-only — no schema, ACL, graph, or backend contract changes.

## Objectives delivered

| Step | Deliverable | Status |
|------|-------------|--------|
| 1 | `lib/ui/operationalTokens.ts` | **COMPLETE** |
| 2 | `OperationalOverlayShell` + overlay token alignment | **COMPLETE** |
| 3 | `ResponsiveToolbarGroup` + hub/events toolbar compression | **COMPLETE** |
| 4 | `OperationalRowShell` + row migrations | **COMPLETE** |
| 5 | `OperationalActionSuite` + shared action sizing | **COMPLETE** |
| 6 | Density reduction (secondary/tertiary disclosure on rows) | **PARTIAL** — hub file, events, shared; table unchanged |
| 7 | Mobile resilience (toolbar overflow, touch tokens) | **COMPLETE** |
| 8 | Workspace focus (calmer hub toolbar bands) | **PARTIAL** |

## New primitives

- **`lib/ui/operationalTokens.ts`** — spacing rhythm, header/action sizes, overlay panel classes, z-index re-exports, tertiary reveal helper.
- **`components/ui/OperationalOverlayShell.tsx`** — modal shell + `OperationalAnchoredPanel`.
- **`components/ui/ResponsiveToolbarGroup.tsx`** — primary / secondary (`sm+`) / tertiary (`lg+`) collapse.
- **`components/ui/OperationalRowShell.tsx`** — hierarchy indent, disclosure chevron, secondary/tertiary/meta slots.
- **`components/ui/OperationalActionSuite.tsx`** — standardized icons + overflow menu helper.

## Surfaces updated

| Surface | Changes |
|---------|---------|
| `PortalOverlayPanel` / `DropdownMenu` | Opaque `bg-background`, `border-border/50`, `shadow-xl`, z-dropdown token |
| `layering.ts` `overlaySurfaceClass` | Aligned to operational border/shadow |
| `UserNotificationsBell` | Inbox dropdown uses stabilized portal panel |
| `GlobalSearchPalette` | Command panel shadow reinforcement |
| `EventDetailClient` | Sharing drawer scrim + opaque aside |
| `PipelinePageClient` | Hub toolbar: projection + search primary; sort `sm+`; view/density `lg+`; mobile overflow menu |
| `PipelineHubFileRow` | `OperationalRowShell` + `HubHierarchyLoanRowActions` on all projection paths |
| `SharedResourceRow` / `tasks` `TaskRow` | `OperationalRowShell` |
| `EventsWorkspaceClient` | Operational rows + responsive filter toolbar |
| `ActionSuite` | Icon sizing via `OP_ACTION_ICON_CLASS` |

## Intentionally unchanged (per charter)

- `PipelineTableRow` (14-column inline commit)
- `PipelineFileWorkspace` block internals
- Sharing **mutations** and ACL logic
- Graph projection / hierarchy **backend**
- Contacts / intake / ledger visual islands

## Validation

From `lender-app/`:

- `npm run convex:codegen` — pass
- `npm run build` — pass
- `npm run convex:deploy:prod` — see migration report
- `npm run deploy:prod` — see migration report
- `npm run auth:validate` — see migration report

## Operator smoke (recommended)

1. **Pipeline hub** — mobile: search + projection + ⋯ menu; desktop: sort/view/density visible at breakpoints.
2. **File projection** — loan rows show hover actions (share/edit/delete) matching hierarchy rows.
3. **Events** — list rows single-line primary; role/owner tertiary on hover (desktop).
4. **Notifications inbox** — opaque panel, no bleed-through.
5. **Tasks / Shared** — row hover actions unchanged functionally.

## Next (18.2 — not started)

- Hub orientation strip (metadata-only)
- `PipelineHubFileRow` / hierarchy table alignment
- Sharing panel presentational merge
- Further hub filter drawer collapse

**STOP** — do not begin Phase 18.2 without operator approval.
