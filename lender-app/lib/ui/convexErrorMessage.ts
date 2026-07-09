/**
 * Phase 18.8A — stable Convex error → user-facing message mapping.
 * Keeps UI actionable without leaking stack traces.
 */

export function convexClientErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const anyErr = error as Record<string, unknown>;
    const data = anyErr.data;
    if (typeof data === "string" && data.trim()) return data;
  }
  return error instanceof Error ? error.message : String(error);
}

