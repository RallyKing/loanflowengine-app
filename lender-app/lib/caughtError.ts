/**
 * Normalize values thrown through React error boundaries or caught in handlers.
 * Avoids treating non-Errors (including accidental SyntheticEvent leakage) as
 * structured Error instances with empty messages.
 */
export function toDisplayError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  if (error == null) return new Error("Unknown error");
  if (typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return new Error(m);
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}
