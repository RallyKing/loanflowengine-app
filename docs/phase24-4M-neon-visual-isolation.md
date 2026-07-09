# Phase 24.4M — Neon Visual Isolation & Global Duplicate Audit

**Date:** 2026-05-28  
**Goal:** Prove whether the moving bottom chrome is **DLC `MobileBottomNav`** or **native Safari/Chrome toolbars**.

---

## Step 1 — Global duplicate & shadow audit

| Candidate | `aria-label` | On `/pipeline` hub? | Verdict |
|-----------|--------------|---------------------|---------|
| **`components/MobileBottomNav.tsx`** | `Primary` | Yes (via `AppChrome`) | **Canonical** — only app tab bar |
| `components/layout/MobileBottomNav.tsx` | — | Re-export only | Alias, not duplicate |
| `SaasSidebar.tsx` | `Primary navigation` | Drawer (fixed left), not bottom tabs | Different element |
| `PipelineMobileWorkspaceOpsRail.tsx` | `Workspace shortcuts` | **File workspace only** (`/pipeline/[fileId]`) | Not hub nav |
| `OperationalBatchBar` | Batch actions region | Only when rows selected | Not primary nav |
| Legacy `MobileNav.tsx` / `MobileBottomNavOld.tsx` | — | **Not found** | — |

**Conclusion:** One `MobileBottomNav` instance per layout branch (saas/classic); never conditionally unmounted from `AppChrome`. Neon paint applies only to `nav[aria-label="Primary"][data-dlc-component="MobileBottomNav"]`.

---

## Step 2 — Neon tracking controls

When `PHASE_24_4M_NEON_NAV_ISOLATION` is true on `/pipeline`:

- Background: `#bc34fa !important` (inline + CSS)
- Top border: `6px solid #facc15`
- Banner: **⚠️ CODE LOCK ACTIVE ⚠️**
- `data-dlc-component="MobileBottomNav"` for audits

---

## Step 3 — Cache busting

- `scripts/with-git-sha.mjs` now sets `NEXT_PUBLIC_DLC_BUILD_TIME` (ISO timestamp) on every build/deploy
- `AppChrome` root wrapper: `data-dlc-build-sha`, `data-dlc-build-time`, `data-phase-24-4m-neon`
- Console: `window.__DLC_BUILD_INFO__` (existing inline script in `app/layout.tsx`)
- **No service worker** in this app — use Incognito / hard refresh

Verify build on device:

```js
document.querySelector("[data-dlc-app-chrome-root]")?.dataset.dlcBuildSha
document.querySelector("[data-dlc-app-chrome-root]")?.dataset.dlcBuildTime
window.__DLC_BUILD_INFO__
```

---

## How to read the test (phone)

1. Incognito tab → https://lender-app-zeta.vercel.app/pipeline  
2. Hard refresh if needed  
3. Fast scroll up/down  

| What you see | Meaning |
|--------------|---------|
| **Neon purple + yellow bar disappears** on scroll | DLC nav or parent is still transforming/hiding — CSS/JS override |
| **Neon bar frozen**; separate white/gray bar moves underneath | **Native browser toolbar** (not our nav) |
| **No neon at all** | Stale cache — check `dlcBuildTime` / use Incognito |

---

## Revert

Set `PHASE_24_4M_NEON_NAV_ISOLATION` to `false` in `phase24-4M-neon-nav-isolation.ts`.

---

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_DkaP7rEfNjksjrY7qrsm17ZD4nX2` (build time `2026-05-29T15:57:36.015Z`)
