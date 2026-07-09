import { getConvexSubDiagnostics, isConvexSubDebugEnabled } from "@/lib/convexSubDiagnostics";

type ConvexBrowserLogger = {
  logVerbose(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

/**
 * Delegates to the browser console like Convex’s default logger, but drops
 * noisy errors for optional task-attachment queries when the deployment is
 * missing those UDFs (wrap reads in `ConvexQueryBoundary` where needed).
 *
 * Pass `{ verbose: true }` (or set `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` via
 * {@link ConvexClientProvider}) to mirror Convex subscription churn in the console.
 */
export function createConvexBrowserLogger(options?: {
  verbose?: boolean;
}): ConvexBrowserLogger {
  const verbose = options?.verbose ?? false;
  return {
    logVerbose: (...args: unknown[]) => {
      if (!verbose && !isConvexSubDebugEnabled()) return;
      if (isConvexSubDebugEnabled()) {
        getConvexSubDiagnostics().recordVerboseLine(...args);
      }
      if (verbose) console.log("[convex verbose]", ...args);
    },
    log: (...args: unknown[]) => {
      console.log(...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(...args);
    },
    error: (...args: unknown[]) => {
      const blob = args
        .map((a) => (typeof a === "string" ? a : String(a)))
        .join(" ");
      if (
        /\[CONVEX Q\(tasks:(listTaskFiles|countTaskFilesForTasks)\)\]/i.test(
          blob
        ) ||
        (/tasks:(listTaskFiles|countTaskFilesForTasks)/i.test(blob) &&
          /Could not find public function/i.test(blob))
      ) {
        return;
      }
      console.error(...args);
    },
  };
}
