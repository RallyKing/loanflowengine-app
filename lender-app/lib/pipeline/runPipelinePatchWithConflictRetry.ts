import {
  isPatchPipelineConflictResult,
  type PatchPipelineConflict,
  type PatchPipelineResult,
  type PatchPipelineSuccess,
} from "@/lib/pipeline/patchPipelineResult";

type PatchArgsWithOcc = {
  expectedUpdatedAt?: number;
};

/**
 * Soft OCC from `pipeline.patch` (same posture as `patchDeal`): never retry the
 * same field payload with a bumped `expectedUpdatedAt` — that would convert
 * timestamp races into silent last-writer-wins for those keys (including
 * concurrent same-field edits). Callers surface the conflict and let the user
 * (or a later dirty flush with fresh `updatedAt`) save again.
 *
 * Scratch-only Scenario / criteria / termOptions patches skip OCC on the server
 * so they do not fail when deal autosave bumps `pipeline.updatedAt`.
 */
export async function runPipelinePatchHandlingConflict<
  TArgs extends PatchArgsWithOcc,
>(
  patch: (args: TArgs) => Promise<PatchPipelineResult>,
  payload: TArgs,
  onConflict?: (conflict: PatchPipelineConflict) => void,
): Promise<PatchPipelineSuccess> {
  const result = await patch(payload);
  if (!isPatchPipelineConflictResult(result)) {
    return result;
  }
  onConflict?.(result);
  throw new Error("File changed elsewhere — try saving again.");
}

/** @deprecated Use `runPipelinePatchHandlingConflict` — no payload retry. */
export const runPipelinePatchWithConflictRetry =
  runPipelinePatchHandlingConflict;
