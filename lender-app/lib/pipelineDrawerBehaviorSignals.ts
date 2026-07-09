/**
 * Lightweight drawer usage signals (local only). Feeds block recommendations;
 * not sent to the server except as aggregated hints.
 */

const STORAGE_KEY = "dlc.pipeline-drawer-behavior.v1";
const MAX_KEYS = 40;

type StoredV1 = {
  /** Expand-open counts per block id */
  expandCounts: Record<string, number>;
};

function readStore(): StoredV1 {
  if (typeof window === "undefined") return { expandCounts: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { expandCounts: {} };
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return { expandCounts: {} };
    }
    const expandCounts = (p as StoredV1).expandCounts;
    if (!expandCounts || typeof expandCounts !== "object") {
      return { expandCounts: {} };
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(expandCounts)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[k] = Math.min(10_000, Math.floor(v));
      }
    }
    return { expandCounts: out };
  } catch {
    return { expandCounts: {} };
  }
}

function writeStore(s: StoredV1): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(s.expandCounts);
    if (keys.length > MAX_KEYS) {
      const sorted = keys.sort(
        (a, b) => (s.expandCounts[b] ?? 0) - (s.expandCounts[a] ?? 0),
      );
      const next: Record<string, number> = {};
      for (const k of sorted.slice(0, MAX_KEYS)) {
        next[k] = s.expandCounts[k] ?? 0;
      }
      s = { expandCounts: next };
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

/** Call when the user expands a drawer section (not when collapsing). */
export function recordPipelineDrawerSectionExpanded(blockId: string): void {
  if (!blockId || typeof blockId !== "string") return;
  const s = readStore();
  s.expandCounts[blockId] = (s.expandCounts[blockId] ?? 0) + 1;
  writeStore(s);
}

/** Block ids most often expanded recently (by count), capped. */
export function getTopExpandedPipelineDrawerBlocks(limit = 8): string[] {
  const { expandCounts } = readStore();
  return Object.entries(expandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}
