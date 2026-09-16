import {
  isPatchPipelineConflictResult,
  stripOccForOnlineQuietPipelinePatch,
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
 * timestamp races into silent last-writer-wins for those keys.
 *
 * Online quiet-only Scenario / criteria / termOptions patches strip
 * `expectedUpdatedAt` before the call (deal autosave race). Offline callers
 * must enqueue with `expectedUpdatedAt` intact so flush still OCC-protects.
 */
export async function runPipelinePatchHandlingConflict<
  TArgs extends PatchArgsWithOcc,
>(
  patch: (args: TArgs) => Promise<PatchPipelineResult>,
  payload: TArgs,
  onConflict?: (conflict: PatchPipelineConflict) => void,
): Promise<PatchPipelineSuccess> {
  const onlinePayload = stripOccForOnlineQuietPipelinePatch(payload);
  const result = await patch(onlinePayload);
  if (!isPatchPipelineConflictResult(result)) {
    return result;
  }
  onConflict?.(result);
  throw new Error("File changed elsewhere — try saving again.");
}

/** @deprecated Use `runPipelinePatchHandlingConflict` — no payload retry. */
export const runPipelinePatchWithConflictRetry =
  runPipelinePatchHandlingConflict;
