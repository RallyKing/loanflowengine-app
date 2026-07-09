# Phase 34.5 — `payments:update` inline date audit (read-only)

**Date:** 2026-05-28  
**Status:** Forensic audit only — **no code changes**  
**Prior:** `docs/phase34-4-ledger-auth-fix.md`  
**Symptom:** `[CONVEX M(payments:update)] Server Error` when changing an **existing** payment date via the inline editor on `/ledger`.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Backend field name / type for date? | **`date: v.optional(v.number())`** — Unix **milliseconds** (not `paymentDate`, not string, not `Date` object). |
| Does `InlineDate` send the wrong type? | **No.** `fromInputValue` → `new Date(y, m-1, d).getTime()` → `onCommit` receives **`number \| null`**. Handler only runs when `next !== null`, so wire payload is **`date: number`**. |
| Convex args validator mismatch on date? | **Unlikely** for a normal calendar pick. |
| Root cause of Server Error | **Incomplete Phase 34.4 patch:** the **payment date** `payments.update` call **omits `...memberScope`** (`memberUserKey`). Server ACL uses `platformUserKeyFallback()` → `assertCanMutatePipelineRow` throws (same class of failure as pre-34.4 `payments:create`). |
| Related gap | **Payment net** inline update at the same site also omits `memberScope` (date + net only; gross/method/paidBy/notes include it). |

**Conclusion:** This is **not** a date-type or `paymentDate` naming mismatch. Phase **34.6** should add `...memberScope` to the **date** and **net** `update` handlers in `PaymentsRow` (and re-smoke all inline payment edits).

---

## 1. Backend — `convex/payments.ts` `update` mutation

### 1.1 Args validator (lines 110–120)

| Field | Validator | Required on patch |
|-------|-----------|-------------------|
| `id` | `v.id("payments")` | **yes** |
| `date` | `v.optional(v.number())` | no — patch only when provided |
| `gross` | `v.optional(v.number())` | no |
| `net` | `v.optional(v.number())` | no |
| `method` | `v.optional(v.union(v.string(), v.null()))` | no |
| `paidBy` | `v.optional(v.union(v.string(), v.null()))` | no |
| `notes` | `v.optional(v.union(v.string(), v.null()))` | no |
| `memberUserKey` | `v.optional(v.string())` | no — used for ACL only |

**Not accepted:** `paymentDate`, ISO date strings, `Date` objects, `fileId`, `ledgerId`.

### 1.2 Handler — `date` branch (lines 131–133)

```ts
if (rest.date !== undefined) {
  patch.date = rest.date;
}
```

- No `Number.isFinite` check on `date` (unlike `gross` / `net`).
- **`null` is not in the validator** for `date` — client must not send `date: null` (ledger UI guards this; see §2.3).
- If `date` were `NaN`, JSON serialization could become `null` and fail **argument validation** before the handler; normal `type="date"` input paths produce finite ms.

### 1.3 ACL (lines 125–129)

1. `assertCanAccessFile(ctx, row.fileId, memberUserKey)` — read gate  
2. `assertCanMutatePipelineRow(ctx, file, memberUserKey)` — **edit** required  

Without `memberUserKey`, cookie-auth sessions resolve the actor via **`platformUserKeyFallback()`**, not `preferencesAccountId` from `ledger.list` → permission error → generic **Server Error** on the client.

### 1.4 Table schema — `payments.date` (`convex/schema.ts` ~1810)

- `date: v.number()` — required on stored rows; updates patch this column with a number.

---

## 2. Frontend — `app/ledger/page.tsx` `PaymentsRow`

### 2.1 Inline date handler (lines 2022–2030)

```tsx
<InlineDate
  value={p.date}
  onCommit={async (next) => {
    if (next === null) return;
    await update({ id: p._id, date: next });
  }}
  ariaLabel="Edit payment date"
  format={fmtDate}
/>
```

| Payload field | Value | Matches `update` args? |
|---------------|-------|-------------------------|
| `id` | `p._id` | yes |
| `date` | `next` (`number`, Unix ms) | yes |
| `memberUserKey` | **omitted** | optional arg missing → **ACL skew** |

