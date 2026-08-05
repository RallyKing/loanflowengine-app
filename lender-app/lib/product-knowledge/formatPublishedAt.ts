/**
 * Format a product-release `publishedAt` (UTC epoch ms) for the Updates bell.
 * Always uses the viewer's locale + local timezone — never forces UTC.
 */

/** Earliest plausible product-release timestamp (2020-01-01 UTC). */
export const MIN_VALID_PUBLISHED_AT_MS = 1_577_836_800_000;

export function isValidPublishedAt(ms: unknown): ms is number {
  return (
    typeof ms === "number" &&
    Number.isFinite(ms) &&
    ms >= MIN_VALID_PUBLISHED_AT_MS
  );
}

/**
 * Normalize operator/seed `publishedAt` values.
 * Rejects 0 / epoch / NaN so they never bury posts at the bottom of the feed
 * or display as 1969/1970.
 */
export function normalizePublishedAt(
  ms: number | undefined | null,
  fallbackMs: number,
): number {
  if (isValidPublishedAt(ms)) return ms;
  return fallbackMs;
}

/** Viewer-local wall clock (browser locale + timezone). */
export function formatPublishedAt(ms: number): string {
  if (!isValidPublishedAt(ms)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      // Explicit local zone — do not pass timeZone: "UTC".
      timeZoneName: "short",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}
