/**
 * Shared Web Push payload + allowlist helpers (no Node deps — safe for mutations).
 */

import type { NotificationCategory } from "../lib/notificationPreferences";
import type { AlertCategory } from "../lib/alerts/alertCategories";

/**
 * Phone Web Push allowlist for `userNotifications`.
 * Settings test push bypasses this list (`sendTestPush`).
 */
export const WEB_PUSH_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "document_activity",
]);

export function isWebPushCategory(
  category: string,
): category is NotificationCategory {
  return WEB_PUSH_CATEGORIES.has(category as NotificationCategory);
}

/** All Time Alerts categories may push when the user's alertPreferences allow. */
export function isTimeAlertWebPushCategory(
  category: string,
): category is AlertCategory {
  return (
    category === "file_snooze_due" ||
    category === "task_due" ||
    category === "task_scheduled"
  );
}

/** Build app-relative deep link for push `notificationclick` (mirrors Alerts inbox). */
export function webPushDeepLink(row: {
  category: string;
  taskId?: string;
  fileId?: string;
  lenderId?: string;
  libraryDocumentId?: string;
  documentVaultFileTaskId?: string;
  clientUploadReviewId?: string;
}): string {
  if (row.taskId) {
    return `/tasks?task=${row.taskId}`;
  }
  if (row.fileId) {
    const isDocumentish =
      row.category === "document_activity" ||
      Boolean(row.libraryDocumentId) ||
      Boolean(row.documentVaultFileTaskId) ||
      Boolean(row.clientUploadReviewId);
    if (isDocumentish) {
      const q = new URLSearchParams();
      q.set("tab", "documents");
      if (row.libraryDocumentId) {
        q.set("document", row.libraryDocumentId);
      }
      if (row.clientUploadReviewId) {
        q.set("clientUploadReview", row.clientUploadReviewId);
      }
      return `/pipeline/${encodeURIComponent(row.fileId)}?${q.toString()}`;
    }
    return `/pipeline/${encodeURIComponent(row.fileId)}`;
  }
  if (row.lenderId) {
    return `/lenders?lender=${row.lenderId}`;
  }
  return "/";
}

export type WebPushJsonPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function buildWebPushPayload(row: {
  _id: string;
  category: string;
  summary: string;
  detail?: string;
  taskId?: string;
  fileId?: string;
  lenderId?: string;
  libraryDocumentId?: string;
  documentVaultFileTaskId?: string;
  clientUploadReviewId?: string;
}): WebPushJsonPayload {
  return {
    title: row.summary.slice(0, 120),
    body: (row.detail?.trim() || row.summary).slice(0, 240),
    url: webPushDeepLink(row),
    tag: `user-notification:${row._id}`,
  };
}

export function buildTimeAlertWebPushPayload(row: {
  _id: string;
  category: string;
  title: string;
  body?: string;
  deepLinkPath: string;
}): WebPushJsonPayload {
  const url =
    typeof row.deepLinkPath === "string" && row.deepLinkPath.startsWith("/")
      ? row.deepLinkPath
      : "/";
  return {
    title: row.title.slice(0, 120),
    body: (row.body?.trim() || row.title).slice(0, 240),
    url,
    tag: `time-alert:${row._id}`,
  };
}
