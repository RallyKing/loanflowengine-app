# Phase 25.9 — Main Contacts Page Form Validation Fix

## Problem

After Phase 25.8, `contacts.create` worked from the pipeline file drawer but **New contact** on `/contacts` appeared broken. There is **no Zod / React Hook Form** on this page — the failure was React state lifecycle, not schema validation.

## Root cause

`ContactsPageInner` had a `useEffect` that:

1. Called `setDraft(emptyDraft())` whenever `selectedId === "new"` on **every** dependency change (including list `loading` flipping), wiping in-progress form input before save.
2. Cleared `selectedId` when `selectedDoc` was missing and `!loading` — which ran immediately after a successful create, before the reactive `contacts.list` result included the new row (or when a **role filter** hid the new contact).

## Fix (`app/contacts/page.tsx`)

1. **Draft reset** — only reset to `emptyDraft()` when transitioning *into* `"new"` (track previous `selectedId` with a ref), not on every re-render.
2. **Post-create selection** — `pendingSelectIdRef` keeps the new id selected until `selectedDoc` resolves from list or `contacts.get`.
3. **`contacts.get` fallback** — hydrate the editor when the contact exists but is not yet in the filtered list payload.
4. **Save hardening** — require `organizationId` + `memberUserKey`; `try/catch` with `saveError` banner; omit empty `emails`/`phones` arrays from the mutation payload.
5. **Role filter UX** — banner when the saved contact is hidden by the active role filter.

## Verification

1. `/contacts` → **New** → enter name, select multiple roles → **Save** → contact stays open and appears in list (with “All roles” filter).
2. With a narrow role filter, create a contact with a different role → save succeeds; banner explains list filter.
3. `npm run build` from `lender-app/`.

## Deploy

```bash
cd lender-app
npm run deploy:prod
```
