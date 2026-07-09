/**
 * Canonical collaboration / audit event vocabulary (mirrors Convex
 * `collaborationActivityEvents.eventType`). Keep aligned with `convex/schema.ts`.
 */
export const COLLABORATION_EVENT_TYPES = [
  "file_created",
  "file_updated",
  "status_changed",
  "task_assigned",
  "task_completed",
  "comment_added",
  "document_uploaded",
  "lender_interaction_created",
  "note_edited",
  "ownership_changed",
  "deadline_changed",
  "assignment_changed",
  "communication_sent",
  "communication_delivered",
  "communication_failed",
  "communication_retry_scheduled",
  "presence_hint",
] as const;

export type CollaborationEventType = (typeof COLLABORATION_EVENT_TYPES)[number];

export const COLLABORATION_VISIBILITY_SCOPES = [
  "org_wide",
  "entity_participants",
  "direct_recipients",
  "internal_admin",
] as const;

export type CollaborationVisibilityScope =
  (typeof COLLABORATION_VISIBILITY_SCOPES)[number];

export type CollaborationDeltaPayload = Record<string, unknown>;

export type StructuredActivityEventInput = {
  eventType: CollaborationEventType;
  visibility: CollaborationVisibilityScope;
  actorUserKey: string;
  organizationId: string;
  summary: string;
  delta?: CollaborationDeltaPayload;
  recipientUserKeys?: string[];
  pipelineFileId?: string;
  taskId?: string;
  lenderId?: string;
  libraryDocumentId?: string;
  contactId?: string;
  collaborationThreadId?: string;
  at?: number;
};
