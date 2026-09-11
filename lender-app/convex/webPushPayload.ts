/**
 * Shared Web Push payload + allowlist helpers (no Node deps — safe for mutations).
 */

import type { NotificationCategory } from "../lib/notificationPreferences";

/**
 * Phone Web Push allowlist — client vault uploads only (`document_activity`
 * from `recordClientVaultUpload` → `notifyPipelineBrokers`).
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

/** Build app-relative deep link for push `notificationclick` (mirrors Alerts inbox). */
export function webPushDeepLink(row: {
  category: string;
  taskId?: string;
  fileId?: string;
  lenderId?: string;
  libraryDocumentId?: string;
  documentVaultFileTaskId?: string;
}): string {
  if (row.taskId) {
    return `/tasks?task=${row.taskId}`;
  }
  if (row.fileId) {
    const isDocumentish =
      row.category === "document_activity" ||
      Boolean(row.libraryDocumentId) ||
      Boolean(row.documentVaultFileTaskId);
    if (isDocumentish) {
      const q = new URLSearchParams();
      q.set("tab", "documents");
      if (row.libraryDocumentId) {
        q.set("document", row.libraryDocumentId);
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
}): WebPushJsonPayload {
  return {
    title: row.summary.slice(0, 120),
    body: (row.detail?.trim() || row.summary).slice(0, 240),
    url: webPushDeepLink(row),
    tag: `user-notification:${row._id}`,
  };
}
