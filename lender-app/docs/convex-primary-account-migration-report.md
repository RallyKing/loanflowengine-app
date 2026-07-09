# Convex primary account migration report

_Generated: 2026-05-10T03:42:58.095Z_

**Deployment URL:** https://basic-anaconda-984.convex.cloud

### Manual verification

1. Login as `joshua@directlendingconnection.com` (case-insensitive username).
2. Pipeline, tasks, lenders, contacts, settings — no permission or functionReference errors.
3. `AUTH_BRIDGE_SECRET`: same value on Vercel and Convex (≥24 chars).

## mutation steps

```json
[
  {
    "step": 1,
    "name": "ensurePrimaryPlatformAdmin",
    "result": {
      "created": false,
      "ok": true,
      "organizationId": "mx77ssc8sjpgwapfehx8yhz5kd86epd3",
      "primaryCanonical": "joshua@directlendingconnection.com",
      "userId": "ts719yfyv2b6020avvctpw0ns586exm6"
    }
  },
  {
    "step": 2,
    "name": "mergeAuthUsersByEmail_dryRun",
    "result": {
      "additionalKeysApplied": [],
      "canonicalAuthUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
      "dryRun": true,
      "ok": true,
      "oldAuthUserIds": [],
      "reason": "single_identity_nothing_to_merge",
      "summary": {
        "activityFeedPatched": 0,
        "authEmailVerificationTokensRekeyed": 0,
        "authPasswordResetTokensRekeyed": 0,
        "authSessionsRekeyed": 0,
        "authUsersCanonicalProfileMerged": 0,
        "authUsersDeleted": 0,
        "clientPortalAuditPatched": 0,
        "clientPortalGrantsPatched": 0,
        "clientPortalRequestsPatched": 0,
        "clientPortalUpdatesPatched": 0,
        "contactActivityPatched": 0,
        "emailInboxSyncPreferencesPatched": 0,
        "fileMessagesPatched": 0,
        "integrationAccessTokensPatched": 0,
        "integrationApiKeysPatched": 0,
        "integrationConnectorsPatched": 0,
        "integrationOAuthClientsPatched": 0,
        "libraryDocumentLinksPatched": 0,
        "libraryDocumentVersionsPatched": 0,
        "libraryDocumentsPatched": 0,
        "navigationUserConfig_duplicateDropped": 0,
        "navigationUserConfig_rekeyed": 0,
        "organizationMemberDupesRemoved": 0,
        "organizationMembersMerged": 0,
        "organizationMembersRekeyed": 0,
        "orphanAuthEmailVerificationTokensDeleted": 0,
        "orphanAuthPasswordResetTokensDeleted": 0,
        "orphanAuthSessionsDeleted": 0,
        "outboundWebhookSubscriptionsPatched": 0,
        "pipelineFileActivityPatched": 0,
        "pipelineFileSharesPatched": 0,
        "pipelineFileUserTemplates_duplicateDropped": 0,
        "pipelineFileUserTemplates_rekeyed": 0,
        "pipelinePatched": 0,
        "signatureAuditEventsPatched": 0,
        "signatureEnvelopesPatched": 0,
        "systemEmailLogPatched": 0,
        "taskNotificationsPatched": 0,
        "tasksPatched": 0,
        "userNotificationsPatched": 0,
        "userOnboardingPatched": 0,
        "userPreferencesMerged": 0,
        "userPreferencesRekeyed": 0,
        "userSimpleWorkflows_duplicateDropped": 0,
        "userSimpleWorkflows_rekeyed": 0
      },
      "targetEmail": "joshua@directlendingconnection.com"
    }
  },
  {
    "step": 3,
    "name": "mergeAuthUsersByEmail_execute",
    "result": {
      "additionalKeysApplied": [],
      "canonicalAuthUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
      "dryRun": false,
      "ok": true,
      "oldAuthUserIds": [],
      "reason": "single_identity_nothing_to_merge",
      "summary": {
        "activityFeedPatched": 0,
        "authEmailVerificationTokensRekeyed": 0,
        "authPasswordResetTokensRekeyed": 0,
        "authSessionsRekeyed": 0,
        "authUsersCanonicalProfileMerged": 0,
        "authUsersDeleted": 0,
        "clientPortalAuditPatched": 0,
        "clientPortalGrantsPatched": 0,
        "clientPortalRequestsPatched": 0,
        "clientPortalUpdatesPatched": 0,
        "contactActivityPatched": 0,
        "emailInboxSyncPreferencesPatched": 0,
        "fileMessagesPatched": 0,
        "integrationAccessTokensPatched": 0,
        "integrationApiKeysPatched": 0,
        "integrationConnectorsPatched": 0,
        "integrationOAuthClientsPatched": 0,
        "libraryDocumentLinksPatched": 0,
        "libraryDocumentVersionsPatched": 0,
        "libraryDocumentsPatched": 0,
        "navigationUserConfig_duplicateDropped": 0,
        "navigationUserConfig_rekeyed": 0,
        "organizationMemberDupesRemoved": 0,
        "organizationMembersMerged": 0,
        "organizationMembersRekeyed": 0,
        "orphanAuthEmailVerificationTokensDeleted": 0,
        "orphanAuthPasswordResetTokensDeleted": 0,
        "orphanAuthSessionsDeleted": 0,
        "outboundWebhookSubscriptionsPatched": 0,
        "pipelineFileActivityPatched": 0,
        "pipelineFileSharesPatched": 0,
        "pipelineFileUserTemplates_duplicateDropped": 0,
        "pipelineFileUserTemplates_rekeyed": 0,
        "pipelinePatched": 0,
        "signatureAuditEventsPatched": 0,
        "signatureEnvelopesPatched": 0,
        "systemEmailLogPatched": 0,
        "taskNotificationsPatched": 0,
        "tasksPatched": 0,
        "userNotificationsPatched": 0,
        "userOnboardingPatched": 0,
        "userPreferencesMerged": 0,
        "userPreferencesRekeyed": 0,
        "userSimpleWorkflows_duplicateDropped": 0,
        "userSimpleWorkflows_rekeyed": 0
      },
      "targetEmail": "joshua@directlendingconnection.com"
    }
  },
  {
    "step": 4,
    "name": "finalizePrimaryNativeOwnership",
    "result": {
      "canonicalAuthUserId": "ts719yfyv2b6020avvctpw0ns586exm6",
      "clerkOrgFieldsCleared": 1,
      "dryRun": false,
      "ok": true,
      "orgMemberDupesRemoved": 0,
      "ownerMembershipsCreated": 0,
      "ownerMembershipsUpgraded": 1,
      "primaryOwnerPatched": 1,
      "targetEmail": "joshua@directlendingconnection.com"
    }
  },
  {
    "step": 5,
    "name": "normalizeAuthUserCasing",
    "result": {
      "authUserCount": 1,
      "dryRun": false,
      "ok": true,
      "patched": 0
    }
  },
  {
    "step": 6,
    "name": "purgeLegacyExternalAuth",
    "result": {
      "deleteLegacyAuthUserDocuments": true,
      "dryRun": false,
      "legacyAuthUserIdsTargeted": [],
      "ok": true,
      "purgeExpiredSessions": true,
      "summary": {
        "activityFeedActorPatched": 0,
        "activityFeedDeleted": 0,
        "authEmailVerificationTokensDeletedLegacyUser": 0,
        "authEmailVerificationTokensDeletedOrphan": 0,
        "authPasswordResetTokensDeletedLegacyUser": 0,
        "authPasswordResetTokensDeletedOrphan": 0,
        "authSessionsDeletedLegacyUser": 0,
        "authSessionsDeletedOrphan": 0,
        "authSessionsDeletedStale": 0,
        "authUsersDeletedLegacy": 0,
        "clientPortalAuditActorPatched": 0,
        "clientPortalAuditDeleted": 0,
        "clientPortalGrantsDeleted": 0,
        "clientPortalIdentitiesDeleted": 0,
        "clientPortalMagicLinksDeleted": 0,
        "clientPortalRequestsDeleted": 0,
        "clientPortalSessionsDeleted": 0,
        "clientPortalUpdatesDeleted": 0,
        "contactActivityPatched": 0,
        "emailInboxSyncPreferencesDeleted": 0,
        "fileMessagesPatched": 0,
        "integrationAccessTokensDeleted": 0,
        "integrationApiKeysDeleted": 0,
        "integrationConnectorsPatched": 0,
        "integrationOAuthClientsDeleted": 0,
        "libraryDocumentLinksPatched": 0,
        "libraryDocumentVersionsPatched": 0,
        "libraryDocumentsPatched": 0,
        "navigationUserConfigDeleted": 0,
        "organizationMembersDeleted": 0,
        "outboundWebhookSubscriptionsPatched": 0,
        "pipelineFileActivityPatched": 0,
        "pipelineFileSharesDeleted": 0,
        "pipelineFileUserTemplatesDeleted": 0,
        "pipelinePatched": 0,
        "signatureAuditEventsPatched": 0,
        "signatureEnvelopesPatched": 0,
        "systemEmailLogPatched": 0,
        "taskNotificationsActorCleared": 0,
        "taskNotificationsDeleted": 0,
        "tasksPatched": 0,
        "userNotificationsActorCleared": 0,
        "userNotificationsDeleted": 0,
        "userOnboardingDeleted": 0,
        "userPreferencesDeleted": 0,
        "userSimpleWorkflowsDeleted": 0
      }
    }
  }
]
```

## post-migration integrityAudit

```json
{
  "authUsersWithoutMembership": [],
  "authUsersWithoutMembershipCount": 0,
  "clerkPrefixedUserKeyHits": [],
  "clerkPrefixedUserKeyHitsCount": 0,
  "generatedAt": 1778384578213,
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

## post-migration planAccountOwnershipMigration

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

## post-migration validateOrganizationIntegrity (sampled)

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

