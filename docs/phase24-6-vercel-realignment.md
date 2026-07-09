# Phase 24.6 — Vercel project realignment (loanflowengine)

**Date:** 2026-05-29  
**Problem:** `npm run deploy:prod` deployed to **`lender-app`** (`lender-app-zeta.vercel.app`) via stale `.vercel/project.json`, not **`loanflowengine`** (custom domain **paperworkprocessing.com** / legacy `dlcfunds.vercel.app`).

## Root cause

| Artifact | Was | Should be |
|----------|-----|-----------|
| `lender-app/.vercel/project.json` | `projectName: "lender-app"` | `loanflowengine` |
| `deploy:prod` | `vercel deploy --prod --yes` (linked project) | `--project loanflowengine` |
| Stakeholder URL | lender-app-zeta.vercel.app | paperworkprocessing.com |

Phase 21 documented the same split; `deploy:prod:dlc` already targeted `loanflowengine` but agents used `deploy:prod`.

## Actions taken

1. **Deleted** `lender-app/.vercel/` (stale link to `prj_Vm5VpbYLPIqVg9QRPGl4zOoy5527` / `lender-app`).
2. **Updated** `package.json`:
   - `deploy:prod` → `npx vercel@latest deploy --prod --yes --project loanflowengine`
   - `deploy:vercel` → same project flag
   - `deploy:prod:dlc` → alias of `deploy:prod`
3. **Interactive relink:** `npx vercel --prod` from `lender-app/` (user completes prompts → `loanflowengine`).

## Verification

After relink, confirm:

```json
// lender-app/.vercel/project.json
{ "projectName": "loanflowengine", ... }
```

Production smoke on **https://paperworkprocessing.com** (or latest `loanflowengine` deployment URL from Vercel dashboard).

## Going forward

Always use `npm run deploy:prod` — it now hard-targets `loanflowengine` regardless of local link state.
