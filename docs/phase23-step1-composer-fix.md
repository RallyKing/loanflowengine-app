# Phase 23.1 — Manual Task Composer Resolution

## Problem

Users reported that **Add task** in the pipeline file drawer appeared to do nothing: no new row in the list and no visible error.

## Root causes

### 1. Tasks created but hidden from the list (primary)

`tasks.byRelatedFile` returned tasks via `filterTaskRowsForMember`, which only keeps tasks the viewer **owns** or has been **shared** on.

After `tasks.create`, the task was inserted with `relatedFileId` set correctly, but the reactive query often **filtered it out** when owner/viewer key resolution did not match (common with session vs. client `memberUserKey` paths).

**Symptom:** Mutation succeeded silently; UI looked unchanged.

**Fix:** Once `assertCanReadPipelineRow` passes for the file, return all org-scoped tasks linked to that file (drawer is file-scoped; user already has file read access).

### 2. Swallowed errors in the composer (secondary)

`FileTaskTriageComposer.submit` used `try/finally` without `catch`. Convex failures became unhandled promise rejections with no toast.

**Fix:** `catch` with `console.error`, inline `role="alert"` message, and `showOperationalToast`.

### 3. Silent local validation (UX)

With **Schedule date** toggled on but no datetime chosen, `canSubmit` was false (button disabled). Users interpreted this as a broken button.

**Fix:** `submitBlockedReason()` + toast when submit is attempted while blocked; inline hint when schedule is on without a date.

### 4. Early returns in `onAdd` without throwing

`PipelineFileWorkspace` used `window.alert` + `return` for offline/no-org cases. The composer treated that as success and cleared the form.

**Fix:** Throw after toast so the composer does not reset; pass `organizationId` / `memberUserKey` explicitly to `createTask`.

## Payload alignment (Phase 22)

Manual create sends only:

- `title` (required)
- `triageLabelId` (optional)
- `scheduledTriggerTime` (optional)

No deprecated `isUrgent` or `highlightColorId` from the client — server resolves highlights via `assertAndResolveTaskTriageFields`.

## Verification

1. Open a pipeline file → Tasks → enter text only → **Add task**
2. Task appears in the list immediately
3. On failure, toast + red inline message
4. Toggle Schedule without date → hint; disabled button or toast if forced submit
5. `npm run build`
