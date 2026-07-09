# Phase 24.10 — Convex subscription & render loop audit

**Date:** 2026-05-29  
**Scope:** Pipeline hub (`PipelinePageClient`, `PipelineHubProjectionView`, `PipelineHubHierarchyView`), pipeline file workspace (`PipelineFileWorkspace`, `FileNotesBlock`, file tasks/notes), shared triage clock and Convex diagnostics.

## Symptoms

Users reported unprompted UI refreshes and ongoing network/Convex activity while idle — a billing and UX risk.

## Findings

### 1. Unstable `useQuery` argument objects (subscription churn risk)

Convex deep-compares query args, but unstable object literals still cause unnecessary effect churn in diagnostics and make regressions likely when args are derived inline.

| Location | Issue | Fix |
|----------|--------|-----|
| `hooks/usePipelineFileNotes.ts` | Inline `{ pipelineFileId, organizationId, memberUserKey }` every render | `usePipelineFileOrgQueryArgs()` |
| `hooks/useHubTriageHighlightMap.ts` | Inline org + `nowBucket` object | `useMemo` for `queryArgs` |
| `components/pipeline/PipelineHubProjectionView.tsx` | **Duplicate** `getHubTriageHighlightMap` subscription (local `useQuery` + same data as hook) | Replaced with `useHubTriageHighlightMap` only |
| `components/pipeline/blocks/FileTasksBlock.tsx` | Inline org member args (×2 queries) | `useOrgMemberQueryArgs()` |
| `components/pipeline/tasks/FileTaskTriageComposer.tsx` | Same | `useOrgMemberQueryArgs()` |
| `components/pipeline/tasks/triage/TaskTriageQuickEditPopover.tsx` | Same | `useOrgMemberQueryArgs()` |
| `components/PipelineDrawerParallelBlockContainer.tsx` | Inline `getNormalized` args | `useMemo` for `normalizedArgs` |

**New helper:** `lender-app/lib/convex/useStableConvexArgs.ts` — `useOrgMemberQueryArgs`, `usePipelineFileOrgQueryArgs`.

### 2. `useEffect` / layout hydration (file workspace)

| Location | Issue | Fix |
|----------|--------|-----|
| `PipelineFileWorkspace.tsx` deep-link block open | Deps included `searchParams` object (unstable identity in Next.js) | Deps narrowed to `deepLinkBlock` string + `pipelineReadyId` |
| `PipelineFileWorkspace.tsx` drawer layout persist | Deps included full `detail?.pipeline` (new reference on every Convex push) | Persist/hydration gates use `pipelineReadyId` only; persist still compares `drawerLayoutConvexPersistKey` before mutating |

**No loop found** in Phase 24.7 `activeBlockIds` / `setSectionExpanded`: hydration runs once per file id via `drawerHydratedForIdRef` and `fileNotesDefaultsForIdRef`; expand defaults do not re-fire after user dirty flag.

### 3. Triage clock — bounded refresh (not an infinite loop)

`TriageClockProvider` intentionally advances a minute bucket so scheduled triage highlights can activate without a task mutation. That causes **at most one** `getHubTriageHighlightMap` re-query per minute per mounted hub/file surface while the tab is visible.

**Stabilizations applied:**

- Skip tick updates when `document.visibilityState === "hidden"`.
- Resync once when tab becomes visible again.
- `setCurrentTriageTime` uses functional update and no-ops when the bucket unchanged (avoids redundant subtree re-renders).

**Expected idle behavior (visible tab):** passive WebSocket + ~1 triage highlight query/min on pipeline hub or file routes with triage UI; **no** continuous loop. Hidden tab: no minute tick, no triage-driven re-query from clock.

### 4. Other idle traffic (by design, documented)

| Source | Cadence | Notes |
|--------|---------|--------|
| `usePresence` on file workspace | ≤1 mutation / 60s when visible | Deduped by payload key; not a render loop |
| `LiveConnectionProvider` | Convex WS keepalive | Normal transport |
| `pipeline.listTablePreview` on hub | Reactive only | Updates when pipeline data changes, not on a timer |

### 5. Diagnostics hook churn (dev/governance)

`useConvexSubQueryArgsTrace` re-ran register/unregister whenever arg **object identity** changed. Fixed by depending on a serialized `argsKey` while still passing stable `args` to governance.

## Components audited — no change required

- **`PipelineHubHierarchyView.tsx`** — no `useQuery`; expansion is controlled props only.
- **`FileNotesBlock.tsx`** — thin wrapper; subscription in `usePipelineFileNotes` (fixed upstream).
- **`CollapsibleSection` `lazyMount`** — mounts body once on first open; no setState loop.

## Verification

1. `npm run build` from `lender-app/`
2. `npm run deploy:prod`
3. Manual: open pipeline hub and a file workspace; leave idle 2+ minutes with DevTools Network — expect no rapid-fire Convex calls; at most ~1 triage map refresh per minute while visible.
4. Optional: `localStorage` / `NEXT_PUBLIC_DLC_CONVEX_SUB_DEBUG` for `useConvexSubQueryArgsTrace` forensics.

## Historical note (prod logs)

Earlier `tasks:create` failures from `ownerUserKey` schema mismatch were **historical**; current inserts use `ownerUserIdFieldsForInsert()` (`ownerUserId` only). Not related to subscription loops.
