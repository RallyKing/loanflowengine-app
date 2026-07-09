# Phase 36.3 — Entity filters condensation

**Date:** 2026-05-28  
**Status:** Shipped  
**Prerequisite:** `docs/phase36-2-pipeline-header-execution.md`

---

## Summary

Entity-scoped **dropdown filters** that previously sat above the hub data table are now inside the **“Tune view & filters”** panel (`hubViewsFiltersOpen`, closed by default). The collapsed hub shows only **search**, **projection tabs**, the **toggle**, and the **result count** — no filter `<select>` row above the list.

---

## Moved controls

Relocated from `data-pipeline-hub-hierarchy-shell` into the collapsible panel (`data-testid="pipeline-hub-entity-filters"`), first section **Entity & scope filters**:

| Control | Former location |
|---------|-----------------|
| All clients | Above table |
| All projects | Above table |
| Any client involvement | Above table |
| Any relationship | Above table |
| Primary only | Above table |
| Any source type | Above table |
| Any funding health | Above table |
| Any gap size | Above table |
| All referral partners (referral mode) | Above projection search |
| Select visible (bulk) | Above table |

**Still visible outside panel (by design):**

- Hub `SearchField` + `ProjectionModeSwitcher`
- `pipeline-hub-result-summary` (count + total funding)
- Projection-mode `SearchField` (`pipeline-projection-search`) when list has data

---

## Implementation

| File | Change |
|------|--------|
| `lender-app/app/pipeline/PipelinePageClient.tsx` | New panel section; removed ~140-line row above hierarchy shell; referral partner select merged into entity section |

**Panel UX:** Inner panel scroll (`max-h-[min(75vh,44rem)] overflow-y-auto`), `space-y-4` between sections. Entity filters render when `effectiveView === "table"`.

**Badge:** `hubViewsFiltersActiveCount` now includes non-default involvement, capital stack, and referral entity filters.

---

## Default view (page load)

```text
[ Search ]
[ Client | Project | Loan File | … tabs ]
[ Tune view & filters ▼ ]
12 of 48 · Total · $…
[ table / hierarchy content — no dropdown row ]
```

---

## QA

| Check | Result |
|-------|--------|
| `npm run build` | Pass |

**Manual:** `/pipeline` — confirm no dropdowns above table until panel opens; filters still apply when set inside panel.

---

## Deploy

- Command: `npx vercel@latest deploy --prod --yes --project loanflowengine`
- Production: https://dlcfunds.vercel.app
- Deployment ID: `dpl_E8DMFFdCjPzzgk46vPifkpSskEip`
