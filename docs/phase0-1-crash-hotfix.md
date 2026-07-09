# Phase 0.1 — Emergency Client-Side Exception Hotfix

**Date:** 2026-06-22  
**Status:** Shipped (Vercel production)  
**Symptom:** Fatal “Client-side exception has occurred” on app load  
**Root cause:** Missing `productKnowledge:*` functions on production Convex → `useQuery` threw during `HelpCenterPanel` render in global chrome

---

## Diagnosis

| Layer | Failure |
|-------|---------|
| Convex prod | `Could not find public function for 'productKnowledge:…'` |
| `useHelpArticles` | Used `useQuery`, which **throws** on server error (no static fallback) |
| `HelpCenterPanel` | Mounted globally via `HelpKnowledgeShellMount` in `AppChrome` |
| `ProductUpdatesBell` | Used `useQueries` (already tolerant) but unguarded in chrome |

Phase 0 rebrand (`lib/brandIdentity.ts`, `app/layout.tsx`) was audited — **no undefined references**; crash was Convex-related, not metadata.

---

## Fixes applied

### 1. Hook hardening — `useHelpArticles.ts`

- Replaced `useQuery` with `useQueries`
- On `Error` result → fall back to static `HELP_ARTICLES` (same as empty DB)
- Prevents throw during render; Help Center works offline from static seed

### 2. Silent error boundaries — `SilentFeatureErrorBoundary.tsx`

New utility: catches render errors, logs with `console.warn`, returns **`null`** (no UI disruption).

| Component | Wrapper |
|-----------|---------|
| `ProductUpdatesBell` | `ProductUpdatesBellSafe` in both `AppChrome` header layouts |
| `HelpCenterPanel` | `HelpKnowledgeShellMount` |

### 3. Mutation guard — `ProductUpdatesBell.tsx`

`markReleaseFeedRead` wrapped in `.catch()` so opening the panel does not reject when backend is missing.

---

## Files changed

- `lib/product-knowledge/useHelpArticles.ts`
- `components/SilentFeatureErrorBoundary.tsx` (new)
- `components/ProductUpdatesBell.tsx`
- `components/HelpKnowledgeShellMount.tsx`
- `components/AppChrome.tsx`

---

## Validation

```bash
cd lender-app
npm run build
npm run deploy:prod
```

**Expected after hotfix (before Convex deploy):**

- App loads without client crash
- Updates bell hidden if Convex still throws (boundary) or shows empty state
- Help (`?` / Help button) opens with **static** articles

**Expected after Convex deploy:**

```bash
npx convex deploy --prod --typecheck disable
npx convex run productKnowledge:listPublishedArticlesForViewer '{"memberUserKey":"<key>"}' --prod
```

- Updates bell + live help articles from Convex

---

## Remaining ops (manual — not Cursor)

Convex backend must be pushed from a machine with deploy access:

```bash
cd lender-app
npx convex deploy --prod --typecheck disable
```

If this fails, copy the **exact terminal error** for diagnosis (access, typecheck, schema push, etc.).

Settings → **Product knowledge → Seed platform content** after deploy if tables are empty.

---

## Production URL

https://dlcfunds.vercel.app
