# Collaboration architecture audit (Phase 8)

**Date:** 2026-05-07  
**Scope:** Convex data model, org RBAC, notifications, activity feeds, portal boundaries.

## Current data ownership & access

| Domain | Primary store | Org scope | Access mechanism |
|--------|---------------|-----------|------------------|
| Users / identity | `authUsers`, `authSessions`, JWT / `resolveMemberUserKey` | Via memberships | Session + optional JWT subject |
| Organizations | `organizations`, `organizationMembers`, `organizationRoles` | N/A | `assertOrgMember` / `assertOrgPermission` |
| Pipeline files | `pipeline`, `pipelineFileShares`, `pipelineFileActivity` | `organizationId`, `ownerUserKey`, shares | `organizationAccess` + RBAC (`files.view` / `files.edit` / `*_all`) |
| Tasks | `tasks` | Optional `organizationId` | Same org helpers + task mutations |
| Lenders | `lenders` | Optional `organizationId` | Org-scoped queries in mutations |
| Documents | `libraryDocuments`, `libraryDocumentLinks`, `taskAttachments` | Usually `organizationId` | Tenant indexes + permission checks in modules |
| Comments (deal room) | `fileMessages`, `fileMessageAttachments` | Per-file `organizationId` | `fileMessages` asserts read/mutate via pipeline |
| Notifications | `userNotifications`, `taskNotifications` | Implicit via `userKey` | Listing by user; no org index on row (recipient scoped) |
| Activity streams | `activityFeed` (scoped org/user), `contactActivity`, mirrors | Mixed | `activityFeed.list` enforces org permission |
| Audit / security | `clientPortalAudit`, `securityAuditLog`, `pipelineFileActivity` | Varies | Append-only; portal vs internal paths split |

## Single-user assumptions (legacy / risk)

- **`pipeline.assigneeId` / `sharedWithIds`:** free-form string IDs; not integrated with `organizationMembers` or the new `entityAssignments` engine.
- **Personal-scoped `activityFeed`:** `scopeKind: user` still valid for legacy rows; collaboration UX should prefer org-scoped feeds.
- **Notifications:** categories were narrow (four literals); cross-entity routing required extension.
- **Comments:** rich threading exists for **pipeline files** via `fileMessages`; other entities had no unified thread store until `collaborationThreads` / `collaborationComments`.

## Ownership bottlenecks

- Single `owner` mental model on pipeline (plus shares) vs multi-role **owner / assignee / watcher / reviewer / approver** — partially addressed by new `entityAssignments` (parallel to legacy assignee fields).
- File activity capped / high-volume `data_patch` excluded from global feed — structured `collaborationActivityEvents` allows policy-based retention without flooding UI.

## Missing relational links (prior to Phase 8)

- No durable **cross-entity assignment history** table (reassignment audit lived in task/file notifications only).
- No **org-scoped presence** with automatic expiry (now `memberPresence`).
- No **structured event** table with visibility class and delta payload for automation / compliance (now `collaborationActivityEvents`).

## Notification gaps (mitigated)

- Categories did not cover assignment lifecycle, comment bursts, document uploads, or status transitions — **extended** `userNotifications.category` and `notificationPreferences` with additive keys (defaults preserve prior behavior).
- No **snooze** on rows — `snoozedUntil` added; unread queries respect it.

## Real-time blind spots

- Prior feeds depended on manual mirrors (`mirrorPipelineActivityToFeed`, task/contact append helpers). New events can be written to `collaborationActivityEvents` and mirrored to `activityFeed` in one path (`insertCollaborationActivityEvent`).
- **Presence** was absent; heartbeats + cron purge close the loop.

## Permission escalation risks

- **`internal_admin` visibility** on activity events requires `settings.access` to read/list.
- **Direct recipient** visibility on events filters to listed `userKeys` only.
- **Comment @mentions** notify by raw string keys — callers must ensure keys map to real members in product UI (future: resolve display names / validate membership).

## Phase 8 additions (summary)

- `collaborationActivityEvents`, `memberPresence`, `entityAssignments`, `collaborationThreads`, `collaborationComments`
- Convex modules: `activityEvents`, `presence`, `assignments`, `comments`
- Lib: `lib/activity/eventTypes.ts`, `lib/workflows/assignmentRules.ts`, `lib/notifications/router.ts`, `lib/comms/*`, `lib/security/clientVisibility.ts`
- UI: `PresenceIndicators`, `ThreadPanel`, `ActivityTimeline`, `usePresence`
