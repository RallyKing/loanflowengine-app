# Phase 34.1 — Ledger payments Gross/Net crash audit (read-only)

**Date:** 2026-05-28  
**Status:** Architectural / forensic audit only — **no code shipped**  
**Reported symptom:** Server Error on `payments:create` when typing in Gross or Net on `/ledger`  
**Reported Request ID:** `0a53e1924f4681de` (not present in repo logs; verify in Convex dashboard)

---

## Executive summary

| Finding | Detail |
|--------|--------|
| **Field names** | API uses `gross` and `net`, not `grossAmount` / `netAmount`. |
| **`payments:create` while typing** | **No** autosave or per-keystroke mutation. `create` runs only from the add-payment `<form onSubmit={addPayment}>`. |
| **Likely user path to `create`** | Enter key or “Add payment” submit while focus is in Gross/Net draft fields — not `onChange` alone. |
| **Other Gross/Net on same page** | Main row “Expected” amounts call **`ledger.setPayment`**; existing receipt rows call **`payments.update`** on blur — neither calls `create`. |
| **No `PaymentForm.tsx`** | All UI lives in `lender-app/app/ledger/page.tsx` (`PaymentsRow`, ~1777–2092). |
| **Zod** | Not used on payments; validation is **Convex `v.*` args** + handler `Number.isFinite` checks. |

Without pulling Convex logs for Request ID `0a53e1924f4681de`, the highest-probability failure classes are **(A) Convex argument validation before the handler** or **(B) handler throws** (auth / missing ledger / non-finite gross). A prior production pattern (`tasks:create` + schema extra field) does **not** apply here — `payments` insert uses an explicit, schema-aligned object.

---

## 1. Mutation audit — `convex/payments.ts`

### 1.1 `create` (lines 68–104)

**Args validator (runs before handler — failures surface as generic Server Error on client):**

```ts
gross: v.number(),           // required
net: v.optional(v.number()), // optional
```

- No integer-only constraint; floats are valid.
- No `grossAmount` / `netAmount` args — wrong names fail as **missing required `gross`** or extra fields.
- **Rejected before handler:** `undefined`, `null`, `NaN` (JSON-serialized as `null`), strings, objects for `gross` / `net`.
- Partial typing strings are **never sent to the server** from the add form unless the form is submitted and client parsing produces a number.

**Handler validation (lines 79–91):**

| Line | Logic |
|------|--------|
| 80–84 | Parent ledger + pipeline file must exist; `assertCanMutatePipelineRow` (permission). |
| 85–87 | `gross`: `Number.isFinite(args.gross) && args.gross >= 0` else `throw new Error("gross must be a non-negative number")`. |
| 88–91 | `net = args.net ?? args.gross`; same finite / non-negative check for `net`. |
| 92–101 | `ctx.db.insert("payments", { ledgerId, fileId, date, gross, net, method?, paidBy?, notes? })`. |

**Insert shape matches schema** (`gross` / `net` required numbers on `payments` table). No spread of unknown owner fields (contrast with historical `tasks:create` issue).

### 1.2 `update` (lines 110–161)

Used by **inline** Gross/Net on existing payment rows (not create).

- `gross` / `net`: `v.optional(v.number())` — same pre-handler type rules.
- Handler lines 134–144 mirror create finite / non-negative checks when those fields are present.
- Uses `assertCanAccessFile` then `assertCanMutatePipelineRow` (lines 125–128).

### 1.3 Related: `ledger.setPayment` (`convex/ledger.ts` 150–227)

Main ledger table **Expected (net)** / **gross** sub-line (not `payments:create`):

- Args: `gross: v.optional(v.number())`, `net: v.optional(v.number())`.
- Same handler-style checks at lines 183–193.

---

## 2. Schema — `convex/schema.ts` (payments table, ~1806–1819)

