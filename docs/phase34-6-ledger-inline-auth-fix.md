# Phase 34.6 — Ledger inline payment `memberScope` patch (shipped)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior:** `docs/phase34-5-update-date-audit.md`

## Problem

Phase 34.4 added `...memberScope` (`memberUserKey`) to most `PaymentsRow` mutations, but **two** inline `payments.update` handlers were missed:

- Payment **date** (`InlineDate` `onCommit`)
- Payment **net** (`InlineNumber` `onCommit`)

Those calls hit `assertCanMutatePipelineRow` without the viewer key → `[CONVEX M(payments:update)] Server Error`.

## Fix (`app/ledger/page.tsx` — `PaymentsRow`)

| Handler | Before | After |
|---------|--------|-------|
| Date | `update({ id, date: next })` | `update({ id, date: next, ...memberScope })` |
| Net | `update({ id, net: next })` | `update({ id, net: next, ...memberScope })` |

### `PaymentsRow` mutation sweep (all include `...memberScope`)

| Mutation | Fields |
|----------|--------|
| `payments.create` | add form submit |
| `payments.update` | date, gross, net, method, paidBy, notes |
| `payments.remove` | delete payment button |

### `LedgerTableRow` — `ledger.setPayment` sweep

Also patched two 34.4 gaps on the main funding row:

- `monthlyAmount` inline commit
- `paidBy` inline commit

All other `setPayment` calls already had `memberScope`.

## Deploy

- Vercel production `dpl_3GmTypNGkqwNRYtYFBNMz1gYGBpi`

Production: https://dlcfunds.vercel.app

## Smoke

1. Expand a funded row → change an existing payment **date** → succeeds, payload includes `memberUserKey`.
2. Edit payment **net** inline → same.
3. Gross / method / notes / add / delete still work with `memberUserKey`.
