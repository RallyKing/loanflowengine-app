/**
 * Denormalized hub note badge counter helpers.
 * Kept free of mutation/query wrappers so task/file note writers can import
 * without pulling the full `pipelineFileNotes` module graph.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/** Maintain `pipeline.hubNotesCount` on note create/delete. Fail-closed clamp at 0. */
export async function bumpPipelineHubNotesCount(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const file = await ctx.db.get(fileId);
  if (!file) return;
  const current =
    typeof file.hubNotesCount === "number" && Number.isFinite(file.hubNotesCount)
      ? Math.max(0, Math.floor(file.hubNotesCount))
      : 0;
  const next = Math.max(0, current + delta);
  if (next === current && file.hubNotesCount === next) return;
  await ctx.db.patch(fileId, { hubNotesCount: next });
}
