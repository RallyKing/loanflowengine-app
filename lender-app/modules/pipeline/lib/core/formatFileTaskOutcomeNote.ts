/** Prefix + body for file Notes when completing or deleting a pipeline-file task. */

export type FileTaskOutcomeKind = "complete" | "delete";

export function fileTaskOutcomeHeadline(
  kind: FileTaskOutcomeKind,
  taskTitle: string,
): string {
  const title = taskTitle.trim() || "Untitled task";
  return kind === "complete"
    ? `Completed task: ${title}`
    : `Deleted task: ${title}`;
}

/**
 * Canonical `pipelineFileNotes` body when the user leaves an optional note
 * after completing or deleting a file task. Returns `null` when there is
 * nothing to persist (confirm without a note).
 */
export function formatFileTaskOutcomeNote(
  kind: FileTaskOutcomeKind,
  taskTitle: string,
  userNote?: string | null,
): string | null {
  const extra = userNote?.trim() ?? "";
  if (!extra) return null;
  return `${fileTaskOutcomeHeadline(kind, taskTitle)}\n\n${extra}`;
}
