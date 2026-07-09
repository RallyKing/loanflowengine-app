# Phase 15 Step 13 — File deletion repair & screen-maximized workspace

**Date:** 2026-05-25  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud

## Summary

Stopped before Phase 16. Fixed pipeline file deletion for freshly created (empty) loan files and removed nested app chrome on the full-page file workspace so the deal sheet uses the full viewport.

---

## 1. Deletion exception — root cause & fix

### Root cause

Two issues compounded:

1. **Owner identity mismatch** — `createLoanFileUnderProject` stored `ownerUserKey` from the raw `memberUserKey` argument, while `pipeline.remove` resolves the actor via `resolveMemberUserKey` (JWT subject when present). When those differed, `assertCanDeletePipelineRow` threw *"Only the file owner can delete this file."* even for a file the user had just created.

2. **Incomplete satellite cleanup** — `deletePipelineGraph` did not remove optional rows such as `fileMessages`, `collaborationThreads` / comments, `entityAssignments`, `memberPresence`, and `communicationThreads`. Empty files rarely had these, but the path is now safe for files that do.

### Fixes

| Area | Change |
|------|--------|
| `pipelineHierarchyMutations.ts` | `ownerFieldsForActor()` uses `resolveMemberUserKey` before `ownerFieldsForInsert` on all hierarchy creates |
| `organizationAccess.ts` | `assertCanDeletePipelineRow` allows org **admin/owner** with `files.delete` (aligned with hierarchy delete policy) |
| `graphCleanup.ts` | `deletePipelineFileSatellites()` — best-effort cleanup of messages, collaboration, assignments, presence, threads; task search refresh wrapped in try/catch |

### Proof

`operator/emptyFileDeletionProofStep15_13:runEmptyFileDeletionProofStep15_13` — creates a loan file with no tasks/ledger, runs `deletePipelineGraph`, asserts row and edges are gone.

Report: `migration-reports/phase15-step13-layout-and-deletion-repair.json`

---

## 2. Layout — maximized workspace breakout

### Problem

`/pipeline/[fileId]` rendered inside the global SaaS shell: **UnifiedSidebarRail**, **MasterHeaderShell**, connectivity strip, and **MobileBottomNav**, plus a capped `max-w-[1400px]` workspace column — leaving a small usable area.

### Approach

| Layer | Behavior |
|-------|----------|
| `AppChrome.tsx` | Early return for `isPipelineConvexFileRoute`: only skip-link + non-scrolling `<main>` flex shell (`data-pipeline-file-workspace-chrome="minimal"`) — **no** sidebar, master header, bottom nav, or hub padding |
| `PipelineFileWorkspaceShell.tsx` | `WorkspaceContentContainer` `width="fullBleed"` (no 1400px cap; minimal horizontal padding) |
| `PipelineFileWorkspace.tsx` | High-contrast **← Back to Pipeline Hub** control (`data-testid="pipeline-workspace-back-to-hub"`) |

Scroll ownership unchanged: `[data-pipeline-workspace-scroll]` inside the file workspace sheet; `<main>` stays `overflow-y-hidden` with `data-main-scroll-mode="workspace-delegated"`.

---

## 3. Manual proof (Joshua primary session)

1. Pipeline Hub → expand project → **+ Add File** → create file → open workspace.
2. Confirm edge-to-edge layout (no global sidebar/header stack).
3. **Delete file** → returns to hub without error dialog.

---

## 4. Validation run (2026-05-26)

From `lender-app/`:

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app |
| `npm run auth:validate` | ALL_CHECKS_PASSED |
| `npx tsx scripts/run-phase15-step13-layout-and-deletion-repair.ts` | `pass: true` (empty file create → delete, edges 2 → 0) |

---

## STOP

Do not proceed to Phase 16 until this step is reviewed.
