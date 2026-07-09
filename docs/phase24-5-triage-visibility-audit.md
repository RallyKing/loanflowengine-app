# Phase 24.5 — Triage visibility audit

**Date:** 2026-05-28  
**Scope:** Trace triage label bubbling from org labels → tasks → hub map → UI.  
**Constraint:** No changes to severity math, participation rules, or upward bubble algorithm in this audit.

## Trace map

```
organizationTriageLabels (convex/organizationTriageLabels.ts)
  ↓ loadTriageLabelsForOrg
tasks (by_organization)
  ↓ buildHubTriageHighlightMap (convex/taskHighlights.ts)
  ↓ getHubTriageHighlightMap / getFileTriageHighlight
hubTriageMapFromQuery / normalizeHubTriageHighlightMap (lib/pipeline/hubTriageHighlight.ts)
  ↓ resolveTriageHighlight
UI: PipelineHubHierarchyView, PipelineHubFileRow, PipelineBoardView,
    PipelineHubMobileFileCard, PipelineFileWorkspace, useHubTriageHighlightMap
```

## Participation (which tasks can bubble)

`lib/pipeline/triageHighlightParticipation.ts` — `taskParticipatesInTriageBubble`:

- Task status must be `todo` or `in_progress` (not done/archived).
- `triageLabelId` must be set.
- If `scheduledTriggerTime` is set, it must be `<= nowBucket`.

**No** `ownerUserId`, assignee, or viewer identity in this layer.

## Severity and winner selection

`buildHubTriageHighlightMap` (unchanged algorithm):

1. Per file: max `severityWeight` among participating labeled tasks on that file (`pickStrongerEntry`).
2. Per project: max among file winners in project.
3. Per client: max among project winners.

`resolveTriageLabelSeverityWeight` and color presets are org-wide — not user-specific.

## Pre-24.5 visibility gate (finding)

In `buildHubTriageHighlightMap`, tasks were filtered with:

```ts
filterTaskRowsForMember(ctx, tasks, organizationId, memberUserKey)
```

`filterTaskRowsForMember` (`convex/resourceAccess.ts`) keeps a task only if:

| Rule | Uses task owner? | Uses assignee? | Uses current user? |
|------|------------------|----------------|--------------------|
| Impersonation org visibility | — | — | Yes (elevated) |
| `ownerUserId === viewer` | **Yes** | No | Yes |
| Task resource share (`view` / `edit` on **task** row) | No | No | Yes |

**Does not** check `relatedFileId` or pipeline file read access.

### Answers (pre-fix)

| Question | Answer |
|----------|--------|
| Does bubbling use task owner? | **Indirectly** — only tasks owned by viewer (or task-shared) entered the map. |
| Does bubbling use assigned user? | **No** — assignee fields are not read in `taskHighlights.ts`. |
| Does bubbling use current user? | **Yes** — via `filterTaskRowsForMember` membership + task ACL. |
| Does bubbling use file visibility? | **No** — file read ACL was not used for task inclusion. |
| Can shared viewers see the same highlight as owners? | **Often no** — viewer with **file** read/edit but **no** task share and not task owner would **not** see another user’s labeled task in bubbles. |
| Can shared editors see the same highlight as owners? | **Same as viewers** unless they also own or hold a task-level share on the labeled task. |

### Other ACL on the path

- `getHubTriageHighlightMap` calls `assertOrgMember` — org membership required.
- After a task wins for a file, `safeResolveFileHierarchy` resolves project/client keys; failures skip hierarchy keys but do not re-check file ACL separately.
- UI does not filter highlights client-side; map is authoritative from Convex.

## Phase 24.5 fix (visibility only)

`buildHubTriageHighlightMap` now includes a task when:

1. `taskParticipatesInTriageBubble(task, now)`  
2. `relatedFileId` + `triageLabelId` present  
3. `pipelineFileReadable(ctx, file, memberUserKey)` for that file  

`filterTaskRowsForMember` was **removed from this path only**. Task list queries, drawers, and global search still use task ACL.

**Unchanged:** severity weights, `pickStrongerEntry`, project/client rollup, operational status engine, task ownership model.

## Post-fix expected behavior

| Question | Answer |
|----------|--------|
| Shared file viewer | Sees file/project/client highlight if **any** open labeled task on that file qualifies (subject to participation + schedule). |
| Task owner-only visibility for bubbles | **Removed** from highlight map. |
| Task-level share still required for bubbles | **No** — file read is sufficient. |

## Regression watch

- User with **no** file access should still see **no** bubble for that file.
- Impersonation / org-wide visibility paths on **pipeline** reads still apply via `pipelineFileReadable`.
- Completing/archiving tasks or clearing labels should still clear bubbles (participation rules unchanged).

## Evidence checklist

- [ ] User A labels task on shared file; User B (file share, not task owner) sees red file + project + client on hub.
- [ ] User C without file access sees no highlight for that file.
- [ ] Owner-only task on file user cannot read: no highlight for that user.
