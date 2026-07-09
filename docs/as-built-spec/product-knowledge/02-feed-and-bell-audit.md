# Phase 2 — Product feed & second bell audit

**Date:** 2026-06-22

---

## Scope

- `AppChrome.tsx` — header action order, SaaS vs Classic, pipeline file minimal chrome
- `UserNotificationsBell.tsx` — operational inbox pattern (PortalOverlayPanel, DROPDOWN layer)
- `layering.ts` — z-index tiers
- `schema.ts` — no product knowledge tables (pre-Phase 2)
- `settingsRegistry.ts` — admin section pattern
- `lib/product-knowledge/types.ts` — target shapes

---

## Current behavior (pre-Phase 2)

| Item | State |
|------|--------|
| Operational bell | `UserNotificationsBell` — Convex `userNotifications`, label "Alerts", Bell icon |
| Product updates bell | **Absent** |
| Convex product tables | **Absent** |
| Help data source | Static `helpCenterContent.ts` only |
| Read receipts | **Absent** |
| Admin publish UI | **Absent** |
| Visibility by org plan/role | **Absent** |

**Header order (SaaS):** Search → Help → Theme → Settings → Live → **Alerts** → User  
**Header order (Classic):** Search → Help → Theme → **Alerts** → Nav → Live → User  
**Pipeline file workspace (SaaS):** No header — bells not shown; overlays still mount at AppChrome root.

---

## Target (Phase 2)

- Tables: `productKnowledgeArticles`, `productReleasePosts`, `productKnowledgeDrafts`, `productReleaseReadReceipts`
- `ProductUpdatesBell` — Sparkles icon, adjacent to alerts bell, separate unread logic
- Help panel: Convex articles with static fallback
- Settings: global-admin Product Knowledge admin (seed + publish posts)
- Visibility: optional `orgPlans` / `orgRoles` on rows

---

## Risks

| Risk | Mitigation |
|------|------------|
| UX confusion with two bells | Distinct icon + label "Updates"; tooltips |
| Merging with userNotifications | Separate tables and components |
| Empty feed on fresh deploy | Admin seed mutation + static help fallback |
| Scroll regression | Portal overlay dropdown, not new scroll owner |

---

## Audit sign-off

**Ready to implement:** yes
