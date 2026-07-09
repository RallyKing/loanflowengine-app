/**
 * Convex `db.patch` / `db.replace` reject `undefined` anywhere in the payload.
 * JSON args usually omit `undefined`, but server-side object spreads can reintroduce it.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/** Recursively remove keys whose value is `undefined`. Preserves `null`. */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

/** Top-level + deep strip for table patch objects. */
export function sanitizeDbPatch<T extends Record<string, unknown>>(patch: T): T {
  const top = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as T;
  return stripUndefinedDeep(top);
}
