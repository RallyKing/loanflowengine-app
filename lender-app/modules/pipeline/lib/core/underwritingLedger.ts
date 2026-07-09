/** Phase 37.8.U — normalized action-queue row for Tab 6 Underwriting Ledger. */
export type UnderwritingActionItem = {
  id: string;
  type: "task" | "client_request";
  title: string;
  status: string;
  createdAt: number;
  dueDate?: number;
  assignedToKey?: string;
  /** Portal grant email key — client attribution for broker requests. */
  clientEmail?: string;
};

const ONE_DAY_MS = 86_400_000;

const UNDERWRITING_DUE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export type UnderwritingDueDateUrgency = "past_due" | "due_soon" | "normal";

export function formatUnderwritingDueDate(dueDate: number): string {
  try {
    return UNDERWRITING_DUE_FMT.format(new Date(dueDate));
  } catch {
    return "";
  }
}

/** Past due or due within 24 hours → warning styling in the action queue. */
export function underwritingDueDateUrgency(
  dueDate: number | undefined,
  now = Date.now(),
): UnderwritingDueDateUrgency | null {
  if (dueDate == null || !Number.isFinite(dueDate)) return null;
  if (dueDate < now) return "past_due";
  if (dueDate <= now + ONE_DAY_MS) return "due_soon";
  return "normal";
}

/** Due-first ascending; undated rows fall back to newest `createdAt`. */
export function sortUnderwritingActionItems(
  items: UnderwritingActionItem[],
): UnderwritingActionItem[] {
  return [...items].sort((a, b) => {
    const aDue = a.dueDate;
    const bDue = b.dueDate;
    if (aDue != null && bDue != null) return aDue - bDue;
    if (aDue != null && bDue == null) return -1;
    if (aDue == null && bDue != null) return 1;
    return b.createdAt - a.createdAt;
  });
}
