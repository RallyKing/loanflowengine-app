# Navigation customization

This document describes the **user-controlled navigation management system**: preferences, cloud sync, organization policy, responsive merging, and where to extend it.

## Concepts

| Concept | Purpose |
|---------|---------|
| **Catalog** | Canonical routes in `lib/navigation/navigationCatalog.ts` (ids, hrefs, icons, groups). |
| **User config** | Per-account row in Convex `navigationUserConfig` + browser cache `dlc-nav-config-v2`. |
| **Org policy** | Optional `organizationNavigationPolicy` — enforced visible / org-wide hidden ids. |
| **Responsive registry** | `buildResponsiveNavRegistry()` merges config + **RBAC** + org policy + **recency** (device-local). |

## User capabilities (NavManager)

The settings surface is **`NavManager`** (`components/navigation/NavManager.tsx`), which re-exports the full editor UI.

Users can:

- **Reorder** primary items (drag-and-drop).
- **Hide/show** items (respecting preset locks and org “force visible”).
- **Pin favorites** (sort to the top within primary nav).
- **Quick actions** — shortcuts from catalog routes; rendered in the SaaS sidebar under “Quick actions”.
- **Compact / expanded** sidebar density (`navLayoutMode`).
- **Persistence mode** — `syncScope: cloud | device` (device-only skips cloud upsert for navigation JSON).

**Preview** chips in settings use the same merge as production (permissions + org policy), without mounting a second app shell.

**Reset to defaults** restores code defaults (not remote overwrite until you save in cloud mode).

## APIs & modules

| Module | Role |
|--------|------|
| `NavigationConfigProvider` | React state, localStorage, Convex hydration, recency bumps on route change, exposes `resolvedItems` / `resolvedQuickActions`. |
| `ResponsiveNavProvider` | Viewport shell tiering (separate from catalog merge). |
| `responsiveNavRegistry.ts` | `buildResponsiveNavRegistry()` — single merge helper for primary + shortcuts. |
| `navigationResolve.ts` | Types, `resolveVisibleNavItems`, `resolveQuickActions`, presets. |
| `navPermissionMap.ts` | Maps catalog ids → minimum `OrgPermission`. |
| `navRecency.ts` | Device-local visit counts; inflates recent items in ordering. |
| `navPreferences.ts` | Storage key / default-mode constants. |

## Persistence

| Store | Content |
|-------|---------|
| Convex **`navigationUserConfig`** | `preset`, `overrides`, `quickActions`, `syncScope`, `navLayoutMode` (`formatVersion` 2). |
| **`localStorage` `dlc-nav-config-v2`** | Mirror + immediate offline edits; legacy `dlc-nav-config-v1` is still read once for migration. |
| **`sessionStorage` / local** | Recency map `dlc-nav-recency-v1` (not cloud). |

**Device-only mode:** `syncScope === "device"` — local blob wins; remote hydrate only adjusts `preset` when the server differs (see `NavigationConfigProvider`).

## Cloud sync

- **`persistRemote`** calls `navigationUserConfig.upsert` with extended args (quick actions + layout + sync scope metadata).
- Skipped when `syncScope === "device"`.

## Organization policy

- Table **`organizationNavigationPolicy`** (`convex/schema.ts`).
- **`getOrgNavigationPolicy`** — read for any client with org context.
- **`upsertOrgNavigationPolicy`** — requires **`org.roles.manage`** (`assertOrgPermission`).
- **Force visible** — users cannot hide those catalog ids.
- **Hide org-wide** — ids removed for all members regardless of personal overrides.

## Role-based visibility

1. **Navigation preset** (`admin` / `analyst` / `viewer`) hides template sets (e.g. viewer + documents).
2. **`navPermissionMap`** — entries without granted org permission are dropped from `resolvedItems` / allowed quick actions when permissions have loaded.
3. **Org policy** enforced hidden set applied after catalog iteration.

If `grantedPermissions` is still loading, the provider skips RBAC filtering briefly to avoid an empty shell flash (`NavigationConfigProvider` passes `null` until effective permissions resolve — consumers treat `null` as “skip filter” in `resolveVisibleNavItems`).

## Responsive behavior

Shell layout (mobile bar, tablet hybrid, rail) is **`ResponsiveNavProvider`** + `useResponsiveNavLayout`. Catalog merge is independent so the **same ids** appear/disappear based on width + policy + RBAC.

Reserved: `buildResponsiveNavRegistry({ disabledCatalogIds })` for future **org plan / feature** gating.

## Admin / compliance

- Org admins with `org.roles.manage` edit **Organization policy** inside NavManager.
- **Enforced visible** supports “must show Tasks / Pipeline” style rollouts.

## Operational notes

- Quick action `href` must be internal (`/`…, not `//…`) — validated server-side shapes and client `isSafeQuickActionHref`.
- After schema changes run **`npx convex codegen`** and **`npm run build`** in `lender-app/`.
- Production deploy: follow `docs/ai-development-rules.md` smoke checklist (navigation + mobile scroll).
