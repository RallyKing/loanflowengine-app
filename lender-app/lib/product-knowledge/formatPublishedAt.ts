/**
 * Format a product-release `publishedAt` (UTC epoch ms) for the Updates bell.
 * Prefer the account timezone (`displaySettings.timezone`, default America/Chicago).
 * Never forces `timeZone: "UTC"` for display.
 */

import {
  DEFAULT_VIEWER_TIMEZONE,
  formatDateTimeInTimeZone,
  normalizeViewerTimeZone,
} from "@/lib/dateTimeZone";

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

/**
 * Wall clock in the viewer's preferred IANA zone (default Central).
 * Pass `timeZone` from `resolveViewerTimeZone(displaySettings)`.
 */
export function formatPublishedAt(
  ms: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!isValidPublishedAt(ms)) return "";
  return formatDateTimeInTimeZone(ms, normalizeViewerTimeZone(timeZone), {
    dateStyle: "medium",
    includeSeconds: false,
    includeTimeZoneName: true,
  });
}
