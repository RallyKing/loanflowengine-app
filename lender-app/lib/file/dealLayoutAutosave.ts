/** Debounce for layout-only patches (collapse, reorder, visibility). */
export const LAYOUT_PATCH_DEBOUNCE_MS = 500;

/** Suppress autosave briefly after Convex pushes a fresh sheet snapshot. */
export const BACKEND_SYNC_LOCK_MS = 100;

/** Cap conflict/error auto-retries so flush never hammers Convex forever. */
export const PATCH_DEAL_MAX_AUTO_RETRIES = 5;

/** Max backoff between conflict/error retries (ms). */
export const PATCH_DEAL_MAX_RETRY_DELAY_MS = 8_000;

/**
 * Exponential backoff for patchDeal conflict/error retries.
 * Attempt 0 → base debounce; then 1s, 2s, 4s… capped.
 */
export function patchDealRetryDelayMs(failCount: number): number {
  const n = Math.max(0, Math.floor(failCount));
  const delay = LAYOUT_PATCH_DEBOUNCE_MS * 2 ** n;
  return Math.min(PATCH_DEAL_MAX_RETRY_DELAY_MS, delay);
}

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

/**
 * Drop pending keys that already match the latest server sheet (no-op filter).
 */
export function filterNoOpDealChanges<T extends Record<string, unknown>>(
  changes: Partial<T>,
  sheet: T | null | undefined,
): Partial<T> {
  if (!sheet) return { ...changes };
  const out: Partial<T> = {};
  for (const key of Object.keys(changes) as (keyof T)[]) {
    const next = changes[key];
    if (next === undefined) continue;
    if (!sheetFieldValueEqual(sheet[key], next)) {
      out[key] = next;
    }
  }
  return out;
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
