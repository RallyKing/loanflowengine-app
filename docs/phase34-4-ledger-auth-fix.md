# Phase 34.4 — Ledger payment auth & view-only guards (shipped)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior:** `docs/phase34-3-payload-audit.md`

## Problem

`payments:create` (and related mutations) omitted `memberUserKey`. With cookie auth and no Convex JWT, the server resolved the actor via `platformUserKeyFallback()` instead of `preferencesAccountId` used by `ledger.list`. `assertCanMutatePipelineRow` then failed → generic `[CONVEX M(payments:create)] Server Error`.

View-only shared users could see ledger rows (`pipelineFileReadable`) but not mutate (`edit` required).

## Fix

### 1. `memberUserKey` on all ledger/payment mutations (`app/ledger/page.tsx`)

- `ledgerMemberScope(preferencesAccountId)` → `{ memberUserKey }` passed as `memberScope` to `LedgerTableRow` and `PaymentsRow`.
- Spread `...memberScope` on:
  - `payments.create`, `payments.update`, `payments.remove`
  - `ledger.setPayment` (every inline commit)
  - `ledger.remove`, `ledger.createFor`

Same key as `api.ledger.list` / `api.pipeline.listLight` (`orgListArgs.memberUserKey`).

### 2. `canEditFile` from backend (`convex/ledger.ts`)

`ledger.list` now returns `canEditFile: boolean` per row:

- `true` when `resolveOrgPipelineFileAccessLevel(...) === "edit"`
- `false` when file missing or access is `view` / `none`

Type mirrored in `lib/export/ledgerExport.ts` (`LedgerExportRow`).

### 3. View-only UI guards

- `ResourceAccessProvider` on each `LedgerTableRow` (read-only inline editors when `!canEditFile`).
- Add-payment form: `disabled` on date, gross, net, method, paid by, notes, **Add payment** button.
- Placeholders **"View only"**; `title` / tooltips use `VIEW_ONLY_ACCESS_TOOLTIP` ("View only access").
- Delete ledger / delete payment buttons disabled when view-only.
- `submitAddPayment` returns early if `!canEditFile`.

## Deploy

- Convex: `npx convex deploy --yes` (includes `ledger.list` + `canEditFile`)
- Convex: `https://basic-anaconda-984.convex.cloud`
- Vercel production `dpl_HYbXHAKFKMA1b7jSYXL57Vk7Nwg8`

Production: https://dlcfunds.vercel.app

## Smoke

1. Editor account: expand funding → valid gross/net → **Add payment** succeeds (no Server Error).
2. Network payload includes `memberUserKey` matching session `accountId`.
3. View-only share: gross/net/add fields disabled; tooltips show view-only; no mutation fired.
4. Expected gross/net inline edits respect read-only provider on view-only rows.
