/**
 * Shared viewer timezone helpers (IANA).
 * Default wall clock: America/Chicago (US Central). Preference lives in
 * `userPreferences.displaySettings.timezone` — no parallel settings store.
 */

export const DEFAULT_VIEWER_TIMEZONE = "America/Chicago";

/** Curated IANA options for Settings + Link repository. */
export const VIEWER_TIMEZONE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "UTC", label: "UTC" },
];

export function isValidIanaTimeZone(timeZone: string): boolean {
  const tz = timeZone.trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizeViewerTimeZone(
  timeZone: string | null | undefined,
): string {
  if (typeof timeZone === "string" && isValidIanaTimeZone(timeZone)) {
    return timeZone.trim();
  }
  return DEFAULT_VIEWER_TIMEZONE;
}

/** Read IANA zone from `userPreferences.displaySettings` (default Central). */
export function resolveViewerTimeZone(
  displaySettings: Record<string, unknown> | null | undefined,
): string {
  if (!displaySettings || typeof displaySettings !== "object") {
    return DEFAULT_VIEWER_TIMEZONE;
  }
  const raw = displaySettings.timezone;
  return normalizeViewerTimeZone(
    typeof raw === "string" ? raw : undefined,
  );
}

/** Merge timezone into displaySettings; empty/null clears to default-on-read. */
export function mergeDisplaySettingsTimezone(
  displaySettings: Record<string, unknown>,
  timezone: string | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...displaySettings };
  if (timezone == null || timezone === "") {
    delete next.timezone;
    return next;
  }
  const t = timezone.trim();
  if (!isValidIanaTimeZone(t)) return displaySettings;
  next.timezone = t;
  return next;
}

export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Local Y/M/D/h/m/s in an IANA timezone via `Intl` (no extra deps). */
export function zonedParts(
  date: Date,
  timeZone: string,
): ZonedDateTimeParts {
  const tz = normalizeViewerTimeZone(timeZone);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = get("hour");
  // Some engines report midnight as 24 under hourCycle h23.
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const local = zonedParts(at, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return asUtc - at.getTime();
}

/**
 * Convert a wall-clock civil time in `timeZone` to a UTC epoch ms.
 * Two-pass offset correction handles DST boundaries reasonably.
 */
export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const tz = normalizeViewerTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offset1 = timeZoneOffsetMs(new Date(guess), tz);
  const utc1 = guess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(utc1), tz);
  return guess - offset2;
}

/** Format epoch ms for display in the viewer's preferred zone (with short TZ). */
export function formatDateTimeInTimeZone(
  ms: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
  options?: {
    includeSeconds?: boolean;
    includeTimeZoneName?: boolean;
    dateStyle?: "short" | "medium";
  },
): string {
  if (!Number.isFinite(ms)) return "";
  const tz = normalizeViewerTimeZone(timeZone);
  const includeSeconds = options?.includeSeconds === true;
  const includeTimeZoneName = options?.includeTimeZoneName !== false;
  const dateStyle = options?.dateStyle ?? "short";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      ...(dateStyle === "medium"
        ? { month: "short", day: "numeric", year: "numeric" }
        : { month: "numeric", day: "numeric", year: "numeric" }),
      hour: "numeric",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {}),
      ...(includeTimeZoneName ? { timeZoneName: "short" } : {}),
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString("en-US");
  }
}

/** Short zone label at an instant (e.g. `CDT`, `CST`, `UTC`). */
export function formatTimeZoneShortName(
  ms: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  const tz = normalizeViewerTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date(ms));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/** Friendly label for Settings / Link repository chrome. */
export function viewerTimeZoneOptionLabel(timeZone: string): string {
  const tz = normalizeViewerTimeZone(timeZone);
  const known = VIEWER_TIMEZONE_OPTIONS.find((o) => o.value === tz);
  if (known) return known.label;
  return tz;
}

/**
 * `datetime-local` value (`YYYY-MM-DDTHH:mm`) for wall time in `timeZone`.
 * Do not use `Date#getHours()` — that is browser-local, not preference-local.
 */
export function toDatetimeLocalValueInTimeZone(
  ms: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  const p = zonedParts(new Date(ms), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Parse a `datetime-local` string as wall time in `timeZone` → UTC epoch ms.
 * Avoid `new Date(value)` which treats the string as browser-local.
 */
export function fromDatetimeLocalValueInTimeZone(
  value: string,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] != null ? Number(m[6]) : 0;
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
    return null;
  }
  const ms = zonedWallTimeToUtcMs(
    year,
    month,
    day,
    hour,
    minute,
    second,
    timeZone,
  );
  return Number.isFinite(ms) ? ms : null;
}

/** Compact remaining label for portal link rows (`82d remaining`, `3h remaining`). */
export function formatRemainingUntil(
  expiresAtMs: number,
  nowMs: number = Date.now(),
): string {
  const delta = expiresAtMs - nowMs;
  if (delta <= 0) return "Expired";
  const hours = Math.floor(delta / (60 * 60 * 1000));
  if (hours < 48) return `${hours}h remaining`;
  const days = Math.floor(hours / 24);
  return `${days}d remaining`;
}
