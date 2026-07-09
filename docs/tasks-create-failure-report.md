# tasks:create failure report (root cause)

**Date:** 2026-05-28  
**Deployment:** `basic-anaconda-984`  
**Mutation:** `tasks:create` (`lender-app/convex/tasks.ts`)

## Summary

Task creation failed for **every** payload (plain title, scheduled triage, label) with a generic client error:

`[CONVEX M(tasks:create)] Server Error`

The mutation never inserted a row. This was **not** a visibility-filter issue and **not** triage-label logic. The insert object included a field that the `tasks` table schema does not define.

## Evidence (production Convex logs)

Filtered: `npx convex logs --prod --history 200 --jsonl` → `tasks:create` failures.

### Failure A — plain task (no label, no schedule)

| Field | Value |
|-------|--------|
| **Request ID** | `f1cceafae84d6d57` |
| **Throw site** | `ctx.db.insert("tasks", …)` in `tasks:create` handler (~line 546) |
| **Error** | `Failed to insert or update a document in table "tasks" because it does not match the schema: Object contains extra field ownerUserKey that is not in the validator.` |

**Payload (from log object):**

```json
{
  "title": "test",
  "type": "work",
  "category": "admin",
  "quadrant": 2,
  "quadrantPosition": 9,
  "status": "todo",
  "priority": 0,
  "relatedFileId": "jx73pa3as5e8ap648d6b27ynzs87jww4",
  "organizationId": "mx76bxqnc23q76cb99tvrffmy58644pf",
  "ownerUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
  "ownerUserKey": "ts719yfyv2b6020avvctpw0ns586exm6"
}
```

### Failure B — scheduled task (with `highlightColorId` + `scheduledTriggerTime`)

| Field | Value |
|-------|--------|
| **Request ID** | `6c2dae3783e69eb5` |
| **Same throw** | Schema extra field `ownerUserKey` |

**Payload (from log):** same as A plus `highlightColorId: "triage-pending-amber"`, `scheduledTriggerTime: 1780015080000`.

### Not the root cause (ruled out)

| Hypothesis | Result |
|------------|--------|
| `byRelatedFile` visibility filter | Irrelevant — insert never succeeds |
| Invalid `triageLabelId` | Would throw earlier with explicit message from `assertAndResolveTaskTriageFields` |
| Args validator mismatch on client | Would be `ArgumentValidationError`, not post-handler schema error |
| `appendTaskFeed` / `syncIndexedGraphTaskEdge` | Never reached — failure on `insert` |

## Root cause

**File:** `lender-app/convex/resourceAccess.ts` — `ownerFieldsForInsert()`  
**Used by:** `lender-app/convex/tasks.ts` (`create`, demo insert) and `taskTemplateLibrary.ts` (`applyTemplateGroupToFile`)

```ts
export function ownerFieldsForInsert(ownerUserId: string) {
  return { ownerUserId: id, ownerUserKey: id }; // both fields
}
```

**Schema:** `lender-app/convex/schema.ts` — `tasks` table defines `ownerUserId` only (line ~1840). There is **no** `ownerUserKey` on `tasks`. (`pipeline` still has both for legacy ACL.)

Spreading `...ownerFieldsForInsert(actor)` into `ctx.db.insert("tasks", …)` always adds `ownerUserKey`, which Convex rejects as an extra field → uncaught error → client **Server Error**.

## Client payload audit (aligned with server)

| Source | Fields sent | Matches `taskInput`? |
|--------|-------------|----------------------|
| `FileTaskTriageComposer` | `title`, optional `triageLabelId`, optional `scheduledTriggerTime` | Yes (composer → workspace) |
| `PipelineFileWorkspace` `onAdd` | `title`, `type`, `status`, `quadrant`, `category`, `priority`, `relatedFileId`, org scope, optional triage fields | Yes |
| `tasks:create` args validator | `taskInput` + `orgScopeArgs` + optional `actorUserKey` | Yes |

No client-side field mismatch caused this failure.

## Fix

1. Add `ownerUserIdFieldsForInsert()` in `resourceAccess.ts` (returns `{ ownerUserId }` only).
2. Use it in `tasks:create`, demo task insert, and `applyTemplateGroupToFile` instead of `ownerFieldsForInsert`.

## Reproduction (after fix)

From `lender-app/` with prod deploy key:

```bash
node -e "
const {execSync}=require('child_process');
const a={
  title:'RCA post-fix',
  type:'work',
  category:'admin',
  quadrant:2,
  status:'todo',
  priority:0,
  organizationId:'mx76bxqnc23q76cb99tvrffmy58644pf',
  memberUserKey:'ts719yfyv2b6020avvctpw0ns586exm6',
  relatedFileId:'jx73pa3as5e8ap648d6b27ynzs87jww4'
};
console.log(execSync('npx convex run tasks:create --prod '+JSON.stringify(JSON.stringify(a)),{encoding:'utf8'}));
"
```

Expect `{ id: "<taskId>" }` instead of schema error.

## Out of scope (per request)

- Pipeline operational status system (`organizationPipelineStatuses`) — not started.
- Visibility-only changes — secondary; create must succeed first.
