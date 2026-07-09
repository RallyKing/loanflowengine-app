# Phase 15 Step 15 — UI stability + responsive action parity

**Date:** 2026-05-26  
**Production:** https://dlcfunds.vercel.app  
**Scope:** UI only — no auth, ACL backend, delete logic, schema, or Convex operator changes beyond existing mutations used from UI.

## 1. Dropdown / overlay opacity

### Root cause

Menus used `bg-popover`, `bg-background/92`, or `absolute` positioning inside clipped headers — semi-transparent panels and stacking context bleed.

### Fix

| Artifact | Role |
|----------|------|
| `lib/ui/layering.ts` | Canonical `Z_LAYER` tokens + `overlaySurfaceClass()` |
| `lib/ui/layerTokens.ts` | Shell map re-exports layering (backward compatible) |
| `components/ui/PortalOverlayPanel.tsx` | Body-portal opaque dropdowns |
| `app/globals.css` | `--dlc-z-*` CSS variables |

**Refactored surfaces:** `UserNotificationsBell` (Inbox), `GlobalSearchPalette`, `SnoozeMenu`, `Tooltip`, `IntakeEditor` export menu, hub modals (`hubRowActionPrimitives`), `ResponsiveNavProvider` auxiliary panel.

**Rules enforced:**

- Solid `bg-background` / `dlc-surface-overlay` on panels  
- Scrim blur only on backdrops, not menu bodies  
- Portal rendering for inbox dropdown  
- Z-index from `Z_LAYER` only  

## 2. Responsive header collision

| Change | Detail |
|--------|--------|
| `AppChrome` | Opaque header background; classic header `flex-nowrap` + `master-header-actions` cluster |
| `MobileTopNav` | 44px menu control; compact brand grid unchanged |
| `GlobalSearchPalette` | Mobile search icon 44px |
| `UserNotificationsBell` | 44px min touch target on mobile |

**Playwright:** `tests/e2e/phase15-step15-ui-stability.spec.ts` — viewport matrix 320→1440, overlap detection on header controls.

## 3. Loan file action parity

| Action | Component | ACL |
|--------|-----------|-----|
| Open | `hub-loan-open` | Always (row visible) |
| Rename | `hub-loan-edit` | `canEditFile`, not shared view |
| Duplicate | `hub-loan-duplicate` | Owner + edit |
| Share | `hub-loan-share` | Owner only |
| Delete | `hub-loan-delete` | Owner only |

**Files:** `HubHierarchyLoanRowActions.tsx`, `lib/pipeline/hubLoanFileActions.ts`, wired through `PipelineHubHierarchyView` → `PipelineHubProjectionView` / `PipelinePageClient`.

**Visual:** Same icon bar as client/project rows; visible on mobile; hover-reveal on desktop (`group/loan-row`).

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | _(session)_ |
| `npm run build` | _(session)_ |
| `npm run convex:deploy:prod` | _(session)_ |
| `npm run deploy:prod` | _(session)_ |
| `npm run auth:validate` | _(session)_ |
| `tests/e2e/phase15-step15-ui-stability.spec.ts` | Run with `PW_BASE_URL=https://dlcfunds.vercel.app` |

## STOP

Do not begin Phase 16 until Joshua certifies prod overlays, header matrix, and hub loan deletes on real rows.
