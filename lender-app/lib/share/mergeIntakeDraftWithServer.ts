/**
 * Merge a server intake snapshot into the local share draft without overwriting
 * top-level fields the guest is currently editing (keys still in the autosave
 * queue). Used by `ShareView` so Convex subscription updates do not race with
 * in-flight local edits.
 */
export function mergeIntakeDraftWithServer<T extends Record<string, unknown>>(
  prev: T | null,
  incoming: T,
  pendingKeys: ReadonlySet<string>,
): T {
  if (!prev) return incoming;
  const next = { ...prev } as T;
  let changed = false;
  for (const key of Object.keys(incoming)) {
    if (pendingKeys.has(key)) continue;
    if (prev[key] !== incoming[key]) {
      (next as Record<string, unknown>)[key] = incoming[key];
      changed = true;
    }
  }
  return changed ? next : prev;
}
