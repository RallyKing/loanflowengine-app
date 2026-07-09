/** Phase 32.3 — attempt note badge copy for timelines and audit UI. */
export function formatTaskAttemptNoteLabel(
  attemptNumber: number | undefined,
  taskName: string | undefined,
): string {
  const n =
    typeof attemptNumber === "number" && attemptNumber > 0
      ? attemptNumber
      : null;
  const title = taskName?.trim();
  if (n != null && title) return `Task attempt #${n}: ${title}`;
  if (n != null) return `Task attempt #${n}`;
  if (title) return `Task attempt: ${title}`;
  return "Task attempt";
}
