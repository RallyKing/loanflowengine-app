# Phase 34.3 — `payments:create` payload audit (read-only)

**Date:** 2026-05-28  
**Status:** Forensic audit only — **no code changes**  
**Prior:** `docs/phase34-1-ledger-crash-audit.md`, `docs/phase34-2-ledger-fix.md`  
**Symptom (post-34.2):** Clicking **Add payment** still yields `[CONVEX M(payments:create)] Server Error` with valid-looking Gross/Net.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Are `draftGross` / `draftNet` sent as raw strings? | **No.** `validateAddPaymentAmounts` → `parseAddPaymentAmount` → `parseFloat` after strip; `create` receives **numbers**. |
| Wrong field names (`grossAmount`, `paymentDate`, `fileId`)? | **No.** Client uses `ledgerId`, `date`, `gross`, `net`, `method`, `paidBy`, `notes` — matches `payments.create` args. |
| Missing required Convex args? | **No** for `ledgerId` / `gross`. `fileId` / `clientId` are **not** part of `create` (server denormalizes `fileId` from parent ledger). |
| Convex **argument validator** mismatch? | **Unlikely** after 34.2 for a normal Add click with valid amounts. |
| Actual break (ranked) | **(1) Handler throw** — identity / ACL because **`memberUserKey` is omitted** on `create` while `ledger.list` passes `preferencesAccountId`. **(2) View-only pipeline share** — list is readable at `view`, mutate requires `edit`. **(3) Rare:** stale `ledgerId`, deleted parent file (org list usually hides those). |

**Conclusion:** The remaining Server Error is **not** explained by sending string amounts or wrong validator field names. Phase **34.4** should fix **mutation context** (`memberUserKey` aligned with `ledger.list`) and improve **error surfacing** (handler messages vs generic Server Error), not re-parse Gross/Net.

---

## 1. Backend — `convex/payments.ts` `create` mutation

### 1.1 Argument validator (`args`, lines 69–78)

| Field | Validator | Required | Notes |
|-------|-----------|----------|-------|
| `ledgerId` | `v.id("ledger")` | **yes** | Convex document id for `ledger` table |
| `date` | `v.optional(v.number())` | no | Unix **ms**; handler defaults to `Date.now()` |
| `gross` | `v.number()` | **yes** | Must be JSON number (not string) |
| `net` | `v.optional(v.number())` | no | Handler uses `args.net ?? args.gross` |
| `method` | `v.optional(v.string())` | no | Trimmed; empty → `undefined` on insert |
| `paidBy` | `v.optional(v.string())` | no | Same |
| `notes` | `v.optional(v.string())` | no | Same |
| `memberUserKey` | `v.optional(v.string())` | no | Used only in handler ACL (not stored on row) |

**Not accepted by `create`:** `fileId`, `clientId`, `paymentDate` (string), `grossAmount`, `netAmount`, `organizationId`.

Failures at this layer (before handler) surface as generic **Server Error** in the React client — typically `ArgumentValidationError` (wrong type, missing `gross`, extra fields).

### 1.2 Handler logic (lines 79–103)

| Step | Condition | Error message |
|------|-----------|---------------|
| Load ledger | `!parent` | `Ledger entry not found` |
| Load pipeline file | `!file` | `Pipeline file not found` |
| Mutate ACL | `assertCanMutatePipelineRow(ctx, file, args.memberUserKey)` | `You do not have permission to edit this pipeline file.` |
| Gross sanity | `!Number.isFinite(args.gross) \|\| args.gross < 0` | `gross must be a non-negative number` |
| Net sanity | `!Number.isFinite(net) \|\| net < 0` | `net must be a non-negative number` |
| Insert | explicit object | Schema-aligned; no extra fields |

Insert shape (lines 92–101) matches table schema; `fileId` comes from `parent.fileId`, not from client.

### 1.3 Table schema — `convex/schema.ts` (`payments`, ~1806–1819)

| Column | Type | Set by |
|--------|------|--------|
| `ledgerId` | `v.id("ledger")` | arg |
| `fileId` | `v.id("pipeline")` | parent ledger |
| `date` | `v.number()` | arg or `Date.now()` |
| `gross` | `v.number()` | arg |
| `net` | `v.number()` | arg or gross |
| `method`, `paidBy`, `notes` | optional strings | args |

---

## 2. Frontend — `app/ledger/page.tsx` `PaymentsRow`

### 2.1 Call site (`submitAddPayment`, lines 1853–1890)

```ts
await create({
  ledgerId: entry.ledger._id,
  date: dateMs,
  gross: amounts.gross,
  net: amounts.net,
  method: draftMethod || undefined,
  paidBy: draftPaidBy || undefined,
  notes: draftNotes || undefined,
});
```

### 2.2 Field-by-field trace

| Convex arg | Source | Type at wire | Matches validator? |
|------------|--------|--------------|-------------------|
| `ledgerId` | `entry.ledger._id` | `Id<"ledger">` | **Yes** |
| `date` | `draftDate` → `split("-")` → `new Date(y, mo-1, d).getTime()` or `Date.now()` | `number` | **Yes** (`type="date"` input) |
| `gross` | `validateAddPaymentAmounts(draftGross, …).gross` | `number` (> 0) | **Yes** |
| `net` | same helper; blank net → gross | `number` (≥ 0) | **Yes** (always sent; optional on server) |
| `method` | `draftMethod \|\| undefined` | `string \| omitted` | **Yes** |
| `paidBy` | `draftPaidBy \|\| undefined` | `string \| omitted` | **Yes** |
| `notes` | `draftNotes \|\| undefined` | `string \| omitted` | **Yes** |
| `memberUserKey` | — | **omitted** | Optional arg, but see §3 |

