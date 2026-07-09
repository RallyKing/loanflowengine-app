# Phase 13.1B — Permission-Aware Readonly / Edit UX Banners

**Date:** 2026-05-21  
**Status:** **COMPLETE — awaiting operator review**  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Vercel deployment:** `dpl_TzJjjGv91SmErBhgpK1YrkLYEZtr`  
**Evidence:** `migration-reports/phase13-step1B-permission-banners.json`

---

## Summary

Shared pipeline files and tasks now show **server-resolved** access banners and enforce view-only UX from canonical ACL (`resolvePipelineAccessLevel` / `resolveTaskAccessLevel` → `resourceShares`). No URL hints, no `sharedWithIds`, no org-role fallback for share mode.

---

## Enforcement source

| Layer | Implementation |
|-------|----------------|
| Server | `convex/resourceViewerAccess.ts` — `buildPipelineViewerAccess`, `buildTaskViewerAccess` |
| Pipeline detail | `pipeline.getDetail` returns `viewerAccess` + `canMutateFile` |
| Task drawer | `resourceViewerAccess.forTask` query |
| Client | `ResourceAccessProvider` + `readOnly` guards on mutations |

**Banner modes**

| Mode | Who | UI |
|------|-----|-----|
| `none` | Owner (or no share) | No banner |
| `view` | Shared view | Gray sticky banner; mutations blocked |
| `edit` | Shared edit | Soft green banner; edits allowed; sharing still owner-only |

---

## UI components

- `components/ResourceAccessBanner.tsx` — neutral gray / soft green, no animation  
- `components/ResourceAccessProvider.tsx` — context: `readOnly`, `bannerMode`, tooltip  
- Pipeline: sticky banner below file chrome (`PipelineFileWorkspaceShell.accessBanner`)  
- Task: banner in `TaskDrawer` header  
- Inline fields (`InlineText`, `InlineSelect`, `InlineNumber`, `InlineTextarea`, `InlineDate`) respect context `readOnly` (opacity 60%, `cursor-not-allowed`, tooltip)

**Pipeline view-only guards:** `patchField`, `runPatchPipeline`, `runPatchDeal`, lender attach/detach, archive, snooze, delete, stage selector (`canMutateWorkspaceFile`), sharing section, inline editors.

**Task view-only guards:** `patchField`, `onDelete`, inline editors, sharing section.

---

## Shared workspace

Opening shared resources from `/shared` navigates to `/pipeline/<id>` or `/tasks?task=<id>`. Banners and disabled state come from the same server queries (not `?shareAccess=view`).

---

## Live proof matrix (production)

Operator: `operator/permissionBannersStep13_1B:runPermissionBannersProof`  
**`pass: true`**

| Step | Requirement | Result |
|------|-------------|--------|
| Joshua owner (file + task) | `bannerMode: none`, `canMutate: true` | **PASS** |
| Eballard view share | `bannerMode: view`, `canMutate: false`, file visible | **PASS** |
| Upgrade to edit | `bannerMode: edit`, `canMutate: true` | **PASS** |
| Downgrade to view | `bannerMode: view`, `canMutate: false` | **PASS** |
| Revoke | `accessLevel: none`, file not in visible list | **PASS** |

---

## Validation gates

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** |
| `npm run deploy:prod` | **PASS** |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |

---

## Manual UI smoke (recommended)

1. Joshua opens owned pipeline file → **no banner**, edits work  
2. Eballard opens same file (view share) → **gray banner**, inline fields and actions disabled  
3. Joshua upgrades to edit → Eballard sees **green banner**, edits work  
4. Joshua revokes → file disappears from Eballard lists without refresh  
5. Repeat on a shared task via `/shared` → `/tasks?task=…`

---

## Phase 12 regression

- `resourceAccess.ts` ACL logic unchanged (viewer helpers compose existing resolvers)  
- Task sharing mutations unchanged  
- No new subscriptions on idle routes beyond existing `getDetail` / task drawer access query  

**STOP:** Awaiting operator sign-off before Phase 13.2.
