# UI Audit — UI Render & Subscription Performance (Phase 17.0)

**Mode:** READ-ONLY — no backend subscription changes

## Goal

Identify surfaces where Phase 17 **visual refactors** could cause rerender storms, layout thrash, or subscription duplication.

## Architecture positives (preserve)

| Pattern | Location | Benefit |
|---------|----------|---------|
| Virtualized hub table | `pipeline/PipelineHubVirtualizedLists.tsx` | `@tanstack/react-virtual` on rows; scroll on AppChrome main |
| Workspace data hook | `hooks/usePipelineFileWorkspaceData.ts` | Consolidates file-scoped `useQuery` with trace hooks |
| Batched search queries | `GlobalSearchPalette.tsx` | `useQueries` for multi-kind search |
| Notifications batch | `UserNotificationsBell.tsx` | `useQueries` for unread + list |
| Convex sub diagnostics | `lib/convexSubDiagnosticsHooks.ts` | Mount/args tracing |

## Expensive rerender surfaces

| Surface | File | Concern | Severity |
|---------|------|---------|----------|
| **Pipeline file workspace** | `PipelineFileWorkspace.tsx` | **~3500+ lines**; massive props/state; block registry drives wide subtree | **Critical** |
| **Pipeline hub page** | `app/pipeline/PipelinePageClient.tsx` | **~2300 lines**; filter/sort/search state lifts rerender | **High** |
| **Task drawer** | `components/TaskDrawer.tsx` | **~2400 lines**; many `useMemo` sections; opens inspector subtree | **High** |
| **Tasks page** | `app/tasks/page.tsx` | Large list render without virtualization (verify) | High |
| **Intake editor** | `components/intake/IntakeEditor.tsx` | Field-level state; many sections | High |
| **Client momentum** | `ClientMomentumStars.tsx` | Portal overlay + animation on hub rows | Medium |

## Deeply nested row trees

| Tree | Depth | Note |
|------|-------|------|
| Hub hierarchy | Client → project → loan stacks | `stackIndex` margin in `PipelineHubFileRow` |
| Event items | Parent → child checklist | New in 3A; small N |
| Task subtasks | Drawer nested lists | Medium |

## Duplicated subscription risks

| Area | Observation |
|------|-------------|
| File workspace | `usePipelineFileWorkspaceData` centralizes; workspace component may still call additional queries — audit in 17.1 before moving UI |
| Hub + open file | Hub list preview + file detail queries when navigating — expected |
| Task drawer + tasks page | Possible duplicate task detail query when drawer open — acceptable if same args (Convex dedupe) |
| Sharing panels | `useQuery` per panel instance — OK |

## Heavy client transforms

| Transform | Location |
|-----------|----------|
| `buildPipelineSwitcherRows` | `workspaceDataDerivations.ts` |
| `sortEventRows` / hub sort | page clients |
| `groupGlobalSearchFileHits` | `globalSearchFileGroups.ts` |
| Filter pipeline rows client-side | `PipelinePageClient.tsx` |

**Risk:** Re-sort/filter on every keystroke without debounce — verify debounce on hub search (inspect in 17.1).

## Layout thrashing risks

| Pattern | Where |
|---------|-------|
| Sticky + backdrop-blur | Multiple headers remeasure compositor |
| Vaul snap resize | `PipelineWorkspaceMobileVaulFrame` height changes |
| Inspector width drag | `RecordInspectorShell` pointer resize |
| Virtualizer measure | Hub table — sensitive to row height changes |

**Phase 17 guidance:** Avoid changing row heights in table without updating `densityRowHeightPx`.

## Unnecessary sticky rerenders

| Hook / behavior | File |
|-----------------|------|
| `useMasterScrollCompression` | AppChrome — scroll-linked state |
| Mobile chrome expand/collapse | `MobileChromeController` |
| Sticky header state in file shell | Scroll listeners — keep detached in refactors |

## Performance guardrails for Phase 17.1

1. **Do not** remove hub virtualization
2. **Do not** add context providers above hub table without memoization
3. **Prefer CSS** over JS for hover/focus visual changes on rows
4. **Colocate** new presentational components as `React.memo` leaf nodes
5. **Profile** `PipelineFileWorkspace` before splitting UI — use existing convex sub traces
6. **Avoid** animating `box-shadow` on table rows (material audit alignment)

## Subscription policy (unchanged)

This audit does **not** authorize new Convex queries. UI moves must reuse existing hooks (`usePipelineFileWorkspaceData`, page-level queries).

## Testing baseline before 17.1 visual work

- `npm run build`
- `npm run qa:governance` (when implementing)
- `test:e2e:mobile-pipeline-scroll`
- Convex sub mount traces in dev for file workspace open/close
