/**
 * Pipeline file snooze helpers. Stored value may be legacy Unix ms (number) or
 * ISO 8601 string; both are supported for reads.
 */

export function snoozedUntilToMs(
  v: string | number | undefined | null,
): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** True when a snooze end time exists and is still in the future. */
export function isCurrentlySnoozed(
  v: string | number | undefined | null,
  now = Date.now(),
): boolean {
  const ms = snoozedUntilToMs(v);
  return ms != null && ms > now;
}

/**
 * Given a calendar day as local midnight (same convention as InlineDate's
 * fromInputValue), return end of that local calendar day (23:59:59.999).
 */
export function endOfLocalCalendarDayMs(startOfLocalDayMs: number): number {
  const d = new Date(startOfLocalDayMs);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

/** Start of local day for "tomorrow" / preset offsets (midnight). */
export function startOfLocalDayOffsetMs(dayOffset: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}
