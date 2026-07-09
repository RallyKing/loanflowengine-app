import type { Doc } from "./_generated/dataModel";
import { resolveRowOwnerUserId } from "./resourceAccess";

/** Assignee, owner, and shares — minus the acting user (if any). */
export function collectPipelineWatcherUserKeys(
  file: Doc<"pipeline">,
  actorUserKey: string | undefined,
): string[] {
  const actor = actorUserKey?.trim() ?? "";
  const keys = new Set<string>();
  const owner = resolveRowOwnerUserId(file);
  if (owner) keys.add(owner);
  const assignee = file.assigneeId?.trim();
  if (assignee) keys.add(assignee);
  for (const s of file.sharedWithIds ?? []) {
    const t = s.trim();
    if (t) keys.add(t);
  }
  if (actor) keys.delete(actor);
  return [...keys];
}
