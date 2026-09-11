/**
 * Which vault tasks a client-portal bundle token may access.
 * `all_outstanding` snapshots at issue time, then also includes live
 * portal-visible outstanding tasks so new per-borrower PFS tasks appear
 * on the same package link.
 */
import type { Doc, Id } from "./_generated/dataModel";

export function isOutstandingPortalVisibleTask(
  task: Doc<"documentVaultFileTasks">,
): boolean {
  return !task.isArchived && task.isPortalVisible && task.status !== "complete";
}

export function resolveBundleFileTaskIds(
  row: Doc<"documentVaultClientBundleTokens">,
  allTasks: Doc<"documentVaultFileTasks">[],
): Id<"documentVaultFileTasks">[] {
  const byId = new Map(allTasks.map((task) => [String(task._id), task]));
  const out: Id<"documentVaultFileTasks">[] = [];
  const seen = new Set<string>();
  const push = (id: Id<"documentVaultFileTasks">) => {
    const task = byId.get(String(id));
    if (!task || task.isArchived || !task.isPortalVisible) return;
    if (seen.has(String(id))) return;
    seen.add(String(id));
    out.push(id);
  };
  for (const id of row.fileTaskIds) push(id);
  if (row.mode === "all_outstanding") {
    for (const task of allTasks) {
      if (isOutstandingPortalVisibleTask(task)) push(task._id);
    }
  }
  return out;
}

export function bundleIncludesFileTask(
  row: Doc<"documentVaultClientBundleTokens">,
  allTasks: Doc<"documentVaultFileTasks">[],
  fileTaskId: Id<"documentVaultFileTasks">,
): boolean {
  return resolveBundleFileTaskIds(row, allTasks).some(
    (id) => String(id) === String(fileTaskId),
  );
}
