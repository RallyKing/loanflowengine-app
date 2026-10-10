/**
 * Deep-link safety for the Alerts system — internal app paths only.
 * Rejects open redirects / external URLs.
 */

/** Query param: expand Tasks block on the pipeline file workspace. */
export const ALERT_FILE_BLOCK_QUERY = "block" as const;
/** Query param: open a hub task drawer on the file workspace when supported. */
export const ALERT_FILE_TASK_QUERY = "task" as const;

export function isInternalAppPath(path: string): boolean {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.includes("://")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  // Reject protocol-relative and encoded slashes before decode.
  if (trimmed.startsWith("//") || /^\/\\/i.test(trimmed)) return false;
  if (/%2f%2f/i.test(trimmed) || /%5c/i.test(trimmed)) return false;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return false;
  }
  if (decoded.includes("\\")) return false;
  if (decoded.startsWith("//")) return false;
  if (decoded.includes("://")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return false;
  if (!decoded.startsWith("/")) return false;
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
  return assertInternalAppPath(`/pipeline/${encodeURIComponent(fileId)}`);
}

/**
 * Hub task / schedule reminder → client's pipeline **file** workspace.
 * Prefer `relatedFileId` / fileTasks edge when scheduling; `taskId` focuses the
 * task drawer when the file route supports `?task=`.
 */
export function hubTaskDeepLink(fileId: string, taskId?: string): string {
  const id = fileId.trim();
  if (!id) {
    throw new Error("Invalid deep link path");
  }
  const q = new URLSearchParams();
  q.set(ALERT_FILE_BLOCK_QUERY, "tasks");
  const tid = taskId?.trim();
  if (tid) q.set(ALERT_FILE_TASK_QUERY, tid);
  return assertInternalAppPath(
    `/pipeline/${encodeURIComponent(id)}?${q.toString()}`,
  );
}

/**
 * Legacy Reminders links pointed at the Tasks page. Detect so fire-time repair
 * / click-time resolution can rewrite to the pipeline file workspace.
 */
export function isLegacyTasksPageDeepLink(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/tasks")) return false;
  try {
    const u = new URL(trimmed, "https://dlc.local");
    return u.pathname === "/tasks";
  } catch {
    return false;
  }
}

export function vaultFileTaskDeepLink(pipelineFileId: string): string {
  return assertInternalAppPath(
    `/pipeline/${encodeURIComponent(pipelineFileId)}?tab=documents`,
  );
}
