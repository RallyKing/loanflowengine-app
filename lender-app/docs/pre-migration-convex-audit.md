# Pre-migration Convex audit (primary account consolidation)

_Generated: 2026-05-10T03:42:56.185Z_

**Deployment URL:** https://basic-anaconda-984.convex.cloud

## integrityAudit

```json
{
  "authUsersWithoutMembership": [],
  "authUsersWithoutMembershipCount": 0,
  "clerkPrefixedUserKeyHits": [],
  "clerkPrefixedUserKeyHitsCount": 0,
  "generatedAt": 1778384576341,
  "joshua": {
    "authUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
    "defaultOrganizationId": "mx76bxqnc23q76cb99tvrffmy58644pf",
    "email": "joshua@directlendingconnection.com",
    "found": true,
    "isGlobalAdmin": true,
    "organizationMemberships": [
      {
        "organizationId": "mx76bxqnc23q76cb99tvrffmy58644pf",
        "organizationMemberId": "ms7dmsax573trmy44c3b59wmc1864twd"
      },
      {
        "organizationId": "mx77ssc8sjpgwapfehx8yhz5kd86epd3",
        "organizationMemberId": "ms787c0a956wegznmkr9z32afd86e0e5"
      }
    ],
    "systemRole": "SUPER_ADMIN"
  },
  "migrationScan": {
    "counts": {
      "danglingOrganizationIds": 0,
      "duplicateMembershipGroups": 0,
      "invalidForeignKeys": 0,
      "legacyExternalOrgScopeHits": 0,
      "legacyExternalUserKeyHits": 0,
      "malformedOrgScopeIds": 0,
      "orphanedAuthSessions": 0,
      "orphanedOrganizationMembers": 0,
      "staleAuthSessions": 0
    },
    "danglingOrganizationIdsSample": [],
    "duplicateMembershipGroupsCount": 0,
    "invalidForeignKeysSample": [],
    "legacyExternalOrgScopeHitsSample": [],
    "legacyExternalOrgScopeHitsTotal": 0,
    "legacyExternalUserKeyHitsSample": [],
    "legacyExternalUserKeyHitsTotal": 0,
    "malformedOrgScopeIdsSample": [],
    "orphanedAuthSessionIdsSample": [],
    "orphanedOrganizationMemberIdsSample": [],
    "truncatedTables": []
  },
  "note": "Legacy vendor user export files are not stored in this repo; compare `tableCounts` to your export row counts manually.",
  "scanLimitPerTable": 200000,
  "tableCounts": {
    "authSessions": 0,
    "authUsers": 1,
    "contacts": 14,
    "intakeSheets": 2,
    "lenders": 737,
    "organizationMembers": 2,
    "organizations": 2,
    "pipeline": 8,
    "userOnboarding": 1,
    "userPreferences": 1
  }
}
```

## planAccountOwnershipMigration

```json
{
  "canonicalAuthUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
  "destinationUserKey": "ts719yfyv2b6020avvctpw0ns586exm6",
  "duplicateAuthUsersToMerge": [],
  "keysByClass": {
    "anonymous": 0,
    "clerk": 0,
    "legacy_vendor": 0,
    "other_auth": 0
  },
  "keysDiscoveredDistinctForeign": 0,
  "keysSample": [],
  "matchedAuthUsers": [
    {
      "_id": "ts719yfyv2b6020avvctpw0ns586exm6",
      "createdAt": 1778382868211,
      "email": "joshua@directlendingconnection.com",
      "normalizedUsername": "joshua@directlendingconnection.com"
    }
  ],
  "note": "For full FK / legacy-vendor / Clerk-prefix scan, run `dataMigration.integrityAudit` with the same admin secret (see docs/account-migration-audit.md).",
  "ok": true,
  "otherAuthKeysStillReferenced": [],
  "suggestedAdditionalKeysToRekey": [],
  "targetEmail": "joshua@directlendingconnection.com"
}
```

## validateOrganizationIntegrity (sampled)

```json
{
  "danglingOrgRefs": {
    "contacts": 0,
    "lenders": 0,
    "pipeline": 0,
    "tasks": 0
  },
  "duplicateMemberKeys": 0,
  "membersMissingOrg": [],
  "note": "Counts are from sampled rows only. Raise memberSample/rowSample for deeper coverage.",
  "sampledMembers": 2
}
```

## Scope

This audit is generated from live Convex queries. It lists table counts, legacy vendor / Clerk-shaped key hits, and workspace keys that are not the canonical auth id for the primary email.
