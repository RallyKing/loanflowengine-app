# Phase 16 Step 3 — Event shell CRUD + collaborative sharing

**Status:** PASS — production certified  
**Date:** 2026-05-27  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud  
**Evidence:** `migration-reports/phase16-step3-event-collaboration.json`

---

## Summary

First user-facing **Events** release on the Phase 16 schema foundation:

- **Navigation:** Events in sidebar (below Tasks) → `/events`
- **Tabs:** Events | Ideas + Invitations (`?tab=inbox`)
- **Owner-scoped ACL** via `resourceShares` + `collaboratorRole` (`co_owner`, `editor`, `viewer`)
- **Single subscription** per route: `events.listWorkspace`, `events.getDetailBundle`
- **Collaboration drawer:** share, pending email invites, transfer ownership, activity feed
- **Permission banners:** view (gray), edit (green), co-owner (soft blue), owner (none)

---

## Backend modules

| Module | Role |
|--------|------|
| `convex/events/events.ts` | CRUD, list workspace, detail bundle, sections/items |
| `convex/events/eventShares.ts` | Share/revoke/transfer + pending invites |
| `convex/events/eventPermissions.ts` | ACL assertions + viewer presentation |
| `convex/events/eventAccess.ts` | Share upsert + row filtering |
| `convex/operator/eventCollaborationStep16_3.ts` | Production proof |

### Schema additions (additive)

- `events`: `eventType`, `location`, `coverStorageId`, `tags`, `pinnedAt`, `searchText`
- `eventSectionItems`: `parentItemId` (nested checklist prep)
- `eventSharePendingInvites`, `eventShellActivity`

---

## Permission matrix (enforced)

| Action | Owner | Co-owner | Editor | Viewer |
|--------|:-----:|:--------:|:------:|:------:|
| View | ✓ | ✓ | ✓ | ✓ |
| Edit content | ✓ | ✓ | ✓ | — |
| Share / revoke | ✓ | ✓ | — | — |
| Transfer ownership | ✓ | — | — | — |
| Delete event | ✓ | — | — | — |
| Manage collaborators UI | ✓ | ✓ | — | — |

---

## Production proof matrix

| Check | Result |
|-------|--------|
| owner sees event | PASS |
| viewer blocked before share | PASS |
| viewer sees shared event | PASS |
| viewer cannot edit | PASS |
| editor can edit content | PASS |
| co-owner can manage collaborators | PASS |
| idea conversion + lineage | PASS |
| invitation conversion | PASS |
| ownership transfer | PASS |
| revoke removes access instantly | PASS |
| no org leakage | PASS |

**Harness:** `npm run cert:phase16-3-event-collaboration`

---

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | PASS |
| `npm run build` | PASS |
| `npm run convex:deploy:prod` | PASS |
| `npm run deploy:prod` | PASS → https://dlcfunds.vercel.app |
| `npm run cert:phase16-3-event-collaboration` | PASS |
| `npm run auth:validate` | Failed (script `page.goto` empty URL — pre-existing env) |

---

## UI routes

| Route | Purpose |
|-------|---------|
| `/events` | List + inbox tabs |
| `/events/[eventId]` | Event detail, sections, sharing drawer |

---

## Explicit non-goals (STOP)

- Calendar projections (Step 7)
- Print engine (Step 8)
- Task promote from items (Step 9)
- Step 4+ certification harness

**Do not start Step 4** until operator reviews prod Events UX on mobile + desktop.

---

## Smoke checklist (manual)

1. https://dlcfunds.vercel.app/events — create event, verify 13 default sections  
2. Share to second account as viewer → read-only banner + disabled controls  
3. Upgrade to editor → green edit banner  
4. Co-owner → blue banner + share panel  
5. Ideas tab → convert to event → lineage in `eventConversionHistory`  
6. Mobile: no horizontal overflow on list or detail
