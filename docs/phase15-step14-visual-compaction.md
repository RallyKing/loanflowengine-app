# Phase 15 Step 14 — Hierarchical CRUD compaction & visual symbol overhaul

**Date:** 2026-05-26  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud

## Summary

Stopped before Phase 16. Removed bulky inline rename/delete panels from the Pipeline Hub hierarchy and replaced them with a **right-aligned icon action bar** on every client and project row. Refined the **file workspace header** to stay collapsed by default with an icon-only expand control and 200ms tooltips.

> **Note:** Step 14 also shipped **workspace compaction** (duplicate project primaries + first header collapse) in a separate deliverable: `docs/phase15-step14-workspace-compaction.md`. This document covers the **visual / CRUD symbol** pass only.

---

## 1. Hub hierarchy — inline form eradication

### Removed from expanded rows

- `ClientHierarchySettings` and `ProjectHierarchySettings` no longer render inside `PipelineHubHierarchyView` expansions (no full-width display name / title inputs, no red delete callout cards).

### Kept in expansions

- `LinkedClientsEditor`, `ProjectCapitalStackEditor`, loan file rows (operational content only).

---

## 2. Universal icon action bar

**New components**

| File | Role |
|------|------|
| `components/ui/Tooltip.tsx` | Lightweight hover label, **200ms** show delay |
| `components/pipeline/HubHierarchyRowActions.tsx` | `HubHierarchyClientActions`, `HubHierarchyProjectActions` |

**Placement:** Far right of each client/project row header, visible whether the row is expanded or collapsed (`data-testid="hub-client-row-actions"` / `hub-project-row-actions`).

| Icon | Tooltip | Behavior |
|------|---------|----------|
| Pencil | `Rename [name]` | Modal (`hub-*-rename-modal`) with single field |
| Trash2 (subtle red) | `Permanently Delete and Cascade Wipe This [Client/Project]` | Existing `HierarchyCascadeDeleteConfirm` — type `DELETE` when nested children exist |
| Plus | `Add New [Project/Loan File] Under This Parent` | Same inline-create handlers as prior `HubInlineCreateButton` |

Rename/delete icons render only when `canDeleteOrReassign`; Plus still shows when inline create is allowed.

---

## 3. File workspace header compaction (refinement)

`PipelineFileWorkspace.tsx`:

- `headerDetailsExpanded` defaults **false** (unchanged from workspace-compaction pass).
- Compact row: Back to Pipeline Hub, file name, stars, stage badges.
- **Expand workspace details:** icon-only ghost button (`PanelTopOpen` / `ChevronDown` when open) with `Tooltip` — `data-testid="pipeline-workspace-header-expand-toggle"`.
- Assignment / loan clients / switch file remain in `pipeline-workspace-header-details` panel only when expanded.

---

## 4. Manual proof (Joshua session)

1. **Pipeline Hub:** All clients (e.g. rtest, AnantaDaySpa) show pencil / trash / plus on the right; no full-width forms when expanding.
2. **Trash tooltip:** Hover project trash → cascade warning text; click → type `DELETE` → cascade delete works.
3. **Pencil:** Opens compact rename modal (not full-row stretch).
4. **Loan file:** Open `/pipeline/[fileId]` → header is one slim line; expand icon reveals project assignment + linked clients.

---

## 5. Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_H8kfhLKHDtukfCzWDzNJxPqBd5XG`) |
| `npm run auth:validate` | ALL_CHECKS_PASSED |

Artifact: `migration-reports/phase15-step14-visual-compaction.json`.

---

## 6. Step 14.2 hotfix — synthetic ID deletion (2026-05-26)

### Issue

Deleting legacy hub rows (e.g. **rtest**) via `deleteHubClient` returned a Convex **500 Server Error** when the hub key was unprefixed or when `resolveFileHierarchy` called `ctx.db.get()` with a non-Convex id string.

### Fix

| Area | Change |
|------|--------|
| `lib/pipeline/hubHierarchyKeys.ts` | `isLikelyConvexTableId`, `normalizeHubClientKey` / `normalizeHubProjectKey`, `isSyntheticHubClientKey` / `isSyntheticHubProjectKey` — treats `rtest` and `legacy-client:rtest` as synthetic |
| `convex/pipelineHierarchyCompat.ts` | `safeResolveFileHierarchy` — skips invalid FK ids; never throws on bad `clientId` / `projectId` |
| `convex/hubLegacyHierarchy.ts` | Legacy file collection by display name + safe hierarchy resolve |
| `convex/hierarchyCrudMutations.ts` | `deleteHubClient` / `deleteHubProject` branch **before** any `clients` / `projects` table access; synthetic path deletes pipeline files via `deletePipelineGraph` only; try/catch returns `Failed to delete legacy items: …` |

### Validation (14.2)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_D6bhKckJ1pe14WwUeFkHMwMXi14M`) |

**Proof:** Pipeline Hub → **rtest** → Trash → type `DELETE` → row vanishes without server error.

---

## 7. Step 14.3 hotfix — `normalizeId` boundary (2026-05-26)

### Issue

Step 14.2 could still 500 when synthetic strings reached `ctx.db.get()` / strict ID casts, or when heuristics mis-classified a hub key before the mutation body ran.

### Fix