### 2.3 Parsing helpers (lines 1779–1798)

- `parseAddPaymentAmount`: strips `$`, `,`, spaces; `parseFloat`; returns `undefined` if non-finite.
- `validateAddPaymentAmounts`: blocks `create` when gross invalid; toast **"Please enter valid Gross and Net amounts."**
- **Strings never reach** `create` for `gross` / `net` on the guarded path.

### 2.4 List query vs mutation context (same page, lines 136–145 vs 1868–1876)

| Call | `memberUserKey` |
|------|-----------------|
| `api.ledger.list` | `preferencesAccountId` (via `orgListArgs`) |
| `api.payments.create` | **not passed** |
| `api.payments.update` / `remove` (inline rows) | **not passed** |
| `api.ledger.setPayment` (main row) | **not passed** |

---

## 3. Identified break — not a type mismatch on amounts

### 3.1 Primary: missing `memberUserKey` (identity skew)

**Mechanism**

- `ledger.list` resolves the viewer as `preferencesAccountId` and filters rows with `pipelineFileReadable(ctx, file, memberUserKey)` — any access level **except `none`** (includes **`view`**).
- `payments.create` calls `assertCanMutatePipelineRow(ctx, file, args.memberUserKey)` with `memberUserKey` **undefined**.
- With no Convex JWT, `resolveViewerKey` falls through to `platformUserKeyFallback()` (`APP_AUTH_USER_KEY`), **not** the same key as `preferencesAccountId` used to populate the ledger UI.

**Effect**

- User sees fundings they can **read** under their account key.
- Add payment runs ACL as the **platform fallback** user, who may be non-owner, view-only, or lacking edit share → handler throw → **Server Error**.
- This matches “button click with valid Gross/Net still fails” **without** any argument validator complaint.

**34.4 fix direction (not implemented here):** Pass `memberUserKey: preferencesAccountId` (or `useOrgConvexQueryArgs()` / `useActorUserKey()`) on `create`, `update`, `remove`, and `setPayment` from the ledger page — same pattern as `ledger.list`.

### 3.2 Secondary: view-only pipeline share

Even with correct `memberUserKey`:

- `pipelineFileReadable` → `level !== "none"` (view OK).
- `assertCanMutatePipelineRow` → requires `level === "edit"`.

Shared **view-only** users can expand payments and fill the form but cannot mutate → same handler error. UI should disable Add or show the permission message explicitly.

### 3.3 Ruled out for typical Add click (post-34.2)

| Hypothesis | Verdict |
|------------|---------|
| Raw string `gross` / `net` | Ruled out — parsed numbers only |
| Missing `fileId` / `clientId` on wire | N/A — not in mutation contract |
| `paymentDate` string vs `date` number | Ruled out — client sends `date` as ms |
| Wrong keys `grossAmount` / `netAmount` | Ruled out |
| Premature submit on Enter | Ruled out in 34.2 — explicit button only |

### 3.4 Edge cases (lower probability)

| Case | Handler error |
|------|----------------|
| Stale `ledgerId` | `Ledger entry not found` |
| Deleted pipeline row (legacy/non-org paths) | `Pipeline file not found` |
| Invalid `date` → `NaN` serialized as `null` | Possible **argument** failure on `date` (unlikely with `type="date"`) |

---

## 4. Convex logs — Request ID `0a53e1924f4681de`

Still not resolved in-repo. For this phase, classify the failure in dashboard logs:

| Log pattern | Interpretation |
|-------------|----------------|
| `ArgumentValidationError` + `gross` | Pre-34.2 premature submit or alternate client |
| `ArgumentValidationError` + `date` | Invalid date ms / null |
| `You do not have permission to edit this pipeline file` | ACL / missing or wrong `memberUserKey` or view-only share |
| `Pipeline file not found` | Orphan ledger row |
| `Ledger entry not found` | Stale id |

```bash
cd lender-app
npx convex logs --prod --history 500 --jsonl
# filter: payments:create OR 0a53e1924f4681de
```

---

## 5. Recommended fix phase (34.4) — scope preview

| Priority | Change |
|----------|--------|
| P0 | `PaymentsRow` + ledger row mutations: pass `memberUserKey: preferencesAccountId` (or shared hook) on `payments.create` / `update` / `remove` |
| P1 | Same for `setPayment` / `removeLedger` on ledger page for consistency |
| P2 | Disable Add payment when file access is view-only (if client can detect) or map handler error to toast copy |
| P3 | Optional: unwrap Convex `ConvexError` server message in `submitAddPayment` catch (34.2 already shows `err.message` when Error) |

---

## 6. Verification checklist (after 34.4)

1. Network tab on Add payment: payload includes `gross`/`net` as numbers **and** `memberUserKey` matching ledger list.
2. Owner account: create succeeds.
3. View-only share: clear “no permission” (not generic Server Error).
4. Convex log for new failures shows handler message, not `ArgumentValidationError`.

---

**Audit constraint honored:** No application code modified in Phase 34.3.
