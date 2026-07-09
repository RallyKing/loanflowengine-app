# Phase 26.3 — Pipeline table view file display hierarchy

**Date:** 2026-06-03  
**Status:** Shipped (build + Convex prod + Vercel prod)

## Problem

Pipeline **table** rows showed mostly the file name and subtext, forcing users to open the drawer for client, project, and lender context.

## Solution

Enrich `listTablePreview` with **`primaryLender`** and redesign the first column in **`PipelineTableRow`** with a strict typographic stack.

## Primary lender logic

**`lib/pipeline/resolvePrimaryTableLender.ts`**

1. Junction `relationshipType === "selected"` (non-declined), or active `pipeline.selectedLenderId`.
2. Else newest **active** `fileLenders` edge by `createdAt` (declined excluded).
3. Else last id on `pipeline.lenders[]` not declined (legacy fallback).

Returns `{ lenderId, company, source: "selected" | "newest" }`.

Data loaded in **`convex/pipeline.ts` `listTablePreview`** (batch `fileLenders` + all lender docs on visible files).

## Typographic hierarchy (first column)

| Tier | Content | Styles |
|------|---------|--------|
| 1 | File title · client name | `text-sm font-medium text-foreground` (inline edit on title when allowed) |
| 2 | Project | `text-xs text-muted-foreground` |
| 3 | Primary lender | `text-[11px] uppercase tracking-wide`; chosen lender uses `text-primary/85` + filled `Star` |

Client label: `clientDisplayName` → first `linkedClients` → first `graphLinks.clients`.

Momentum, ownership, and “Updated …” remain below the stack.

## Hub projection

No change — table-only. Hub lender columns still use Phase 26.1 declined filtering.

## Validation

From `lender-app/`:

```bash
npm run build
npm run convex:deploy:prod
npm run deploy:prod
```

**Smoke:** Pipeline → table view → confirm title·client, project line, lender line; mark a lender chosen and confirm star/primary tint; reject a lender and confirm fallback to next newest active.

## Production

- **App:** https://dlcfunds.vercel.app (`loanflowengine`) — deploy `dpl_3X4gDFPtRGi3CTwLK2CPdtFu3s8z`
- **Convex:** https://basic-anaconda-984.convex.cloud