| Column | Validator | Required on insert |
|--------|-----------|-------------------|
| `ledgerId` | `v.id("ledger")` | yes |
| `fileId` | `v.id("pipeline")` | yes (denormalized) |
| `date` | `v.number()` | yes |
| `gross` | `v.number()` | yes |
| `net` | `v.number()` | yes (handler always sets `net` from arg or gross) |
| `method`, `paidBy`, `notes` | optional strings | no |

No defaults at schema level. No string or union types for amounts. **Mismatch with UI strings only matters if the client calls a mutation with unvalidated values** (see §3).

---

## 3. Frontend audit — `app/ledger/page.tsx`

There is **no** `components/ledger/PaymentForm.tsx`. Payment UX is implemented in **`PaymentsRow`** (expanded ledger row).

### 3.1 Three different Gross/Net surfaces on `/ledger`

| UI location | Component | Local state | Server mutation | When it fires |
|-------------|-----------|-------------|-----------------|---------------|
| **A. Expected totals** (main row) | `InlineNumber` on `ledger.net` / `ledger.gross` | `InlineNumber` draft while editing | **`api.ledger.setPayment`** | **Blur** or Enter in inline editor (`InlineNumber.trySave`) |
| **B. Existing receipts** (expanded sub-table) | `InlineNumber` on `p.gross` / `p.net` | same | **`api.payments.update`** | **Blur** or Enter |
| **C. Add payment** (dashed form at bottom) | plain `<Input inputMode="decimal">` | `draftGross` / `draftNet` strings | **`api.payments.create`** | **Form submit only** (`onSubmit={addPayment}`) |

If the Convex dashboard shows **`payments:create`**, the user action almost certainly involves surface **C** (or a mis-tagged log — confirm via Request ID payload).

### 3.2 Add-payment form — no typing-time mutation (surface C)

**File:** `PaymentsRow`, lines 1787–1796 (state), 2009–2087 (form), 1805–1841 (`addPayment`).

| Input | Handler | Server call on change? |
|-------|---------|------------------------|
| Gross | `onChange={(e) => setDraftGross(e.target.value)}` | **No** |
| Net | `onChange={(e) => setDraftNet(e.target.value)}` | **No** |

**Submit path (`addPayment`, lines 1805–1841):**

1. `parseFloat(draftGross.replace(/[$,\s]/g, ""))` — empty / `"."` / non-numeric → `NaN`.
2. Client guard: `!Number.isFinite(grossNum) || grossNum <= 0` → **local** `setAddError`, **return** (no `create`).
3. `netNum = draftNet ? parseFloat(...) : grossNum`; same finite / ≥ 0 check for net.
4. Only then: `await create({ ledgerId, date, gross: grossNum, net: netNum, ... })`.

**Implication:** Keystrokes alone do not invoke `payments:create`. **Enter inside the form** does invoke `addPayment` (native `<form>` behavior) — that can feel like “as soon as I type” if the user presses Enter after one or two characters.

**Example:** `draftGross = "5"` + Enter → `grossNum = 5` → `create` runs (success or server error), not a partial-string validator crash.

### 3.3 Inline editors — blur autosave, not create (surfaces A & B)

**`components/inline/InlineNumber.tsx`**

- `onChange` → updates local `draft` only (lines 122–125).
- **`onBlur` → `trySave()`** (line 126) → parses with `parseMoneyInput` (default) or custom parser.
- If parse fails (`undefined` / `null` / non-finite): **returns without calling `onCommit`** (lines 95–97) — **no network request**.
- If parse succeeds: calls `onCommit` → ledger `setPayment` or `payments.update`.

Payment row gross/net use `clearable={false}` (lines 1919, 1935), so empty blur restores without sending `null`.

**Conclusion:** Inline Gross/Net cannot trigger `payments:create`; they trigger **`payments.update`** only after a successful parse on blur/Enter.

### 3.4 `memberUserKey` omission

`api.ledger.list` passes `memberUserKey: preferencesAccountId` (page ~140).  
**All** `create` / `update` / `remove` / `setPayment` calls from `PaymentsRow` and `LedgerTableRow` **omit** `memberUserKey`.

