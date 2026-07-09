# Phase 34.2 — Ledger add-payment input hardening (shipped)

**Date:** 2026-05-28  
**Status:** Shipped  
**Prior:** `docs/phase34-1-ledger-crash-audit.md`

## Problem

Users saw `[CONVEX M(payments:create)] Server Error` when working in the **Add payment** Gross/Net fields. Phase 34.1 found the root cause: **Enter** in a `<form>` submitted `addPayment` before amounts were complete, sending invalid or empty payloads to Convex.

## Fix (`lender-app/app/ledger/page.tsx` — `PaymentsRow`)

### 1. Submit control

- Form `onSubmit` now only `e.preventDefault()` — no implicit submit.
- **Add payment** button is `type="button"` with `onClick={() => void submitAddPayment()}`.
- `payments:create` runs only from that explicit click.

### 2. Enter key field advance

`advanceAddPaymentFieldOnEnter` on each add-form field:

| Field | Enter moves focus to |
|-------|----------------------|
| Date | Gross |
| Gross | Net |
| Net | Method |
| Method | Paid by |
| Paid by | Notes |
| Notes | Add payment button |

Enter no longer triggers form submission.

### 3. Validation guard

- `validateAddPaymentAmounts(draftGross, draftNet)`:
  - **Gross** required, finite, &gt; 0.
  - **Net** optional; blank defaults to gross; if present must be finite and ≥ 0.
- On failure: `showOperationalToast` with **"Please enter valid Gross and Net amounts."** (destructive), inline `addError`, **no** `create` call.
- On server error after valid submit: toast with mutation message.

### Backend (`convex/payments.ts`)

No changes. Handler lines 85–91 remain the second line of defense for non-finite amounts.

## Convex logs — Request ID `0a53e1924f4681de`

CLI query attempted:

```bash
npx convex logs --prod --history 300 --jsonl | grep -E '0a53e1924f4681de|payments:create'
```

The stream did not return matching lines within the session window (log tail may be outside history or require dashboard lookup). **Recommend:** Convex dashboard → Logs → filter `0a53e1924f4681de` to confirm whether the failure was `ArgumentValidationError` (missing/invalid `gross`) vs handler throw.

## Deploy

- `npm run build` — passed
- Vercel production `dpl_DgfWGpdAryY9P4kk4eUwDFJX9qYt`

Production: https://dlcfunds.vercel.app

## Smoke

1. Expand ledger row → Add payment form.
2. Type in **Gross** and press **Enter** → focus moves to **Net** (no Convex request).
3. Press **Enter** on empty Gross → toast + no mutation.
4. Enter valid gross, click **Add payment** → single `payments:create` with numeric `gross` / `net`.
