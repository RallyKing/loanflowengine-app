# Phase 13.2 — Ownership + sharing identity polish

**Status:** Complete (production deployed)  
**Date:** 2026-05-21

## Goal

Make resource ownership and sharing obvious everywhere using **canonical usernames** (never org ids, tenant shell names, or truncated user keys on user-facing surfaces).

## Canonical presentation

| Viewer context | Line | Badge |
|----------------|------|-------|
| Owner | `Owned by {username}` | Owner |
| Shared (view) | `Shared by {username}` | Shared View |
| Shared (edit) | `Shared by {username}` | Shared Edit |
| Org-visible, not shared | `Owned by {owner username}` | (none) |

Usernames resolve via `resolveDisplayUsernameForUserKey` (`convex/auth/displayIdentity.ts`).

## Backend

- **`convex/resourceOwnershipPresentation.ts`** — `buildPipelineOwnershipPresentation`, `buildTaskOwnershipPresentation`, `collaboratorsForResource`, share notification helpers, queries `forPipelineFile` / `forTask`.
- **Enriched list APIs:** `pipeline.listTablePreview` (`ownership`), `tasks.getAll` (`ownership`), `pipeline.getDetail` (`ownership`), `globalSearch.search` (`ownershipLine`, `ownershipBadge`), `sharedWorkspace.listFeed` (`ownershipLine`, `ownershipBadge`).
- **Share mutations:** `pipelineFileShares`, `taskShares` — human activity summaries, `dispatchUserNotification` with actor username (`assignment_change` category), feed mirror uses real `actorUserKey` (not `__system__`).
- **Activity:** `appendPipelineFileActivity` passes actor to `mirrorPipelineActivityToFeed` without persisting `actorUserKey` on `pipelineFileActivity` rows (schema-safe).
- **Notifications:** `listUnreadForUser` adds `actorDisplayUsername`.

## UI components

- `components/ownership/ResourceOwnershipBadge.tsx`
- `components/ownership/ResourceOwnershipLine.tsx`
- `components/ownership/ResourceAccessDetails.tsx` — tap/click disclosure (owner, your access, collaborator list)

Wired into: tasks list, task drawer, pipeline table/board/mobile cards, file workspace header, `/shared`, global search, notification inbox.

## Validation (this phase)

From `lender-app/`:

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | Pass |
| `npm run build` | Pass |
| `npm run convex:deploy:prod` | Pass — `https://basic-anaconda-984.convex.cloud` |
| `npm run deploy:prod` | Pass — **https://dlcfunds.vercel.app** (`dpl_D61wizazfGJQAV4TNSfLEsi3NTjy`) |
| `npm run auth:validate` | Pass |
| `npx tsx scripts/run-phase13-step2-ownership-polish-proof.ts` | Pass |

Evidence: `migration-reports/phase13-step2-ownership-polish.json`

## Live proof summary

Operator `operator/ownershipPolishStep13_2:runOwnershipPolishProof`:

- Joshua sees **Owner** + `Owned by joshua@directlendingconnection.com` on owned file/task.
- Eballard sees **Shared View** + `Shared by joshua@directlendingconnection.com` after share.
- Badge upgrades to **Shared Edit** when permission upgraded.
- Activity summary example: `joshua@directlendingconnection.com shared this file with joshuaeballard@gmail.com (view access)` — no org label.

## Manual smoke (recommended)

1. Joshua: pipeline table, board, file header — owner line + Owner badge.
2. Share file with Eballard (view) → Eballard: `/shared`, search, file workspace — Shared by Joshua + Shared View.
3. Upgrade to edit → badge flips to Shared Edit; notification mentions Joshua by username.
4. Activity feed (`/activity`) — share lines show usernames.

## Out of scope

- Phase 13.3+ work
- Changing org/session `organizationName` in settings (still used for org chrome; not resource ownership labels)
