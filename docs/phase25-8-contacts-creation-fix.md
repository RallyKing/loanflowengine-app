# Phase 25.8 — Contacts Mutation Hardening & Type Bridge

## Problem

After Phase 25.7b (`contactRoleIds` array on master contacts), some clients still sent only legacy `contactRoleId` (string) or empty arrays. That caused Convex argument/validation mismatches and the Contacts page **"Could not load contacts"** error after create.

## Solution

### Shared bridge (`lib/contact/contactRoles.ts`)

- **`coalesceContactRoleIdsFromArgs`** — merges `contactRoleIds[]` and/or `contactRoleId` into one raw id list (trimmed, deduped).
- **`contactRoleIdsMutationPayload`** — builds `{ contactRoleIds, contactRoleId }` for mutations (never empty; defaults to `client`).

### Backend (`convex/contacts.ts`)

- **`create` / `update`** — coalesce args before org resolution and DB write; always persist both `contactRoleIds` and mirrored `contactRoleId`.
- **`normalizeContactForClient`** (used by **`list`** and **`get`**) — bridge dirty rows: `contactRoleIds ?? (contactRoleId ? [contactRoleId] : [])`, then legacy inference if still empty.
- **`contactMatchesRoleFilter`** — strict filter checks stored `contactRoleIds` array, not only single `contactRoleId`.

### Frontend

- **Contacts page** — `onSave` uses `contactRoleIdsMutationPayload(draft.contactRoleIds)`.
- **Pipeline file workspace** — create-and-link sends `contactRoleIds: [contactRoleId]` alongside legacy `contactRoleId`.

## Verification

1. Create contact on `/contacts` with one or multiple roles — list reloads without error.
2. Create-and-link contact on pipeline file with Referral Partner role — succeeds; hub sees partner after link.
3. `npm run build` from `lender-app/`.

## Deploy

```bash
cd lender-app
npm run convex:deploy:prod
npm run deploy:prod
```
