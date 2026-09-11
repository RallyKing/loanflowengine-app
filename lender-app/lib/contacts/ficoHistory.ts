/**
 * Contact FICO score history — current score plus dated prior pulls.
 * `contacts.fico` stays the latest score for deal/CRM sync.
 */

export const FICO_SCORE_MIN = 300;
export const FICO_SCORE_MAX = 850;

export type FicoHistoryEntry = {
  id: string;
  score: number;
  recordedAt: number;
  note?: string;
};

export type FicoTrend = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
};

export function parseFicoScore(
  raw: string | number | null | undefined,
): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const rounded = Math.round(raw);
    if (rounded < FICO_SCORE_MIN || rounded > FICO_SCORE_MAX) return null;
    return rounded;
  }
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < FICO_SCORE_MIN || rounded > FICO_SCORE_MAX) return null;
  return rounded;
}

export function sortFicoHistory(
  entries: readonly FicoHistoryEntry[],
): FicoHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (b.recordedAt !== a.recordedAt) return b.recordedAt - a.recordedAt;
    return b.score - a.score;
  });
}

export function sanitizeFicoHistory(
  entries: readonly FicoHistoryEntry[] | null | undefined,
): FicoHistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: FicoHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const score = parseFicoScore(raw.score);
    const recordedAt = Number(raw.recordedAt);
    if (score == null || !Number.isFinite(recordedAt) || recordedAt <= 0) continue;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `fico-${recordedAt}-${score}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const note =
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note.trim().slice(0, 240)
        : undefined;
    out.push(note ? { id, score, recordedAt, note } : { id, score, recordedAt });
  }
  return sortFicoHistory(out);
}

export function seedFicoHistory(args: {
  fico?: number | null;
  history?: readonly FicoHistoryEntry[] | null;
  fallbackRecordedAt: number;
}): FicoHistoryEntry[] {
  const history = sanitizeFicoHistory(args.history);
  if (history.length > 0) return history;
  const score = parseFicoScore(args.fico);
  if (score == null) return [];
  const recordedAt =
    Number.isFinite(args.fallbackRecordedAt) && args.fallbackRecordedAt > 0
      ? args.fallbackRecordedAt
      : Date.UTC(2020, 0, 1);
  return [
    {
      id: `seed-${score}-${recordedAt}`,
      score,
      recordedAt,
    },
  ];
}

export function currentFicoFromHistory(
  history: readonly FicoHistoryEntry[],
): number | undefined {
  const latest = sortFicoHistory(history)[0];
  return latest?.score;
}

export function ficoTrendFromHistory(
  history: readonly FicoHistoryEntry[],
): FicoTrend {
  const sorted = sortFicoHistory(history);
  const current = sorted[0]?.score ?? null;
  const previous = sorted[1]?.score ?? null;
  if (current == null) {
    return { current: null, previous: null, delta: null, direction: null };
  }
  if (previous == null) {
    return { current, previous: null, delta: null, direction: null };
  }
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

export function applyFicoScore(args: {
  fico?: number | null;
  history?: readonly FicoHistoryEntry[] | null;
  nextScore: number;
  recordedAt: number;
  note?: string;
  now: number;
  fallbackRecordedAt: number;
}): { fico: number; ficoHistory: FicoHistoryEntry[] } {
  const score = parseFicoScore(args.nextScore);
  if (score == null) {
    throw new Error(
      `FICO must be a whole number between ${FICO_SCORE_MIN} and ${FICO_SCORE_MAX}.`,
    );
  }
  const recordedAt = Number(args.recordedAt);
  if (!Number.isFinite(recordedAt) || recordedAt <= 0) {
    throw new Error("Choose a valid date for this FICO pull.");
  }
  const existing = seedFicoHistory({
    fico: args.fico,
    history: args.history,
    fallbackRecordedAt: args.fallbackRecordedAt,
  });
  const latest = existing[0];
  if (
    latest &&
    latest.score === score &&
    sameUtcDay(latest.recordedAt, recordedAt)
  ) {
    const note =
      typeof args.note === "string" && args.note.trim()
        ? args.note.trim().slice(0, 240)
        : latest.note;
    const updated: FicoHistoryEntry = note
      ? { ...latest, recordedAt, note }
      : { id: latest.id, score: latest.score, recordedAt };
    const rest = existing.filter((e) => e.id !== latest.id);
    const ficoHistory = sortFicoHistory([updated, ...rest]);
    return { fico: ficoHistory[0]!.score, ficoHistory };
  }

  const id = `fico-${args.now}-${score}-${recordedAt}`;
  const note =
    typeof args.note === "string" && args.note.trim()
      ? args.note.trim().slice(0, 240)
      : undefined;
  const next: FicoHistoryEntry = note
    ? { id, score, recordedAt, note }
    : { id, score, recordedAt };
  const ficoHistory = sortFicoHistory([next, ...existing]);
  return { fico: ficoHistory[0]!.score, ficoHistory };
}

export function mergeFicoHistories(
  left: readonly FicoHistoryEntry[] | null | undefined,
  right: readonly FicoHistoryEntry[] | null | undefined,
): FicoHistoryEntry[] {
  return sanitizeFicoHistory([
    ...sanitizeFicoHistory(left),
    ...sanitizeFicoHistory(right),
  ]);
}

function sameUtcDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}
