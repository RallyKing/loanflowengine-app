/**
 * Phase 10 — single naming contract for comment / thread anchors across
 * pipeline files, tasks, lenders, contacts, and library docs.
 *
 * `collaborationThreads.internalNoteKey` and related fields should prefer these builders.
 */
import type { Id } from "@/convex/_generated/dataModel";

export function pipelineBlockAnchor(
  fileId: Id<"pipeline">,
  blockSortKey: string,
): string {
  return `pipeline:${fileId}:block:${blockSortKey}`;
}

export function taskThreadAnchor(taskId: Id<"tasks">): string {
  return `task:${taskId}`;
}

export function lenderNoteAnchor(lenderId: Id<"lenders">): string {
  return `lender:${lenderId}:notes`;
}

export function contactCommentAnchor(contactId: Id<"contacts">): string {
  return `contact:${contactId}:comments`;
}

export function fileMessagesAnchor(fileId: Id<"pipeline">): string {
  return `pipeline:${fileId}:messages`;
}
