# Phase 25.10 — Contacts Editor Null Reference Crash Fix

## Problem

After Phase 25.9, clicking **+ New** on `/contacts` and typing could crash the page with:

`TypeError: Cannot read properties of null (reading 'value')`

`ConvexQueryBoundary` then showed **"Could not load contacts"** even though the list query was fine — a **render-time** failure, not Convex validation.

There is **no Zod / React Hook Form** on the Contacts page.

## Root causes

1. **Unsanitized draft** — `draftFromDoc` could pass `null`/`undefined` string fields into controlled inputs; `contactRoleIds` could be `null` passed to `new Set(value)` in the multi-select.
2. **Legacy / dirty role data** — `contactRoleIds` entries shaped like `{ value: "client" }` caused unsafe `.value` reads when coerced incorrectly.
3. **Stored contact methods** — `emails[].email` or `phones[].number` null in DB made `.trim()` throw during hydration into the editor.

## Fix

### `normalizeDraft()` (`app/contacts/page.tsx`)

- All strings default to `""`; arrays default to `[]`.
- `contactRoleIds` run through `sanitizeContactRoleIds`.
- `patchDraft()` always merges via `normalizeDraft`.
- Render uses memoized `editorDraft` for controlled fields.

### `sanitizeContactRoleIds()` (`lib/contact/contactRoles.ts`)

- Accepts strings or legacy `{ value: string }` objects; never returns null/empty without defaulting to `client`.

### `ContactRoleMultiSelect`

- Sanitizes `value` before building the selected set; skips null catalog roles.

### `ContactMethodsEditor` + `resolveContactEmails` / `resolveContactPhones`

- Optional chaining on event targets; `?? ""` on controlled `value` props; null-safe `.trim()` when reading stored rows.

## Verification

1. `/contacts` → **New** → type name, company, notes; toggle roles; add email → no crash.
2. Save creates contact and list refreshes.
3. `npm run build` from `lender-app/`.

## Deploy

```bash
cd lender-app
npm run deploy:prod
```
