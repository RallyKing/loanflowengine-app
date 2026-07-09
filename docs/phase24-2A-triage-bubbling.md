# Phase 24.2A — Simple triage bubbling

**Status:** Implemented (attention-only; not operational status).

## Goal

When an open file task has a colored **triage label** (`organizationTriageLabels`), the label’s color bubbles **reactively** to:

1. The **pipeline file** row/card  
2. The **parent project** row (strongest file in that project)  
3. The **parent client** row (strongest project under that client)

Highlights clear when the task is **done** or **archived** (no page refresh — Convex subscription + `TriageClockProvider` minute bucket for scheduled labels).

This is **not** connected to pipeline stages, `file.status`, project/client status, or the Phase 24.1 operational status engine.

## Non-goals (explicit)

- No colors written to `clients`, `projects`, or `pipeline`  
- No rollup tables, provenance, SLA, ownership, or workflow orchestration  
- No operational “effective status” system  

## Data model

### `organizationTriageLabels`

| Field | Purpose |
|-------|---------|
| `label`, `colorId` | Existing |
| `severityWeight` (optional) | Winner tie-break; higher wins |

Defaults when unset: `lib/pipeline/triageSeverityWeight.ts` (e.g. Compliance Hold → 1000, Call Client → 100).

### Tasks (existing)

Participation requires **all** of:

- `status` is `todo` or `in_progress`  
- `triageLabelId` is set  
- If `scheduledTriggerTime` is set: `scheduledTriggerTime <= nowBucket`  
- `relatedFileId` points at the file  

## Reactive query

**`taskHighlights.getHubTriageHighlightMap`**

Args: `organizationId`, `memberUserKey`, `nowBucket` (from `TriageClockProvider`).

Returns:

```ts
{
  files: Record<fileId, TriageHighlightEntry>,
  projects: Record<projectKey, TriageHighlightEntry>,
  clients: Record<clientKey, TriageHighlightEntry>,
}
```

Algorithm (server):

1. For each participating task → pick strongest entry per **file** (`severityWeight`, then `sourceTaskId`).  
2. Bubble file winners → **project** keys (`hubProjectKeyFromHierarchy`).  
3. Bubble project winners → **client** keys (`hubClientKeyFromHierarchy`).  

## Client integration

| Layer | Mechanism |
|-------|-----------|
| Hook | `useHubTriageHighlightMap` → `hubTriageMapFromQuery` |
| Lookup | `resolveTriageHighlight(map, { kind, id })` |
| Chrome | `HubTriageHighlightFrame` — 4px left rail, inset glow, pill badge |
| Hub hierarchy | `PipelineHubProjectionView` → `PipelineHubHierarchyView` / `PipelineHubFileRow` |
| Board | `PipelineBoardView` + `HubTriageHighlightFrame` on cards |
| Mobile cards | `PipelineHubMobileFileCard` |
| File workspace | `FileWorkspaceTriageHighlight` under file title (“Source: …”) |
| Settings | `OrganizationTriageLabelsPanel` — edit `severityWeight` |

## Visual contract

- Subtle left border + inset shadow + small pill  
- **No** full-row fills or heavy warning banners  
- Hub stays calm  

## Manual success test

1. Open a file; create a task with a triage label.  
2. **Expect:** file, project, and client rows/cards show rail + pill without refresh.  
3. Mark task **done**.  
4. **Expect:** all three highlights disappear instantly.  
5. Optional: task with future `scheduledTriggerTime` — highlight appears when minute bucket advances (no polling).  

## Related docs

- Phase 24.1 operational status: **on hold** — `docs/phase24-1-status-engine-architecture-lock.md`  
- Scroll / hub: `docs/scroll-architecture-rules.md`, `docs/governance/runtime-workspace-scroll-authority.md`  

## Key files

- `convex/taskHighlights.ts` — query + bubble  
- `lib/pipeline/triageHighlightParticipation.ts`  
- `lib/pipeline/hubTriageHighlight.ts`  
- `hooks/useHubTriageHighlightMap.ts`  
- `components/pipeline/tasks/HubTriageHighlightChrome.tsx`  
