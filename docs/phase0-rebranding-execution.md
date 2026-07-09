# Phase 0 — Rebranding & PWA Infrastructure Execution

**Date:** 2026-06-22  
**Status:** Shipped (Vercel production)  
**Product identity:** **Loan Flow Engine** (formerly Direct Lending Connection)

---

## 1. Pre-audit findings

| Artifact | Before | After |
|----------|--------|-------|
| `app/layout.tsx` metadata | "Direct Lending Connection" | `Loan Flow Engine` via `lib/brandIdentity.ts` |
| Web App Manifest | **Missing** (no `manifest.json`, no `app/manifest.ts`) | `app/manifest.ts` → served at `/manifest.webmanifest` |
| Favicon / touch icons | **Missing** (`public/` empty) | `app/icon.tsx`, `app/apple-icon.tsx`, `app/pwa-icon/[size]/route.tsx` |
| Service worker | **Missing** | `public/sw.js` + `PwaServiceWorkerRegistration` in root layout |
| `package.json` name | `direct-lending-connection` | Unchanged (npm internal; Vercel project already `loanflowengine`) |
| `vercel.json` | Not present | N/A — deploy uses CLI `--project loanflowengine` |

### User-visible "Direct Lending Connection" instances updated

- Root + route `metadata.title` (login, sign-up, settings, session-expired)
- `AppChrome`, `MobileTopNav`, `LoginForm` (header monogram **LFE**)
- `orgBrandingContext` default header title
- Help Center copy + static product-knowledge seed
- Browser push notification title (`UserNotificationsBell`)
- Client portal fallback labels (`convex/clientPortal.ts`, `clientPortalAdmin.ts`)
- E2E smoke heading matcher

### Intentionally unchanged

- npm package name (`direct-lending-connection`) — avoids lockfile/tooling churn
- Internal CSS token prefix `--dlc-*` — design-system namespace, not product name
- `convex/auth/globalAdminBootstrap.ts` org default name — existing tenant data
- Repo folder name "Lender List" on disk

---

## 2. Impact assessment (Next.js App Router + caching)

**Metadata (`layout.tsx`, per-route `metadata` exports)**  
Server-rendered into `<head>` on each request (or static at build for static routes). Browsers cache HTML lightly; tab title updates on next navigation or hard refresh.

**Manifest (`app/manifest.ts`)**  
Next.js generates `/manifest.webmanifest` at build time (static route). Browsers cache manifests aggressively — users may need to remove/re-add the home-screen icon to see a renamed install label.

**Icons (`app/icon.tsx`, `apple-icon.tsx`, PWA sizes)**  
Generated PNG routes; CDN-cacheable. Safe to deploy without schema migrations.

**Service worker (`public/sw.js`)**  
Network-only pass-through in Phase 0 (installability gate for Android Chrome). Registered only in production. After deploy, existing SW clients receive `skipWaiting` on next visit; no offline cache yet.

**Middleware**  
PWA assets (`/manifest.webmanifest`, `/icon`, `/apple-icon`, `/pwa-icon/*`, `/sw.js`) added to public prefixes so unauthenticated install crawlers can fetch them.

---

## 3. PWA configuration

| Field | Value |
|-------|--------|
| `name` / `short_name` | Loan Flow Engine |
| `theme_color` | `#034f35` (Deep Forest) |
| `background_color` | `#ffffff` |
| `display` | `standalone` |
| `start_url` | `/` |
| Icons | 32, 180, 192, 512 px (Deep Forest + **LFE** monogram) |

**Canonical source:** `lib/brandIdentity.ts`  
**Manifest:** `app/manifest.ts` (App Router; equivalent to `manifest.json`)

### iOS

- `appleWebApp.capable`, `apple-mobile-web-app-capable`, `appleWebApp.title`
- `viewport.themeColor` + `/apple-icon`

### Android

- Manifest + minimal service worker for install prompt eligibility

---

## 4. Manual admin reminder

**Vercel project display name** (if still showing legacy branding in the dashboard):

1. [Vercel Dashboard](https://vercel.com) → project **loanflowengine**
2. Settings → General → Project Name → confirm **Loan Flow Engine** (optional cosmetic)

Production URL alias is already `https://dlcfunds.vercel.app`.

**Convex backend:** Portal label strings in `clientPortal.ts` / `clientPortalAdmin.ts` require `npm run convex:deploy:prod` to reach production Convex.

---

## 5. Validation commands

From `lender-app/`:

```bash
# Compile + typecheck + lint (manifest/icons included)
npm run build

# Full governance gate (optional before ship)
npm run qa:governance

# Production deploy
npm run deploy:prod
```

**Post-deploy smoke:**

1. Browser tab title → **Loan Flow Engine**
2. DevTools → Application → Manifest → name / icons / theme_color
3. Mobile Safari → Share → Add to Home Screen → label **Loan Flow Engine**
4. Android Chrome → Install app prompt (after SW registers)

---

## 6. Files added / touched

**Added**

- `lib/brandIdentity.ts` — canonical product name + PWA colors
- `lib/pwaIconImage.tsx` — shared icon mark
- `app/manifest.ts`
- `app/icon.tsx`, `app/apple-icon.tsx`
- `app/pwa-icon/[size]/route.tsx`
- `public/sw.js`
- `components/PwaServiceWorkerRegistration.tsx`

**Updated**

- `app/layout.tsx`, `middleware.ts`
- Auth/settings route metadata pages
- `AppChrome`, `MobileTopNav`, `LoginForm`, help/notifications UI
- `lib/orgBrandingContext.tsx`, `lib/helpCenterContent.ts`, static seed
- `convex/clientPortal.ts`, `convex/clientPortalAdmin.ts`
- `tests/e2e/smoke.spec.ts`

---

## 7. Help Center note

Product Knowledge articles seeded before this rebrand may still say "Direct Lending Connection" in Convex until re-seeded or edited in **Settings → Product knowledge**. Static help fallback and new seed payloads use **Loan Flow Engine**.
