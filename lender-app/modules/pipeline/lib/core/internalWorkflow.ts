/** Phase 37.8.U — internal broker checklist row from `dealData.workflow[]`. */
export type InternalWorkflowItem = {
  label: string;
  done: boolean;
  date?: string;
};

export function parseInternalWorkflowItems(
  raw: unknown,
): InternalWorkflowItem[] {
  if (!Array.isArray(raw)) return [];
  const items: InternalWorkflowItem[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) continue;
    items.push({
      label,
      done: row.done === true,
      date:
        typeof row.date === "string" && row.date.trim()
          ? row.date.trim()
          : undefined,
    });
  }
  return items;
}

export function internalWorkflowProgress(items: InternalWorkflowItem[]): {
  completed: number;
  total: number;
} {
  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  return { completed, total };
}
