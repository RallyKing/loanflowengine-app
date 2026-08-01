import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";

/** Polymorphic document vault file task kinds. */
export const FILE_TASK_TYPES = [
  "document_upload",
  "client_instruction",
  "internal_task",
  "block_assignment",
] as const;

export type FileTaskType = (typeof FILE_TASK_TYPES)[number];

export type AssignedBlockEntry = {
  blockId: string;
  sortOrder: number;
};

export const FILE_TASK_PRIORITIES = ["low", "medium", "high"] as const;

export type FileTaskPriority = (typeof FILE_TASK_PRIORITIES)[number];

export const FILE_TASK_PRIORITY_LABELS: Record<FileTaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const FILE_TASK_TYPE_LABELS: Record<FileTaskType, string> = {
  document_upload: "Document upload",
  client_instruction: "Client instruction",
  internal_task: "Internal task",
  block_assignment: "Block assignment",
};

export const FILE_TASK_TYPE_DESCRIPTIONS: Record<FileTaskType, string> = {
  document_upload: "Request files from the client via the secure upload portal.",
  client_instruction:
    "Text directive for the client (e.g. pay appraisal fee). No upload required.",
  internal_task: "Broker-only checklist item — never shown in the client portal.",
  block_assignment:
    "Client completes specific pipeline data blocks in your chosen order.",
};

export function isFileTaskType(value: string): value is FileTaskType {
  return (FILE_TASK_TYPES as readonly string[]).includes(value);
}

export function defaultPortalVisibleForTaskType(taskType: FileTaskType): boolean {
  return taskType !== "internal_task";
}

export function resolveTaskType(
  raw: string | undefined | null,
): FileTaskType {
  if (raw && isFileTaskType(raw)) return raw;
  return "document_upload";
}

/** Normalize legacy `assignedBlocks: string[]` or ordered entries from Convex. */
export function normalizeAssignedBlockEntries(
  task: {
    assignedBlockEntries?: AssignedBlockEntry[] | null;
    assignedBlocks?: string[] | null;
  },
): AssignedBlockEntry[] {
  const entries = task.assignedBlockEntries;
  if (Array.isArray(entries) && entries.length > 0) {
    return [...entries]
      .filter((e) => typeof e.blockId === "string" && e.blockId.trim())
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const legacy = task.assignedBlocks;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return legacy
      .map((blockId, index) => ({
        blockId: blockId.trim(),
        sortOrder: (index + 1) * 1000,
      }))
      .filter((e) => e.blockId.length > 0);
  }
  return [];
}

export function assignedBlockIdsOrdered(
  task: Parameters<typeof normalizeAssignedBlockEntries>[0],
): string[] {
  return normalizeAssignedBlockEntries(task).map((e) => e.blockId);
}

export function sanitizeAssignedBlockEntries(
  entries: AssignedBlockEntry[],
  allowedBlockIds: ReadonlySet<string>,
): AssignedBlockEntry[] {
  const seen = new Set<string>();
  const out: AssignedBlockEntry[] = [];
  const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
  sorted.forEach((entry, index) => {
    const blockId = entry.blockId.trim();
    if (!blockId || !allowedBlockIds.has(blockId) || seen.has(blockId)) return;
    seen.add(blockId);
    out.push({ blockId, sortOrder: (index + 1) * 1000 });
  });
  return out;
}

/** Legacy sync: flat id list in array order. */
export function toLegacyAssignedBlockIds(
  entries: AssignedBlockEntry[],
): string[] | undefined {
  const ids = entries.map((e) => e.blockId);
  return ids.length > 0 ? ids : undefined;
}

export type FileTaskTypeConfigInput = {
  taskType: FileTaskType;
  clientInstructionText?: string;
  instructionUrl?: string;
  assignedBlockEntries?: AssignedBlockEntry[];
  description?: string;
  dueDate?: number;
  priority?: FileTaskPriority;
};

export function validateTaskTypeConfig(
  config: FileTaskTypeConfigInput,
): string | null {
  if (config.taskType === "client_instruction") {
    const text = config.clientInstructionText?.trim() ?? "";
    const url = config.instructionUrl?.trim() ?? "";
    if (!text && !url) {
      return "Add instruction text or a website link for client instruction tasks.";
    }
  }
  if (config.taskType === "block_assignment") {
    const count = config.assignedBlockEntries?.length ?? 0;
    if (count === 0) {
      return "Select at least one pipeline block for block assignment tasks.";
    }
  }
  return null;
}
