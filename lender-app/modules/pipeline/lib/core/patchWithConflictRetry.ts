import { isOfflineConflictError } from "@/lib/offline/conflict";

type WithExpectedUpdatedAt = {
  expectedUpdatedAt?: number;
};

/**
 * True when Convex redacted the real Uncaught Error to a bare "Server Error"
 * wrapper (common in production). OCC conflicts then look identical to other
 * failures in `Error.message`, so callers must retry by policy, not message.
 */
export function isRedactedConvexServerError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/\[CONVEX [MQA]\(/i.test(msg)) return false;
  if (!/Server Error/i.test(msg)) return false;
  // If a more specific uncaught / validation line is present, do not treat as redacted.
  if (/Uncaught Error:/i.test(msg)) return false;
  if (/ArgumentValidationError:/i.test(msg)) return false;
  return true;
}

/**
 * Runs a pipeline (or similar) mutation that may carry `expectedUpdatedAt`.
 * On OCC conflict — or a production-redacted "Server Error" that is almost
 * always that conflict when a guard was sent — retries once without the guard
 * so intentional File Details edits (scenario, TERM, etc.) are not blocked by
 * concurrent background writers (term-options, drawer layout, patchDeal).
 */
export async function patchWithConflictRetry<
  TArgs extends WithExpectedUpdatedAt,
  TResult,
>(args: TArgs, run: (args: TArgs) => Promise<TResult>): Promise<TResult> {
  try {
    return await run(args);
  } catch (e) {
    if (args.expectedUpdatedAt === undefined) {
      throw e;
    }
    const shouldRetry =
      isOfflineConflictError(e) || isRedactedConvexServerError(e);
    if (!shouldRetry) {
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
    if (
      k === "id" ||
      k === "preferencesAccountId" ||
      k === "memberUserKey" ||
      k === "expectedUpdatedAt"
    ) {
      return false;
    }
    return args[k] !== undefined;
  });
  return keys.length === 1 && keys[0] === "termOptions";
}

