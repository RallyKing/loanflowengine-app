import { isOfflineConflictError } from "@/lib/offline/conflict";

type WithExpectedUpdatedAt = {
  expectedUpdatedAt?: number;
};

/**
 * Runs a pipeline (or similar) mutation that may carry `expectedUpdatedAt`.
 * On `CONFLICT_DATA_CHANGED`, retries once without the guard so intentional
 * field edits are not blocked by concurrent background writers (term-options
 * debounce, drawer layout, shared-bus patches) that bump `updatedAt`.
 */
export async function patchWithConflictRetry<
  TArgs extends WithExpectedUpdatedAt,
  TResult,
>(args: TArgs, run: (args: TArgs) => Promise<TResult>): Promise<TResult> {
  try {
    return await run(args);
  } catch (e) {
    if (!isOfflineConflictError(e) || args.expectedUpdatedAt === undefined) {
      throw e;
    }
    const { expectedUpdatedAt: _ignored, ...rest } = args;
    return await run(rest as TArgs);
  }
}

/** True when the only meaningful patch field is `termOptions` (background sync). */
export function isTermOptionsOnlyPipelinePatch(
  args: Record<string, unknown>,
): boolean {
  const keys = Object.keys(args).filter((k) => {
    if (k === "id" || k === "preferencesAccountId" || k === "expectedUpdatedAt") {
      return false;
    }
    return args[k] !== undefined;
  });
  return keys.length === 1 && keys[0] === "termOptions";
}
