/**
 * Tables included in automated snapshots, in **import-safe order** (parents before
 * dependents). Keep in sync with `schema.ts` when adding tables.
 */
export const DATA_BACKUP_TABLE_ORDER = [
  "lenderStats",
  "pipelineGlobalBlockConfig",
  "organizations",
  "organizationCustomDomains",
  "organizationRoles",
  "lenders",
  "userPreferences",
  "userSimpleWorkflows",
  "organizationMembers",
  "pipelineFileUserTemplates",
  "lenderCandidates",
  "discoveryRuns",
  "lenderAttachments",
  "lenderPortalCredentials",
  "savedFilterPresets",
  "intakeSheets",
  "shareLinks",
  "pipeline",
  "pipelineFileShares",
  "pipelineFileActivity",
  "contacts",
  "contactFileLinks",
  "contactLenderLinks",
  "contactActivity",
  "tasks",
  "taskAttachments",
  "taskNotifications",
  "ledger",
  "payments",
  "activityFeed",
  "collaborationActivityEvents",
  "memberPresence",
  "entityAssignments",
  "collaborationThreads",
  "collaborationComments",
  "userNotifications",
  "libraryDocuments",
  "libraryDocumentVersions",
  "libraryDocumentLinks",
  "signatureEnvelopes",
  "signatureSigners",
  "signatureAuditEvents",
  "clientPortalIdentities",
  "clientPortalGrants",
  "clientPortalSessions",
  "clientPortalMagicLinks",
  "clientPortalUploads",
  "clientPortalRequests",
  "clientPortalUpdates",
  "clientPortalAudit",
  "portalDefaults",
  "portalDefaultVersions",
  "portalSectionStepProgress",
  "internalWorkflowTemplates",
  "fileMessages",
  "fileMessageAttachments",
  "securityAuditLog",
  "portalAuthThrottle",
  "integrationApiKeys",
  "integrationOAuthClients",
  "integrationAccessTokens",
  "integrationRateLimitBuckets",
  "integrationConnectors",
  "integrationJobs",
  "integrationSyncCursors",
  "organizationIntegrationWorkflows",
  "systemEmailEvents",
  "systemEmailLog",
  "emailInboxSyncPreferences",
  "outboundWebhookSubscriptions",
  "outboundWebhookDeliveries",
  "outboundWebhookDeliveryLogs",
  "referentialIntegrityQuarantine",
] as const;

export type DataBackupTableName = (typeof DATA_BACKUP_TABLE_ORDER)[number];

export const DATA_BACKUP_TABLE_SET: ReadonlySet<string> = new Set(
  DATA_BACKUP_TABLE_ORDER,
);

/** Pages per resumable backup step (one action tick). */
export const DATA_BACKUP_PAGES_PER_ACTION = 32;

/** Documents per storage chunk. */
export const DATA_BACKUP_PAGE_SIZE = 400;

/** Completed snapshots to retain (oldest pruned after each success). */
export const DATA_BACKUP_RETENTION_COMPLETE = 14;

export const DATA_BACKUP_STALE_RUNNING_MS = 6 * 60 * 60 * 1000;
