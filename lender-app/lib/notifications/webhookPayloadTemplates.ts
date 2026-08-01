import type { NotificationEventType } from "@/convex/notificationConstants";



export type WebhookEventData = Record<string, unknown>;



function asString(value: unknown): string | undefined {

  if (value == null) return undefined;

  const s = String(value).trim();

  return s || undefined;

}



function flatPayload(

  event: NotificationEventType,

  fields: Record<string, unknown>,

): Record<string, unknown> {

  const out: Record<string, unknown> = { event, timestamp: new Date().toISOString() };

  for (const [key, value] of Object.entries(fields)) {

    if (value !== undefined && value !== null && value !== "") {

      out[key] = value;

    }

  }

  return out;

}



/**

 * Standardize outgoing JSON payloads per notification event.

 * Flat, CRM-friendly keys for GoHighLevel and similar SaaS automations.

 */

export function buildEventPayload(

  event: NotificationEventType,

  data: WebhookEventData = {},

): Record<string, unknown> {

  switch (event) {

    case "test_ping":

      return flatPayload("test_ping", {

        message: "Webhook successfully connected to Loan Flow Engine.",

      });

    case "client_document_uploaded":

      return flatPayload("client_document_uploaded", {

        dealName: asString(data.dealName),

        folderName: asString(data.folderName) ?? "Root",

        fileName: asString(data.fileName),

        documentVaultUrl: asString(data.documentVaultUrl),

        pipelineFileId: asString(data.pipelineFileId),

        fileTaskId: asString(data.fileTaskId),

        documentId: asString(data.documentId),

      });

    case "lender_portal_accessed":

      return flatPayload("lender_portal_accessed", {

        lenderName: asString(data.lenderName),

        ipAddress: asString(data.ipAddress),

        dealName: asString(data.dealName),

        pipelineFileId: asString(data.pipelineFileId),

        lenderId: asString(data.lenderId),

      });

    case "task_status_changed":

      return flatPayload("task_status_changed", {

        taskTitle: asString(data.taskTitle),

        oldStatus: asString(data.oldStatus),

        newStatus: asString(data.newStatus),

        revisionNotes: asString(data.revisionNotes),

        pipelineFileId: asString(data.pipelineFileId),

        taskId: asString(data.taskId),

        taskKind: asString(data.taskKind),

      });

    case "deal_package_compiled":

      return flatPayload("deal_package_compiled", {

        dealName: asString(data.dealName),

        packageLabel: asString(data.packageLabel),

        documentCount: data.documentCount,

        source: asString(data.source),

        pipelineFileId: asString(data.pipelineFileId),

        lenderName: asString(data.lenderName),

      });

    default:

      return flatPayload(event, data);

  }

}


