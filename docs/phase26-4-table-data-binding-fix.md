# Phase 26.4 — Pipeline table client & project data binding fix

**Date:** 2026-06-03  
**Status:** Shipped (build + Convex prod + Vercel prod)  
**Depends on:** [Phase 26.3 — Table hierarchy](./phase26-3-pipeline-table-hierarchy.md)

## Problem

Phase 26.3 added the typographic stack in `PipelineTableRow`, but **client** and **project** lines were often blank. `listTablePreview` only copied `resolveFileHierarchy` fields, which can be empty when:

- `clients.displayName` is blank but junction/graph/deal data has the name
- `projectId` exists but hierarchy returned a legacy virtual project before DB title load
- Hierarchy resolution threw or skipped linked clients / deal `clientName` / `projectName`

## Solution

### Backend (`lib/pipeline/resolveTableRowHierarchyDisplay.ts`)

Canonical resolvers used by `listTablePreview`:

**Client** (first non-empty wins):

1. Batched `clients` row (`displayName` → `companyName` → `primaryContactName` → `normalizedName`)
2. Hierarchy client
3. Primary / first `linkedClients`
4. Graph `clients` link
5. Deal intake `clientName` / business legal name
6. Legacy `dealData` / file name parse

**Project** (first non-empty wins):

1. Batched `projects.title`
2. Hierarchy project
3. Graph `projects` link
4. Deal intake `projectName`
5. Legacy `dealData` / file name parse

`listTablePreview` now uses **`safeResolveFileHierarchy`**, batches client/project FK labels, and sets `clientDisplayName` / `projectDisplayTitle` on every row.

### Frontend (`PipelineTableRow.tsx`)

Defensive fallbacks mirror the server chain (including parsing `sourceLabel` borrower/project segment). Layout stack: line 1 title·client (`text-sm font-medium`), line 2 project (`text-xs muted`), line 3 lender (`text-[11px]`).

## Validation

From `lender-app/`:

```bash
npm run build
npm run convex:deploy:prod
npm run deploy:prod
```

**Smoke:** Pipeline → table → rows with FKs, legacy deal-only files, and contact-linked clients should show client + project lines where data exists.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_5nGWQjfNtLAjGCq6j4FDTxz2DNZ3`
- **Convex:** https://basic-anaconda-984.convex.cloud
