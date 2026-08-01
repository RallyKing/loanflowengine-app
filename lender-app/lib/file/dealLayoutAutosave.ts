/** Debounce for layout-only patches (collapse, reorder, visibility). */
export const LAYOUT_PATCH_DEBOUNCE_MS = 500;

/** Suppress autosave briefly after Convex pushes a fresh sheet snapshot. */
export const BACKEND_SYNC_LOCK_MS = 100;

export function layoutPayloadJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function sheetFieldValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === "object" && typeof b === "object") {
    return layoutPayloadJsonEqual(a, b);
  }
  return false;
}

/** Deep equality for intake sheet snapshots (reference-safe for Convex subscriptions). */
export function dealSheetDeepEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!sheetFieldValueEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Merge server sheet into local draft without touching dirty / in-flight keys.
 * Returns `prev` when nothing materially changed (stable reference).
 */
export function mergeServerSheetIntoDraft<T extends Record<string, unknown>>(
  prev: T,
  sheet: T,
  dirty: Partial<T>,
  flushing: Set<string>,
  mergeBlocked: Set<string> = new Set(),
): T {
  const next = { ...prev } as T;
  let changed = false;
  for (const key of Object.keys(sheet) as (keyof T)[]) {
    if (Object.prototype.hasOwnProperty.call(dirty, key)) continue;
    if (flushing.has(key as string)) continue;
    if (mergeBlocked.has(key as string)) continue;
    const incoming = sheet[key];
    if (!sheetFieldValueEqual(prev[key], incoming)) {
      (next as Record<string, unknown>)[key as string] = incoming;
      changed = true;
    }
  }
  return changed ? next : prev;
}

export type DebouncedFlushHandle = {
  /** Schedule flush after delay — no-op when not dirty or blocked. */
  schedule: (delayMs: number) => void;
  cancel: () => void;
};

/**
 * Event-driven debounced flush — no idle polling. Only runs when `isDirty` is true
 * at schedule time and again when the timer fires.
 */
export function createDebouncedFlush(
  flush: () => void | Promise<void>,
  isDirty: () => boolean,
  isBlocked: () => boolean,
): DebouncedFlushHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingDelayMs = LAYOUT_PATCH_DEBOUNCE_MS;

  return {
    schedule(delayMs: number) {
      if (!isDirty()) return;
      if (isBlocked()) return;
      pendingDelayMs = delayMs;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!isDirty() || isBlocked()) return;
        void flush();
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
