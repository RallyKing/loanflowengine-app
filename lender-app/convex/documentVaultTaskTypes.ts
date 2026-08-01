import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { sanitizeAssignedBlockEntries } from "../lib/documentVaultClientBlocks";

export const fileTaskTypeV = v.union(
  v.literal("document_upload"),
  v.literal("client_instruction"),
  v.literal("internal_task"),
  v.literal("block_assignment"),
);

export const assignedBlockEntryV = v.object({
  blockId: v.string(),
  sortOrder: v.number(),
});

export const fileTaskPriorityV = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export type AssignedBlockEntry = {
  blockId: string;
  sortOrder: number;
};

export function normalizeAssignedBlockEntriesFromDoc(
  task: Pick<
    Doc<"documentVaultFileTasks"> | Doc<"documentTaskTemplates">,
    "assignedBlockEntries" | "assignedBlocks"
  >,
): AssignedBlockEntry[] {
  const entries = task.assignedBlockEntries;
  if (Array.isArray(entries) && entries.length > 0) {
    return sanitizeAssignedBlockEntries(entries);
  }
  const legacy = task.assignedBlocks;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return sanitizeAssignedBlockEntries(
      legacy.map((blockId, index) => ({
        blockId,
        sortOrder: (index + 1) * 1000,
      })),
    );
  }
  return [];
}

export function resolveTaskTypeFromDoc(
  task: { taskType?: Doc<"documentVaultFileTasks">["taskType"] },
): NonNullable<Doc<"documentVaultFileTasks">["taskType"]> {
  return task.taskType ?? "document_upload";
}

export function persistAssignedBlocksPatch(
  entries: AssignedBlockEntry[],
): {
  assignedBlockEntries: AssignedBlockEntry[] | undefined;
  assignedBlocks: string[] | undefined;
} {
  const sanitized = sanitizeAssignedBlockEntries(entries);
  if (sanitized.length === 0) {
    return { assignedBlockEntries: undefined, assignedBlocks: undefined };
  }
  return {
    assignedBlockEntries: sanitized,
    assignedBlocks: sanitized.map((e) => e.blockId),
  };
}
