# Phase 15 Step 14 — Project primary cleanup & workspace header compaction

**Date:** 2026-05-26  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud

## Summary

Stopped before Phase 16. Repaired legacy **duplicate primary** rows on `projectClients` so secondary clients can be removed in the UI, and defaulted the pipeline **file workspace header** to a slim collapsed row.

---

## 1. Dual-primary project data cleanup

### Issue

Multiple `projectClients` edges with `relationshipType: "primary"` for one project locked the UI: every “primary” row hid the delete control. Step 8 fixed **loan files**; projects still had dirty graph data.

### Fix

Operator mutation: `operator/fixDuplicateProjectPrimaries:runFixDuplicateProjectPrimaries`

| Rule | Action |
|------|--------|
| Canonical primary | `projects.clientId` FK |
| Other `primary` edges | Demote to `coborrower` |
| Duplicate FK primary rows | Delete extras (keep one) |
| Missing FK primary edge | Insert or patch to `primary` / `sortOrder: 0` |

Runner: `lender-app/scripts/run-phase15-step14-workspace-compaction.ts` (dry-run then apply on Joshua org).

**Production run (2026-05-26):** 18 projects scanned, **1 project repaired**, **1 erroneous primary demoted** to `coborrower` (duplicate primary on `projectClients`; FK `projects.clientId` kept as sole primary).

Full artifact: `migration-reports/phase15-step14-workspace-compaction.json`.

---

## 2. Workspace header compaction (UI)

### Issue

Project assignment, loan clients, switch-file, breadcrumbs, and presence stacked above the fold on every file open.

### Fix (`PipelineFileWorkspace.tsx`)

- **State:** `useState(false)` → `headerDetailsExpanded` (defaults **collapsed** on each navigation to a file).
- **Compact row** (`data-testid="pipeline-workspace-header-compact"`): Back to Pipeline Hub, editable file name, momentum stars, stage badges (+ archived/snoozed chips), expand toggle (`data-testid="pipeline-workspace-header-expand-toggle"`).
- **Expanded panel** (`data-testid="pipeline-workspace-header-details"`): breadcrumbs, Change project, Linked clients, switch file, ownership, scenario, presence — only when expanded.

No `localStorage` persistence: every file load starts collapsed so workspace utilities stay visible.

---

## 3. Manual proof (Joshua session)

**Test 1 — Data:** Open project with former dual primaries (e.g. Cert Project 1779721048243). Only one Primary; secondary row shows trash → remove it.

**Test 2 — Layout:** Open any loan file → header is one slim row; utilities/overview dominate. Toggle **Expand details / edit assignment** → project + client tools appear.

---

## 4. Validation (2026-05-26)

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass → `basic-anaconda-984` |
| `npm run deploy:prod` | Pass → https://dlcfunds.vercel.app |
| `npm run auth:validate` | ALL_CHECKS_PASSED |

---

## STOP

Do not proceed to Phase 16 until reviewed.
