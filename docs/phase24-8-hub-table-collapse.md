# Phase 24.8 — Pipeline hub table collapse fix

**Date:** 2026-05-29  
**Production target:** `loanflowengine` (paperworkprocessing.com)

## Problem

On the **main Pipeline hub** (table view — client / project / lender / team projections), expand/collapse chevrons appeared dead. Phase 24.7 fixed **file drawer** blocks (`PipelineFileWorkspace` / `CollapsibleSection`), not the hub hierarchy.

## Root cause

`lib/debug/phase24-4I-hub-stabilization.ts` had:

```ts
forceFullHierarchyMount: true
```

`hubHierarchySectionVisible(expanded)` always returned `true`, so nested loan rows **never unmounted** when collapsed. Chevron state in `hubExpansion` (localStorage) updated, but the UI did not change — looked like broken toggles.

## Fixes

| Area | Change |
|------|--------|
| `phase24-4I-hub-stabilization.ts` | `forceFullHierarchyMount: false`, `omitHierarchyExpandMotion: false` |
| `HubExpandChevron.tsx` | Dedicated chevron button with `preventDefault` + `stopPropagation` |
| `PipelineHubHierarchyView.tsx` | Client/project headers use `HubExpandChevron`; nested blocks gated by `showNested` |
| `PipelineHubProjectionView.tsx` | Entity + project focus sections use `HubExpandChevron`; Add file stops propagation |

Expansion state remains in `hubExpansion` (`loadHubHierarchyExpansion` / `saveHubHierarchyExpansion`).

## Verification

1. Go to **Pipeline** hub (not inside a file).
2. **Client** projection (default table view): collapse a client → projects/loans hide; chevron rotates.
3. Collapse a project → loan stack hides.
4. Click a **loan row** → opens file drawer (chevron click must not navigate).
5. Try **Project**, **Lender**, **Team** projections — group chevrons fold/unfold nested files.

## Deploy

`npm run deploy:prod` from `lender-app/` → `--project loanflowengine`.
