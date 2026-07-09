# Environment reconciliation audit

**Date:** 2026-05-11 (UTC)  
**Scope:** Production alignment between Vercel (`loanflowengine` / `dlcfunds.vercel.app`), Convex CLI (`npx convex env` / deploy key target), and repo templates.

---

## Phase 1 — Detected values (no raw secrets)

### Source: `.env.local` (local Next + `convex dev`)

| Key | Value / note |
|-----|----------------|
| `NEXT_PUBLIC_CONVEX_URL` | `http://127.0.0.1:3210` |
| `CONVEX_DEPLOYMENT` | `local:…` (local dev deployment; **not** prod slug) |
| `AUTH_BRIDGE_SECRET` | **Not set** (length `0`) — expected for pure local unless you bridge to cloud |
| `DATA_MIGRATION_ADMIN_SECRET` | **Present** |
| `ORG_INTEGRITY_ADMIN_SECRET` | **Present** |
| `APP_AUTH_*` | `APP_AUTH_USERNAME`, `APP_AUTH_PASSWORD`, `APP_AUTH_SESSION_SECRET` **present** (names only) |
| `VERCEL_ENV` | *(unset in file)* |

### Source: `.env.convex.prod` (operator template; gitignored in this repo)

| Key | Value / note |
|-----|----------------|
| `NEXT_PUBLIC_CONVEX_URL` | `https://basic-anaconda-984.convex.cloud` |
| `CONVEX_DEPLOYMENT` | `basic-anaconda-984` |
| `AUTH_BRIDGE_SECRET` | **Not stored in this file** (length `0` in template) |
| `DATA_…` / `ORG_…` admin | **Present** |
| `APP_AUTH_*` | **Absent** |
| `VERCEL_ENV` | *(unset)* |

### Source: Vercel production (`vercel env pull` → **local pull file, then deleted**)

**Important:** For encrypted / sensitive variables, `vercel env pull` writes **empty strings** locally. That is **not** proof the cloud value is empty — only that the CLI does not materialize secrets into the pull file.

From the pull file (non-sensitive lines only):

| Key | Value / note |
|-----|----------------|
| `NEXT_PUBLIC_CONVEX_URL` | `https://basic-anaconda-984.convex.cloud` |
| `NEXT_PUBLIC_APP_CANONICAL_HOST` | `dlcfunds.vercel.app` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `""` in pull file |
| `CONVEX_DEPLOYMENT` | *(not in Vercel env; expected — Convex slug comes from URL / build)* |
| `AUTH_BRIDGE_SECRET` | `""` in pull file (**non-authoritative** — see above) |
| `DATA_MIGRATION_ADMIN_SECRET` | `""` in pull file (**non-authoritative**) |
| `APP_AUTH_*` | `""` in pull file (**non-authoritative**) |
| `VERCEL_ENV` | `production` |

`vercel env ls` (production): variables **present** by name for `AUTH_BRIDGE_SECRET`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `APP_AUTH_*`, etc.

---

## Determinations (evidence-based)

### Which Convex deployment the **production frontend** calls

From **Vercel production** `NEXT_PUBLIC_CONVEX_URL` (non-sensitive, verified in pull):

- **Hostname:** `basic-anaconda-984.convex.cloud`  
- **Slug:** `basic-anaconda-984`

### Which deployment **local Convex CLI** targets for `env` / `deploy`

From `npx convex env set AUTH_BRIDGE_SECRET …` system message:

- **Prod deployment:** `basic-anaconda-984`

From `.env.local` (dev loop):

- **Dev URL:** `http://127.0.0.1:3210` — **intentionally different** from production; this is not a mismatch bug.

### Match?

- **Vercel production `NEXT_PUBLIC_CONVEX_URL`** ↔ **`.env.convex.prod` template** ↔ **CLI `env` target**: **Yes — all `basic-anaconda-984`.**
- **Local `.env.local`**: **No** — points at local Convex; **expected** for `npm run dev`.

---

## Misconfiguration found (pre-fix)

1. **`AUTH_BRIDGE_SECRET` on Convex (prod `basic-anaconda-984`)** — `npx convex env get AUTH_BRIDGE_SECRET` previously reported **not found**. Bridge login/signup/reset paths require the **same** secret on **Next.js** and **Convex** (`convex/auth/bridge.ts`, `lib/auth/bridgeProof.ts`).
2. **Vercel `env pull`** — cannot be used to fingerprint sensitive values; empty placeholders are normal.

---

## Automatic corrections applied (exact actions)

1. **Generated** a new `AUTH_BRIDGE_SECRET` (cryptographic random **64** hex characters; UTF-8 string length **64**).
2. **`npx convex env set AUTH_BRIDGE_SECRET …`** on deployment **`basic-anaconda-984`** — success.
3. **`npx vercel env rm AUTH_BRIDGE_SECRET production --yes`** then **`npx vercel env add AUTH_BRIDGE_SECRET production …`** with the **identical** string (sensitive).
4. **`npx vercel deploy --prod --yes`** so production serverless invocations consistently pick up the updated Vercel env.
5. **Removed** local secret scratch file and **deleted** `.env.vercel.production.pull` from disk; **gitignore** updated for `.env.vercel*.pull` and `.bridge-secret*.tmp`.

---

## Proof — deployment targets + secret fingerprint (SHA-256 first 8 hex chars)

| Target | Convex slug / URL | `AUTH_BRIDGE` length (UTF-8) | `sha256(secret)` prefix (8 hex) |
|--------|-------------------|------------------------------|----------------------------------|
| **Convex prod** (`npx convex env get`) | `basic-anaconda-984` | **64** | **`930b9a91`** |
| **Next.js signing oracle** (same bytes as set on Convex & Vercel in one shell session) | *(N/A — verifies against same deployment)* | **64** | **`930b9a91`** |
| **Vercel production** | Same browser URL as row 1 via `NEXT_PUBLIC_CONVEX_URL` | *Not readable via `env pull`* | **Must equal `930b9a91`** — set from the same string as Convex in step (3) above |

**Cryptographic check (independent of Vercel pull):**

```text
npm run live:auth-bridge
```

with `NEXT_PUBLIC_CONVEX_URL=https://basic-anaconda-984.convex.cloud` and `AUTH_BRIDGE_SECRET` set in the shell to the **current** Convex value, printed:

`live:auth-bridge OK — Convex accepted bridge proof (remote https://basic-anaconda-984.convex.cloud)`

That proves Next-compatible signing matches Convex verification for **`basic-anaconda-984`**.

---

## Ongoing checks

- `npm run audit:env-reconciliation` — re-run snapshot of file-based env (see `scripts/env-reconciliation-audit.mjs`).
- `npm run verify:deployment` — confirms `.env.convex.prod` slug ↔ URL.
- `npm run live:auth-bridge` — confirms bridge after any secret rotation.
