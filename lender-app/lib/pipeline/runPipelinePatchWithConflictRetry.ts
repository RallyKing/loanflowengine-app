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
 * Soft OCC from `pipeline.patch`: retry once with `serverUpdatedAt` so inline
 * Scenario (and other file fields) still save when deal autosave raced the row.
 */
export async function runPipelinePatchWithConflictRetry<
  TArgs extends PatchArgsWithOcc,
>(
  patch: (args: TArgs) => Promise<PatchPipelineResult>,
  payload: TArgs,
  onExhaustedConflict?: (conflict: PatchPipelineConflict) => void,
): Promise<PatchPipelineSuccess> {
  const first = await patch(payload);
  if (!isPatchPipelineConflictResult(first)) {
    return first;
  }
  const retry = await patch({
    ...payload,
    expectedUpdatedAt: first.serverUpdatedAt,
  });
  if (!isPatchPipelineConflictResult(retry)) {
    return retry;
  }
  onExhaustedConflict?.(retry);
  throw new Error("File changed elsewhere — try saving again.");
}
