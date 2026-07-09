# Phase 33.3 — Tasks page extreme minimalism (shipped)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior:** `docs/phase33-2-tasks-page-optimized.md`

## Objective

Aggressively prune top-level `/tasks` chrome so the matrix and task rows dominate the viewport.

## Changes (`lender-app/app/tasks/page.tsx`)

### Noise reduction

- **Removed** the desktop Eisenhower instructional paragraph under the page title.
- **Removed** per-view helper copy (Today / Week / Long-term / Matrix hints).
- **Removed** collapsible section description text under “Filters & export”.
- Page vertical rhythm tightened: main stack `space-y-6` → `space-y-3`; toolbar stack `space-y-1`.

### Single header row

- Search (`h-8`, short placeholder) and view toggles (Matrix, Today, This week, Long-term) share **one** `flex-nowrap` row inside a compact bordered bar (`py-1.5 px-2`).
- Dropped the “View:” label.
- Matrix Focus / Sort / Density / Expand–Collapse sit in a **second slim row** (`border-t`, `py-1`) within the same bar — not a separate card.

### Filters & export

- Unchanged behavior: `CollapsibleSection` `defaultOpen={false}`, `lazyMount={false}` directly under the header bar.
- Tighter collapsible header (`headerClassName="!py-2"`, `shadow-none`).

### Page chrome

- Title row: single line `Tasks` + notifications bell (smaller title).
- Add-task form: reduced padding (`px-2 py-2`).

### Quadrant tightening

- Header padding: `py-1` / `py-1.5` (was `py-2` / `py-3`).
- Removed heavy header `border-b`; list uses light `border-t` flush to header.
- Task list: `py-0` on `<ul>`, reduced horizontal padding and min-heights.
- Q title: **bold, centered** `text-base`; blurb + count on one `text-[10px]` line under title.
- Section cards: `rounded-lg`, no `shadow-sm`; quadrant stack gap reduced.

## Deploy

- `npm run build` — passed (2026-05-28)
- Vercel production `dpl_4uWoEgHcvoVBuPBjsShDZVsXcMHT`

Production: https://dlcfunds.vercel.app

## Smoke

1. `/tasks` — no Eisenhower essay; search + four view buttons on one line.
2. Matrix — second row shows Focus/Sort/Density without extra card.
3. Filters collapsed by default; expand still preserves filter state.
4. Q1–Q4 — tight header, first task row immediately below list border.
