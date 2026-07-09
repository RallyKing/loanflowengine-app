import type { Doc } from "@/convex/_generated/dataModel";
import { joinCsvDocument, joinCsvLine, joinTsvDocument, joinTsvLine } from "@/lib/export/csvEscape";

export type TaskExportRow = Doc<"tasks">;

const CSV_HEADERS = [
  "Task ID",
  "Title",
  "Description",
  "Type",
  "Category",
  "Status",
  "Quadrant",
  "Priority",
  "Due date",
  "Start date",
  "Completed at",
  "Snoozed until",
  "Parent task ID",
  "Related file ID",
  "Related contact ID",
  "Assignee",
  "Shared with",
  "Reminder at",
  "Links JSON",
  "Linked task IDs",
  "Checklist JSON",
  "Errand locations JSON",
  "Recurrence JSON",
  "Created at",
] as const;

function iso(ms: number | undefined | null): string {
  if (ms == null) return "";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function rowCells(t: TaskExportRow): unknown[] {
  return [
    t._id,
    t.title,
    t.description ?? "",
    t.type,
    t.category,
    t.status,
    t.quadrant,
    t.priority,
    iso(t.dueDate),
    iso(t.startDate),
    iso(t.completedAt),
    iso(t.snoozedUntil),
    t.parentTaskId ?? "",
    t.relatedFileId ?? "",
    t.relatedContactId ?? "",
    t.assigneeId ?? "",
    (t.sharedWithIds ?? []).join(";"),
    iso(t.reminderAt),
    JSON.stringify(t.links ?? []),
    (t.linkedTaskIds ?? []).join(";"),
    JSON.stringify(t.checklist ?? []),
    JSON.stringify(t.errandLocations ?? []),
    t.recurrence ? JSON.stringify(t.recurrence) : "",
    new Date(t._creationTime).toISOString(),
  ];
}

export function buildTasksCsv(tasks: TaskExportRow[]): string {
  const lines = [joinCsvLine([...CSV_HEADERS])];
  for (const t of tasks) {
    lines.push(joinCsvLine(rowCells(t)));
  }
  return joinCsvDocument(lines);
}

export function buildTasksTsv(tasks: TaskExportRow[]): string {
  const lines = [joinTsvLine([...CSV_HEADERS])];
  for (const t of tasks) {
    lines.push(joinTsvLine(rowCells(t)));
  }
  return joinTsvDocument(lines);
}

export function buildTasksJson(tasks: TaskExportRow[]): string {
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      rowCount: tasks.length,
      tasks,
    },
    null,
    2
  );
}
