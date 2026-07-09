/** Operator client confidence (1–5). Stored on optional `pipeline.clientMomentum`; unset until the user rates. */

export type ClientMomentumFilterToken = number | "unrated";

/** Returns 1–5 when a valid rating is stored; otherwise `undefined` (unrated). */
export function parseClientMomentum(n: unknown): number | undefined {
  if (n == null) return undefined;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  if (r < 1 || r > 5) return undefined;
  return r;
}

/** Sort key for “high → low”: unrated sinks to the end. */
export function clientMomentumSortKeyDesc(n: unknown): number {
  const p = parseClientMomentum(n);
  return p === undefined ? 0 : p;
}

/** Sort key for “low → high”: unrated sinks to the end. */
export function clientMomentumSortKeyAsc(n: unknown): number {
  const p = parseClientMomentum(n);
  return p === undefined ? Number.POSITIVE_INFINITY : p;
}

export function clientMomentumStarsAscii(n: unknown): string {
  const p = parseClientMomentum(n);
  return p != null ? "★".repeat(p) : "";
}

/** Pipeline hub filter / chip options (OR semantics when multiple selected). */
export const CLIENT_MOMENTUM_FILTER_OPTIONS: ReadonlyArray<{
  value: ClientMomentumFilterToken;
  label: string;
}> = [
  { value: "unrated", label: "Unrated" },
  { value: 5, label: "5★ Highest Confidence" },
  { value: 4, label: "4★ Strong" },
  { value: 3, label: "3★ Moderate" },
  { value: 2, label: "2★ Weak" },
  { value: 1, label: "1★ Low Confidence" },
];