### 2.2 `InlineDate` commit pipeline (`components/inline/InlineDate.tsx`)

1. User picks a date on `<input type="date">`.
2. `fromInputValue(s)` → `parseInt` Y/M/D → `new Date(y, m-1, d).getTime()` → **`number | null`**.
3. `trySave` → `commit(parsed, (n) => onCommit(n))`.
4. **Not** a native `Date` object on the wire.

Clear control calls `onCommit(null)`; ledger handler **`if (next === null) return`** — no mutation (correct: backend does not accept clearing `date` via `null`).

### 2.3 Phase 34.4 `memberScope` coverage in `PaymentsRow`

| Inline field | `update` / `remove` includes `...memberScope`? |
|--------------|-----------------------------------------------|
| **Date** | **No** — `await update({ id: p._id, date: next })` only |
| Gross | **Yes** |
| **Net** | **No** — `await update({ id: p._id, net: next })` only |
| Method | Yes |
| Paid by | Yes |
| Notes | Yes |
| Delete payment | Yes (`remove`) |
| Add payment (`create`) | Yes |

Phase 34.4 intended all payment mutations to pass `memberUserKey`; **date and net inline handlers were not updated** (likely oversight when patching adjacent lines).

### 2.4 Why users notice **date** first

- Date commits on **every** `onChange` of the date input (`InlineDate` line 126: `void trySave(e.target.value)`), so a single pick immediately fires `payments:update`.
- Gross/net use `InlineNumber` (**blur** / Enter), which may be edited less often; gross **does** include `memberScope`, so gross edits may succeed while date edits fail for the same user.

---

## 3. Root-cause classification

### Primary — **H1: Missing `memberUserKey` on date `update` (handler ACL)**

- Matches 34.3 / 34.4 diagnosis for `payments:create`.
- Explains Server Error with a **valid numeric `date`** in the Convex dashboard payload.
- **Fix (34.6):** `await update({ id: p._id, date: next, ...memberScope });`  
  Also fix **net** handler the same way.

### Ruled out — **H2: Date sent as `Date` object or string**

- `InlineDate` contract and implementation use **number ms** only.

### Ruled out — **H3: Wrong field name (`paymentDate`)**

- Client sends `date`; backend expects `date`.

### Low probability — **H4: `date: NaN` / invalid ms**

- Unusual with HTML `type="date"`; would fail at Convex args layer, not ACL.
- Backend could harden with `Number.isFinite` on `rest.date` in a later phase.

### Secondary — **H5: View-only user**

- 34.4 disables add form and uses `ResourceAccessProvider` for read-only; if read-only provider fails open, user could still trigger update — but missing `memberScope` affects **all** editors regardless of share level.

---

## 4. Convex logs — what to look for

```bash
cd lender-app
npx convex logs --prod --history 300 --jsonl
# filter: payments:update
```

| Log message | Interpretation |
|-------------|----------------|
| `You do not have permission to edit this pipeline file.` | Missing / wrong `memberUserKey` (expected for H1) |
| `ArgumentValidationError` … `date` | Non-number or null date on wire |
| `Payment not found` | Stale `id` |

---

## 5. Recommended fix phase (34.6) — preview only

| Priority | File | Change |
|----------|------|--------|
| P0 | `app/ledger/page.tsx` | Add `...memberScope` to payment **date** and **net** `update` calls (~2026, ~2062) |
| P1 | `convex/payments.ts` | Optional: `Number.isFinite(rest.date)` before patch (defense in depth) |
| P2 | Audit | Grep all `api.payments.update` call sites for consistent `memberUserKey` |

---

## 6. Verification checklist (after 34.6)

1. Change existing payment date → one `payments:update` with `{ id, date: <number>, memberUserKey: <accountId> }`.
2. Change payment net → same `memberUserKey` present.
3. View-only row: inline date does not fire mutation (read-only).
4. No `[CONVEX M(payments:update)] Server Error` for editor-owned fundings.

---

**Audit constraint honored:** No application code modified in Phase 34.5.