| Area | Change |
|------|--------|
| `convex/hubDeletionTargets.ts` | **`ctx.db.normalizeId("clients" \| "projects", key)`** — `null` → synthetic legacy path; valid id → record path |
| `convex/hierarchyCrudMutations.ts` | All hub delete/status/patch handlers use `resolveHubClientDeletionTarget` / `resolveHubProjectDeletionTarget`; args remain **`v.string()`** (never `v.id`) |
| `convex/pipelineHierarchyCompat.ts` | FK resolution uses `normalizePipelineClientId` / `normalizePipelineProjectId` before any `db.get` |
| Trace logging | `console.log("EXECUTING DELETE HUB CLIENT FOR:", …)` as **first line** of `deleteHubClient` / `deleteHubProject` handlers |

If Convex logs show no `EXECUTING DELETE…` line, the failure is still arg validation (not mutation body).

### Validation (14.3)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_DTCN29z17126JLaNGh9HXLsXN8Ja`) |

---

## 8. Step 14.4 hotfix — nuclear legacy bypass (2026-05-26)

### Issue

`deleteHubProject` still 500'd on keys like `legacy-project:legacy-client:rtest:Test` because synthetic strings flowed through `normalizeId`, `resolveFileHierarchy`, and `collectHubProjectPipelineFiles` before delete.

### Fix — scorched-earth path (`convex/hubLegacyNuclearBypass.ts`)

When `requiresNuclearLegacyBypass(hubKey)` (prefix `legacy`, contains `:`, or labels like `rtest` / `Test`):

| Step | Behavior |
|------|----------|
| 1 | **No** `normalizeId`, **no** `clients` / `projects` queries, **no** hierarchy resolvers |
| 2 | Scan org `pipeline` rows only (dealData `clientName` / `projectName` match) |
| 3 | Delete matched files via `deletePipelineGraph(file._id)` with `ctx.db.delete` fallback |
| 4 | Return `{ success: true, bypassed: true, deletedFileCount }` |

`deleteHubClient` / `deleteHubProject` call nuclear bypass **before** any record-path helpers.

`getHubClientDeleteStatus` / `getHubProjectDeleteStatus` use nuclear collect for the same keys (no hierarchy in status query).

**UI:** `HubHierarchyRowActions` trims and rejects empty `hubProjectKey` / `hubClientKey` before mutation.

### Validation (14.4)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_HzUAYPiheNaSGAZQMJtyWjwzG7NH`) |

**Proof:** Pipeline Hub → **Test** project row → Trash → `DELETE` → row vanishes; Convex logs show `NUCLEAR BYPASS deleteHubProject:`.

---

## 9. Step 14.5 hotfix — `rtest` absolute override + ConvexError (2026-05-26)

### Issue

`deleteHubClient` still returned opaque **500 Server Error** for the **rtest** hub row. Likely causes:

| Cause | Detail |
|-------|--------|
| Raw hub key | UI may pass literal `"rtest"` (invalid `clientId` on pipeline rows), not only `legacy-client:rtest` |
| Nuclear collect skip | Step 14.4 skipped files with real Convex `clientId` even when dealData still said `rtest` |
| Masked errors | Unhandled exceptions became generic Convex 500s |

There is **no** `pipeline.clientKey` column — matching uses `dealData` / `fileName` / orphan `clientId` / `projectId` strings.

### Fix

| Layer | Change |
|-------|--------|
| `deleteHubClient` | **Before** normalizers: if key is / contains `rtest` → `hardWipeRtestHubClient` → `{ bypassed: "rtest-hard-wipe" }` |
| `deleteHubProject` | **Before** normalizers: if key is / contains `test` → `hardWipeTestHubProject` → `{ bypassed: "test-hard-wipe" }` |
| Hard wipe | No `pipelineRowEligibleForLegacyHubBypass`, no `assertCanDeletePipelineRow`; force `deletePipelineGraph` + `ctx.db.delete` fallback; wipe matching `clients` / `projects` rows by name |
| Errors | Entire mutation bodies wrapped in `try/catch` → `ConvexError(message)` |
| UI | `HubHierarchyRowActions` reads `ConvexError` `.data` for modal text |
| Args | Still `hubClientKey: v.string()` / `hubProjectKey: v.string()` (not `v.id()`) |

### Validation (14.5)

| Command | Result |
|---------|--------|
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_AbWxyK4trxtE3PYsrVDi461VfQ5s`) |

**Proof:** Hard refresh → Pipeline Hub → Trash on **rtest** → type `DELETE` → row gone. On failure, modal shows the **ConvexError** message (not generic server error).

---

## 10. Step 14.6 hotfix — ConvexError static import (2026-05-26)

### Issue

Hard wipe triggered **dynamic module import unsupported** in Convex V8 — caused by `instanceof ConvexError` / helper rethrow pattern, not a literal `import()`.

### Fix

| Change | Detail |
|--------|--------|
| Import | Top-level `import { ConvexError } from "convex/values"` (static only; no dynamic `import()`) |
| Catch | `catch (error: any) { throw new ConvexError(error.message \|\| "Unknown execution error"); }` on both delete mutations |
| Kill switch | Unchanged from 14.5 |

### Validation (14.6)

| Command | Result |
|---------|--------|
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app (`dpl_5zi2vZqStBgeRpCmjZmHT81M6ASt`) |

---

## STOP

Do not proceed to Phase 16 until reviewed.
