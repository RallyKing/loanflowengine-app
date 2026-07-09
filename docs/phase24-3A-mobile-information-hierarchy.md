# Phase 24.3A — Mobile Information Hierarchy

**Status:** Complete (structural mobile layout)  
**Scope:** UI only — no Convex, schema, triage bubbling, or delete flows.

## Problem

On mobile, horizontal row shells treated titles as the lowest-priority flex child. Checkboxes, drag handles, badges, due dates, and action rails consumed width first, so client/project/file names and task titles truncated or disappeared.

Bottom navigation used a floating `bottom` offset (`bottomDockOffset` gap + safe-area), leaving a visible gap above the physical screen edge on iOS Safari, Android Chrome, and installed PWA.

## Solution

### Part 1 — Task page (`app/tasks/page.tsx`)

- **max-md:** Two-tier layout per `TaskRow`
  - **Tier 1:** Full-width `InlineText` title (`break-words`, no `truncate` / `line-clamp`)
  - **Tier 2:** Wrapped control strip (checkbox, handle, done, expand, tags, due, type, category, assignee, quadrant, snooze, actions)
- **md+:** Unchanged `OperationalRowShell` horizontal row

### Part 2 — Pipeline hierarchy

| Surface | Change |
|---------|--------|
| `RowShell` / `OperationalRowShell` | `stackOnMobile` + `mobileSecondary` for tier-2 controls |
| `PipelineHubHierarchyView` | Client/project rows stacked; loan rows use explicit mobile/desktop blocks |
| `PipelineHubFileRow` | Stacked title + secondary tier (checkbox, meta, stage, actions) |
| `PipelineHubMobileFileCard` | Icon + full title tier; controls/metadata tier below |
| `FileTaskTriageFeedRow` | Label pill uses `break-words` (no truncate) |

Shared tokens: `lib/ui/mobileInformationHierarchy.ts`

### Part 3 — Bottom navigation

| Before | After |
|--------|-------|
| `bottom: calc(gap + env(safe-area-inset-bottom))` | `bottom: 0` (keyboard lift only) |
| Rounded floating dock with side margins | Full-width bar, `border-t`, flush to viewport |
| Safe-area below nav | `padding-bottom: max(0.5rem, env(safe-area-inset-bottom))` **inside** nav |

Files: `MobileBottomNav.tsx`, `lib/ui/safeArea.ts` (`bottomNavFixedBottom`), `AppChrome.tsx` (content pad `gapPx: 0`).

## Validation (manual)

Capture on **iPhone Safari**, **Android Chrome**, **PWA installed**, and **mobile browser**:

1. Long client name — full wrap, no ellipsis  
2. Long project name — tier 1 title, tier 2 badges/actions  
3. Long file name — hierarchy + mobile file card  
4. Long task title — `/tasks` list  
5. Bottom nav flush to screen bottom; home-indicator padding inside bar  

**Automated baseline:** `npm run qa:governance` from `lender-app/`.

## Files touched

- `lib/ui/mobileInformationHierarchy.ts` (new)
- `lib/ui/safeArea.ts`
- `components/ui/RowShell.tsx`
- `components/ui/OperationalRowShell.tsx`
- `components/MobileBottomNav.tsx`
- `components/AppChrome.tsx`
- `app/tasks/page.tsx`
- `components/pipeline/PipelineHubHierarchyView.tsx`
- `components/pipeline/PipelineHubFileRow.tsx`
- `components/pipeline/PipelineHubMobileFileCard.tsx`
- `components/pipeline/tasks/FileTaskTriageFeedRow.tsx`
