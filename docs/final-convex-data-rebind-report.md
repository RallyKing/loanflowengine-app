# Final Convex data rebind report

_Generated: 2026-05-10T05:13:52.437Z_

**Convex deployment:** `https://basic-anaconda-984.convex.cloud`

## Operator actions

- **Dry run:** only (no writes)
- **Surface pipeline (clear archive/snooze):** no
- **Mutation:** `migrations/rebindJoshuaExplicitGraph:rebindExplicitGraph`

## Schema recovery note

If `convex/schema.ts` was reverted from local history, this workspace may have been repaired by re-adding native `authUsers` / `dataMigration*` / `organizationPermissions` / nav tables required by the current codebase. **Deploy this schema** before relying on parity with production.

## dryRun: true (plan)

```json
{
  "activityFeed": {
    "patched": 0
  },
  "authUserDefaultOrgPatched": false,
  "canonicalAuthUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
  "contactActivity": {
    "patched": 0
  },
  "contacts": {
    "found": 14,
    "missing": [],
    "patchedOrgOrEmailKey": 0,
    "skippedDuplicateEmail": []
  },
  "dryRun": true,
  "expandedCounts": {
    "contacts": 14,
    "lenders": 7,
    "pipelines": 8
  },
  "fileMessages": {
    "patched": 0
  },
  "lenderAttachments": {
    "patched": 0
  },
  "lenders": {
    "found": 7,
    "missing": [],
    "patchedOrg": 0
  },
  "libraryDocumentLinks": {
    "patched": 0
  },
  "libraryDocumentVersions": {
    "patched": 0
  },
  "libraryDocuments": {
    "patched": 0
  },
  "membershipInserted": false,
  "notifications": {
    "task": 0,
    "user": 0
  },
  "ok": true,
  "organizationId": "mx76bxqnc23q76cb99tvrffmy58644pf",
  "pipelines": {
    "found": 8,
    "missing": [],
    "patched": 0,
    "surfaceFieldsCleared": 0
  },
  "targetEmail": "joshua@directlendingconnection.com",
  "tasks": {
    "patched": 0
  }
}
```





## Visibility rationale (code-traced)

- Pipeline list uses `filterPipelineRowsForMember` in `convex/organizationAccess.ts`: non–view-all members only see files with empty `ownerUserKey`, `ownerUserKey === memberUserKey`, or an explicit `pipelineFileShares` row. This migration sets `ownerUserKey` to the canonical `authUsers` id and `organizationId` to `mx76bxqnc23q76cb99tvrffmy58644pf` for the expanded graph.
- Contacts list is scoped by `organizationId` (`convex/contacts.ts`).

## Manual verification

1. Log in as `joshua@directlendingconnection.com` (case-insensitive).
2. Confirm pipeline files, contacts, lenders, tasks, ledger, activity, and search for the named deals.

