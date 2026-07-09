# Phase 18.8A — Delete Reliability Hardenization

**Status:** COMPLETE  
**Scope:** Execution reliability only — no modal redesign, schema, ACL, or projection architecture changes.

## Problem statement

Phase 18.8 delivered premium destructive confirmation UX, but operators still reported:

- Modals that never close or never stop spinning
- Silent failures (no clear outcome)
- Vague Convex errors (`Mutation failed`, generic messages)
- Permission/ownership blocks that were not explained before confirm

## Root causes (mapped)

| Class | Symptom | Root cause | Fix |
|-------|---------|------------|-----|
| **G** Pending deadlock | Spinner never ends | `OperationalConfirmProvider.close()` blocked while `busy`; Escape blocked while `pending` on controlled dialogs | Provider allows cancel during `busy`; timeout on imperative confirm |
| **H** Unhandled rejection swallowed | Success assumed when mutation failed internally | Callers catching errors without rethrowing in imperative `onConfirm` | Provider surfaces thrown errors; controlled dialogs keep inline `deleteError` |
| **A/B** ACL / ownership | “Delete does nothing” | `getHubClientDeleteStatus` returned `canDeleteOrReassign: false` without `blockMessage` | `blockMessage` populated in query + shown in dialog tertiary |
| **C** Missing cascade flag | ConvexError about `forceCascade` | UI sends `forceCascade` when nested counts > 0 | Already wired in hub actions; status query precomputes counts |
| **K** Dialog close race | Modal stuck after navigation | Overlay `onClose` during pending blocked cancel | Cancel always clears `pending` state in `finally` blocks |

## Execution path (client delete — highest risk)

```
Hub delete button
  → OperationalConfirmDialog (controlled)
  → onDelete()
  → deleteHubClient mutation
  → assertCanDeleteOrReassignHierarchyEntity
  → cascadeDeleteClient (if nested + forceCascade)
  → deleteClientGraphEdges + ctx.db.delete
  → Convex reactive queries refresh hub projection
  → setDeleteOpen(false) + finally setDeleting(false)
```

## Changes delivered

### UI execution layer

- `lib/ui/convexErrorMessage.ts` — stable Convex → user-facing messages (`ConvexError.data` first)
- `lib/ui/operationalAsync.ts` — `withOperationalTimeout` (25s) for imperative confirms
- `OperationalConfirmProvider` — errors surface in-dialog; cancel allowed during in-flight work; timeout recovery message
- Hub hierarchy delete handlers — `try/finally` guarantees `deleting` clears; success closes dialog; failure keeps dialog open with `deleteError`

### Backend intelligence (read-only)

- `getHubClientDeleteStatus` now returns actionable `blockMessage` when `canDeleteOrReassign` is false (permission / shared-file ownership)

### Governance tests

- `tests/e2e/smoke.spec.ts` — `safeGoto` helper reduces flaky `ERR_ABORTED` during multi-route smoke (not delete-specific but stabilizes CI gate)

## Failure UX contract (post-18.8A)

| Outcome | User sees |
|---------|-----------|
| Success | Dialog closes; hub row disappears on refresh; optional success toast from caller |
| Permission denied | Inline error in dialog + tertiary guidance from `blockMessage` |
| Network / slow | “Taking longer than expected…” after 25s; can cancel and retry |
| Validation | Convex message in plain language (no stack traces) |

## Validation (2026-05-28)

From `lender-app/`:

| Step | Result |
|------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `https://basic-anaconda-984.convex.cloud` |
| `npm run qa:governance` | Pass (0 failed; mobile skips when hub/file env unavailable) |
| `npm run deploy:prod` | Pass → **https://lender-app-zeta.vercel.app** (`dpl_4fsgVFHdeQ7hBHJaQ1pZioBKmvRh`) |

## Manual production smoke (recommended)

1. Pipeline hub → delete client with nested projects (typed `DELETE`, `forceCascade`)
2. Delete client with zero nested rows (no typed confirm)
3. Delete loan file from hub row + file workspace danger zone
4. Attempt delete as non-owner collaborator — expect permission message, modal stays open
5. Mobile: confirm → cancel → confirm again (no stuck overlay)

## Out of scope (explicit)

- New delete mutation logic / cascade graph changes
- Visual redesign of `OperationalConfirmDialog`
- Dedicated Playwright delete certification suite (follow-up 18.8B if needed)

**STOP** — Phase 18.9 not started.
