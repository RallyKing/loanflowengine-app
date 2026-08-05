/**
 * Client-downloadable template / reference files on vault file tasks.
 * Stored as Convex `_storage` refs on `documentVaultFileTasks.clientTemplateAttachments`.
 */

export const MAX_FILE_TASK_CLIENT_TEMPLATES = 5;

export type FileTaskClientTemplateAttachment = {
  storageId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export function taskTypeAllowsClientTemplates(
  taskType: string | undefined,
): boolean {
  const t = taskType ?? "document_upload";
  return t === "document_upload" || t === "client_instruction";
}

/** Email / link-copy label when a task has at least one template. */
export function fileTaskTitleForClientLinkEmail(
  title: string,
  hasTemplate: boolean,
): string {
  const base = title.trim() || "Document request";
  if (!hasTemplate) return base;
  if (/\(see attached template\)\s*$/i.test(base)) return base;
  return `${base} (see attached template)`;
}
