import type { Doc } from "@/convex/_generated/dataModel";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";

type NotificationRow = Doc<"userNotifications"> & {
  contextFileName?: string;
  contextContactName?: string;
  contextStageLabel?: string;
  actorDisplayUsername?: string;
};

/** Build in-app deep link for an Alerts inbox row. */
export function notificationDeepLinkHref(row: NotificationRow): string | null {
  if (row.taskId) {
    return `/tasks?task=${row.taskId}`;
  }
  if (row.fileId) {
    const isDocumentish =
      row.category === "document_activity" ||
      Boolean(row.libraryDocumentId) ||
      Boolean(row.documentVaultFileTaskId);
    if (isDocumentish) {
      return pipelineDealEditorHref(String(row.fileId), {
        tab: "documents",
        documentId: row.libraryDocumentId
          ? String(row.libraryDocumentId)
          : undefined,
      });
    }
    return pipelineDealEditorHref(String(row.fileId));
  }
  if (row.lenderId) {
    return `/lenders?lender=${row.lenderId}`;
  }
  return null;
}

export type { NotificationRow };
