/**
 * Deep-link safety for the Alerts system — internal app paths only.
 * Rejects open redirects / external URLs.
 */

export function isInternalAppPath(path: string): boolean {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  if (trimmed.includes("\\")) return false;
  return true;
}

export function assertInternalAppPath(path: string): string {
  const trimmed = path.trim();
  if (!isInternalAppPath(trimmed)) {
    throw new Error("Invalid deep link path");
  }
  return trimmed;
}

export function fileSnoozeDeepLink(fileId: string): string {
  return assertInternalAppPath(`/pipeline/${fileId}`);
}

export function hubTaskDeepLink(taskId: string): string {
  return assertInternalAppPath(`/tasks?task=${taskId}`);
}

export function vaultFileTaskDeepLink(pipelineFileId: string): string {
  return assertInternalAppPath(
    `/pipeline/${pipelineFileId}?tab=documents`,
  );
}
