# Phase 36.2 — Pipeline hub header refactor & condensation

**Date:** 2026-05-28  
**Status:** Shipped  
**Prerequisite:** `docs/phase36-1-pipeline-header-audit.md`

---

## Summary

The Pipeline hub filter toolbar is now **minimal by default**: only **hub search** and **projection mode tabs** (Client, Project, Loan File, etc.) stay visible. All secondary controls live behind a single **“Tune view & filters”** disclosure, **closed on initial load**.

Tablet **640px–767px** collision is addressed by stacking the primary tier with **`flex-wrap` + `gap-4`**, full-width bases, and **`overflow-hidden`** on the projection strip container.

---

## Changes

### Primary tier (`data-testid="pipeline-hub-primary-toolbar"`)

| Before | After |
|--------|--------|
| `sm:flex-row` without wrap; dual `flex-1` competition | `flex-col flex-wrap gap-4`; search `basis-full` + capped `sm:flex-1`; projection `w-full overflow-hidden sm:flex-[2_1_0%]` |
| Search + tabs + sort + density + … in one row | **Only** `SearchField` + `ProjectionModeSwitcher` |

### Collapsible tier (`hubViewsFiltersOpen`, default `false`)

- Toggle: **`data-testid="pipeline-hub-views-filters-toggle"`** — Sliders icon, active-count badge, chevron rotation.
- Panel: **`id="pipeline-hub-views-filters-panel"`** — `OP_DISCLOSURE_TRANSITION` max-height reveal.
- **View & layout:** Sort, Table/Board (desktop), settings links, Density, Quick presets, Saved views, mobile Cards/Grid.
- **Export:** Copy / TSV / CSV / JSON (when rows visible).
- **Stage & status filters:** Former `OperationalFilterDrawer` chip row (inline; separate drawer trigger removed).

### Removed / consolidated

- `ResponsiveToolbarGroup`, hub `DropdownMenu` overflow, duplicate export row outside panel.
- `PipelineHubMobileFilterSheet` + trigger on hub (filters accessible via same disclosure on mobile).
- `OperationalFilterDrawer` wrapper on hub (content preserved inside panel).

### Always visible (below toggle)

- Result summary: `data-testid="pipeline-hub-result-summary"` (count + funding total).
- Collapsed-state filter pills on `md+` when panel closed (up to 4 + overflow count).

---

## Files touched

| File | Change |
|------|--------|
| `lender-app/app/pipeline/PipelinePageClient.tsx` | Header restructure, `hubViewsFiltersOpen`, `hubViewsFiltersActiveCount` |

---

## QA

| Check | Result |
|-------|--------|
| `npm run build` (from `lender-app/`) | Pass |

**Manual smoke (recommended):** `/pipeline` at 375px, 700px, 1280px — confirm no search/tab overlap; toggle opens/closes; sort/export/stage chips work.

---

## Deploy

- Command: `npx vercel@latest deploy --prod --yes --project loanflowengine` (from `lender-app/`)
- Production: https://dlcfunds.vercel.app
- Deployment ID: `dpl_Gow4ijTEaTmWz5vSY4SuhQ82aj2F`

---

## Follow-ups (optional)

- Persist `hubViewsFiltersOpen` in session if users prefer it expanded.
- Run `npm run qa:governance` for full mobile gate.
- Update Playwright helpers if any test targeted removed mobile filter sheet id.