Server falls back to JWT subject / `platformUserKeyFallback()` (`organizationAccess.resolveMemberUserKey`). This is inconsistent but usually not the crash unless identity is broken — would throw in handler (e.g. permission), not on partial numeric input.

---

## 4. Mapping Request ID `0a53e1924f4681de` to code paths

Repo does not contain this request ID. To attribute it precisely:

```bash
cd lender-app
npx convex logs --prod --history 500 --jsonl
# filter for 0a53e1924f4681de or payments:create
```

| Log signal | Likely cause | Code location |
|------------|--------------|---------------|
| `ArgumentValidationError` / missing `gross` | Client sent non-number or wrong field names | `payments.ts` args 72–73 |
| `ArgumentValidationError` / `net` invalid | Explicit `net: null` or string | args 73 |
| `Error: gross must be a non-negative number` | Finite check failed (should not happen if args validator passed unless NaN slipped through) | handler 85–87 |
| `Error: Ledger entry not found` | Stale `ledgerId` | handler 80–81 |
| `Error: You do not have permission…` | `assertCanMutatePipelineRow` | handler 84 |
| Schema insert error on `payments` | Unexpected (insert is explicit) | handler 92–101 |

---

## 5. Root-cause hypotheses (ranked)

### H1 — Form submit mistaken for “on typing” (most likely for `payments:create`)

User focuses Gross/Net in **add-payment** form and presses **Enter** → `addPayment` runs.  
If values pass client parsing, `create` runs immediately. Errors show as `[CONVEX M(payments:create)] Server Error` in the client.

**Not caused by:** partial string in Convex validators during typing (no request is sent on `onChange`).

### H2 — Convex argument validation on submit (invalid payload)

If a bug or alternate client ever called `create` with:

- missing `gross`,
- `gross: null` / string,
- wrong keys (`grossAmount`),

failure occurs **at lines 68–78 (args)** before handler business logic — generic **Server Error** in UI.

Current `addPayment` prevents NaN from reaching the wire; **no current code path sends partial strings**.

### H3 — User reports `create` but stack is `payments:update` or `ledger:setPayment`

Editing **existing** payment Gross/Net → `payments.update` on blur.  
Editing **expected** column Gross/Net → `ledger.setPayment`.  
Confirm mutation name in dashboard for Request ID `0a53e1924f4681de`.

### H4 — Permission / parent row (handler throw)

`assertCanMutatePipelineRow` at line 84 — independent of numeric typing; would also fail on intentional Add click.

---

## 6. Files to touch in a fix phase (34.2+)

| Priority | File | Likely change |
|----------|------|----------------|
| P0 | `app/ledger/page.tsx` | Prevent accidental submit (Enter) on draft Gross/Net until valid; optional `type="button"` on non-submit controls; pass `memberUserKey`; clearer error surfacing |
| P1 | `convex/payments.ts` | Optional: accept omitted `net` only (already does); friendlier `ArgumentValidationError` mapping is client-side |
| P2 | `components/inline/InlineNumber.tsx` | Only if blur-on-invalid should show inline error (already blocks commit) |

---

## 7. Verification checklist (post-fix)

1. Expand ledger row → type in **add** Gross/Net without Enter → **no** Convex request (network tab).
2. Press Enter with empty Gross → local validation only, no `payments:create`.
3. Press Enter with `100` in Gross → single `payments:create` with `{ gross: 100, net: 100 }` (if Net blank).
4. Edit existing payment inline → blur with `50k` → `payments.update` once, not `create`.
5. Edit expected net on main row → `ledger.setPayment`, not `payments:create`.
6. Reconcile Request ID `0a53e1924f4681de` in Convex logs with payload `gross` / `net` types.

---

## 8. Related docs

- `docs/tasks-create-failure-report.md` — example of schema insert vs args validation and Request ID forensics
- `docs/phase33-*` — unrelated tasks UI work

---

**Audit constraint honored:** No application code modified in Phase 34.1.
