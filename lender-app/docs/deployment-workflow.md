# Deployment workflow — Vercel CLI only (Git / GitHub disconnected)

Production hosting for the Next.js app is **Vercel**. Deployments are triggered with the **Vercel CLI** from your machine (or CI with tokens). **Do not use Git push** or any Git host for production updates.

## Status — Git disconnected (local + Vercel)

- **Vercel:** The linked project reports **no Git repository** connected (`vercel git disconnect` → “No Git repository connected”). If you ever reconnect a repo in the dashboard, run **`npx vercel@latest git disconnect --yes`** from `lender-app/` to remove it again.
- **Local repo:** **`git remote remove origin`** has been applied — there is **no GitHub remote**. Local history may still exist under `.git/` until you delete that folder; **`git push` / `git pull` to GitHub will not work** without adding a remote again.

## Phase 1 — Dashboard sanity check (optional)

If you use multiple Vercel projects or teams, confirm each production project: [Vercel Dashboard](https://vercel.com/dashboard) → **Settings → Git** shows **no connected repository** (or disconnect it).

Do **not** turn Git back on as a **deployment trigger** if you want CLI-only production.

## Phase 2 — Link the project and environment (local)

From `lender-app/`:

```bash
# Optional: use a pinned CLI without global install
npx vercel@latest login
npx vercel@latest link
```

- **`vercel link`** writes **`.vercel/`** (gitignored) with `orgId` and `projectId`.
- **Environment variables**: Vercel Dashboard → **Settings** → **Environment Variables**. Mirror values from `.env.local` where needed for **Production** (and **Preview** if you use preview deploys).

**Headless / CI:** set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, then run the same deploy command as locally.

### Convex (backend)

If you change anything under **`convex/`**, production clients expect an updated backend:

```bash
npm run convex:deploy:prod
```

This is separate from the Vercel deploy but often required in the same release.

## Phase 3 — Standard release commands (`lender-app/`)

After **every** software change that should reach users:

```bash
npm run build
```

Fix all TypeScript, ESLint, and build errors, then:

```bash
npm run deploy:prod
```

`deploy:prod` runs **`npm run build`** and then **`vercel deploy --prod --yes`**.

**Deploy only** (when you already ran a successful build):

```bash
npm run deploy:vercel
```

## Phase 4 — Verify production

After a successful CLI deploy:

1. Open the **production URL** from the CLI output or Vercel → **Deployments** → latest **Production**.
2. Smoke-check (logged-in):

   - Pipeline hub and **pipeline file** workspace (layout, scroll, no overlapping chrome).
   - **Tasks**, **Contacts**, **Lenders**.
   - **Mobile**: narrow viewport or real device — scroll, bottom nav, no horizontal bleed.
3. Browser **DevTools → Console**: no unexpected runtime errors on the pages above.

## Rollback

- **Vercel Dashboard** → **Deployments** → select a previous **Production** deployment → **Promote to Production** (or use the dashboard’s rollback action for your team’s workflow).
- Alternatively, **`vercel rollback`** (see [Vercel CLI — rollback](https://vercel.com/docs/cli/rollback)) if you use the CLI-promoted workflow CLI rollback (confirm against current Vercel docs for your plan).

## Environment variables

- **Source of truth:** Vercel project **Settings → Environment Variables**.
- After changing vars, **redeploy** production so new values apply (or use the dashboard redeploy).
- Never commit secrets; keep `.env.local` local and document required keys in internal runbooks only.

## Quick reference

| Goal | Command |
|------|---------|
| Typecheck only | `npx tsc --noEmit` |
| Production build | `npm run build` |
| Next.js + Vercel production | `npm run deploy:prod` |
| Vercel only (build already OK) | `npm run deploy:vercel` |
| Convex production | `npm run convex:deploy:prod` |

## Agent / automation note

Cursor rule **`.cursor/rules/vercel-direct-deploy.mdc`** requires completing **build**, **Convex when needed**, and **Vercel production deploy** before treating a change as fully shipped, unless the user explicitly asks for local-only work.
