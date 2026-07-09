import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import { behaviorSettingsRecord } from "@/lib/userPreferencesModel";

export type NotificationCategory =
  | "task_assignment"
  | "file_update"
  | "mention"
  | "deadline"
  | "assignment_change"
  | "comment_activity"
  | "document_activity"
  | "status_change"
  | "digest_group";

/** Keys stored under Convex `userPreferences.behaviorSettings`. */
export const NOTIFY_MASTER_ENABLED_KEY = "notifyMasterEnabled" as const;
export const NOTIFY_EMAIL_MASTER_KEY = "notifyEmailEnabled" as const;
export const NOTIFY_EMAIL_ADDRESS_KEY = "notificationEmail" as const;

export const NOTIFY_TASK_ASSIGNMENT_INAPP_KEY =
  "notifyTaskAssignmentInApp" as const;
export const NOTIFY_TASK_ASSIGNMENT_EMAIL_KEY =
  "notifyTaskAssignmentEmail" as const;
export const NOTIFY_FILE_UPDATE_INAPP_KEY = "notifyFileUpdateInApp" as const;
export const NOTIFY_FILE_UPDATE_EMAIL_KEY = "notifyFileUpdateEmail" as const;
export const NOTIFY_MENTION_INAPP_KEY = "notifyMentionInApp" as const;
export const NOTIFY_MENTION_EMAIL_KEY = "notifyMentionEmail" as const;
export const NOTIFY_DEADLINE_INAPP_KEY = "notifyDeadlineInApp" as const;
export const NOTIFY_DEADLINE_EMAIL_KEY = "notifyDeadlineEmail" as const;

export const NOTIFY_DIGEST_GROUP_INAPP_KEY = "notifyDigestGroupInApp" as const;
export const NOTIFY_DIGEST_GROUP_EMAIL_KEY = "notifyDigestGroupEmail" as const;
export const NOTIFY_ASSIGNMENT_CHANGE_INAPP_KEY =
  "notifyAssignmentChangeInApp" as const;
export const NOTIFY_ASSIGNMENT_CHANGE_EMAIL_KEY =
  "notifyAssignmentChangeEmail" as const;
export const NOTIFY_COMMENT_ACTIVITY_INAPP_KEY =
  "notifyCommentActivityInApp" as const;
export const NOTIFY_COMMENT_ACTIVITY_EMAIL_KEY =
  "notifyCommentActivityEmail" as const;
export const NOTIFY_DOCUMENT_ACTIVITY_INAPP_KEY =
  "notifyDocumentActivityInApp" as const;
export const NOTIFY_DOCUMENT_ACTIVITY_EMAIL_KEY =
  "notifyDocumentActivityEmail" as const;
export const NOTIFY_STATUS_CHANGE_INAPP_KEY =
  "notifyStatusChangeInApp" as const;
export const NOTIFY_STATUS_CHANGE_EMAIL_KEY =
  "notifyStatusChangeEmail" as const;

export type NotificationPrefsResolved = {
  masterEnabled: boolean;
  emailMasterEnabled: boolean;
  notificationEmail: string;
  taskAssignment: { inApp: boolean; email: boolean };
  fileUpdate: { inApp: boolean; email: boolean };
  mention: { inApp: boolean; email: boolean };
  deadline: { inApp: boolean; email: boolean };
  assignmentChange: { inApp: boolean; email: boolean };
  commentActivity: { inApp: boolean; email: boolean };
  documentActivity: { inApp: boolean; email: boolean };
  statusChange: { inApp: boolean; email: boolean };
  digestGroup: { inApp: boolean; email: boolean };
};

function readBool(
  behavior: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const v = behavior[key];
  if (v === undefined || v === null) return defaultValue;
  return Boolean(v);
}

function readEmail(
  behavior: Record<string, unknown>,
): string {
  const v = behavior[NOTIFY_EMAIL_ADDRESS_KEY];
  if (typeof v !== "string") return "";
  return v.trim();
}

/** Defaults: in-app on, email off (explicit opt-in). */
export function resolveNotificationPrefs(
  prefs: UserPreferencesV1 | null | undefined,
): NotificationPrefsResolved {
  const behavior = behaviorSettingsRecord(prefs?.behaviorSettings);
  const masterEnabled = readBool(
    behavior,
    NOTIFY_MASTER_ENABLED_KEY,
    true,
  );
  const emailMasterEnabled = readBool(
    behavior,
    NOTIFY_EMAIL_MASTER_KEY,
    false,
  );
  const notificationEmail = readEmail(behavior);
  return {
    masterEnabled,
    emailMasterEnabled,
    notificationEmail,
    taskAssignment: {
      inApp: readBool(behavior, NOTIFY_TASK_ASSIGNMENT_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_TASK_ASSIGNMENT_EMAIL_KEY, false),
    },
    fileUpdate: {
      inApp: readBool(behavior, NOTIFY_FILE_UPDATE_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_FILE_UPDATE_EMAIL_KEY, false),
    },
    mention: {
      inApp: readBool(behavior, NOTIFY_MENTION_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_MENTION_EMAIL_KEY, false),
    },
    deadline: {
      inApp: readBool(behavior, NOTIFY_DEADLINE_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_DEADLINE_EMAIL_KEY, false),
    },
    assignmentChange: {
      inApp: readBool(behavior, NOTIFY_ASSIGNMENT_CHANGE_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_ASSIGNMENT_CHANGE_EMAIL_KEY, false),
    },
    commentActivity: {
      inApp: readBool(behavior, NOTIFY_COMMENT_ACTIVITY_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_COMMENT_ACTIVITY_EMAIL_KEY, false),
    },
    documentActivity: {
      inApp: readBool(behavior, NOTIFY_DOCUMENT_ACTIVITY_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_DOCUMENT_ACTIVITY_EMAIL_KEY, false),
    },
    statusChange: {
      inApp: readBool(behavior, NOTIFY_STATUS_CHANGE_INAPP_KEY, true),
      email: readBool(behavior, NOTIFY_STATUS_CHANGE_EMAIL_KEY, false),
    },
    digestGroup: {
      inApp: readBool(behavior, NOTIFY_DIGEST_GROUP_INAPP_KEY, false),
      email: readBool(behavior, NOTIFY_DIGEST_GROUP_EMAIL_KEY, false),
    },
  };
}

export function channelsForCategory(
  resolved: NotificationPrefsResolved,
  category: NotificationCategory,
): { inApp: boolean; email: boolean } {
  if (!resolved.masterEnabled) return { inApp: false, email: false };
  const slice =
    category === "task_assignment"
      ? resolved.taskAssignment
      : category === "file_update"
        ? resolved.fileUpdate
        : category === "mention"
          ? resolved.mention
          : category === "deadline"
            ? resolved.deadline
            : category === "assignment_change"
              ? resolved.assignmentChange
              : category === "comment_activity"
                ? resolved.commentActivity
                : category === "document_activity"
                  ? resolved.documentActivity
                  : category === "status_change"
                    ? resolved.statusChange
                    : resolved.digestGroup;
  return {
    inApp: slice.inApp,
    email:
      resolved.emailMasterEnabled && slice.email && resolved.notificationEmail.length > 0,
  };
}

export function simpleEmailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
