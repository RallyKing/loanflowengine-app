/**
 * Phase 32.2 — task attempt snooze preset computation (client + server).
 */

export type TaskSnoozeDefaults = {
  timezone: string;
  nextMorningHour: number;
  nextMorningMinute: number;
};

export const DEFAULT_TASK_SNOOZE_DEFAULTS: TaskSnoozeDefaults = {
  timezone: "America/Chicago",
  nextMorningHour: 8,
  nextMorningMinute: 0,
};

export type TaskSnoozePresetKey =
  | "next_morning"
  | "3_days"
  | "5_days"
  | "1_week";

export const TASK_SNOOZE_PRESET_LABELS: Record<TaskSnoozePresetKey, string> = {
  next_morning: "Next morning",
  "3_days": "3 days",
  "5_days": "5 days",
  "1_week": "1 week",
};

export function normalizeTaskSnoozeDefaults(
  raw: TaskSnoozeDefaults | null | undefined,
): TaskSnoozeDefaults {
  if (!raw) return DEFAULT_TASK_SNOOZE_DEFAULTS;
  const hour = Number(raw.nextMorningHour);
  const minute = Number(raw.nextMorningMinute);
  const timezone =
    typeof raw.timezone === "string" && raw.timezone.trim()
      ? raw.timezone.trim()
      : DEFAULT_TASK_SNOOZE_DEFAULTS.timezone;
  return {
    timezone,
    nextMorningHour:
      Number.isFinite(hour) && hour >= 0 && hour <= 23
        ? Math.floor(hour)
        : DEFAULT_TASK_SNOOZE_DEFAULTS.nextMorningHour,
    nextMorningMinute:
      Number.isFinite(minute) && minute >= 0 && minute <= 59
        ? Math.floor(minute)
        : DEFAULT_TASK_SNOOZE_DEFAULTS.nextMorningMinute,
  };
}

/** Local Y/M/D in IANA timezone via `Intl` (no extra deps). */
function localPartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Approximate offset ms between UTC instant and org-local wall clock. */
function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const local = localPartsInTimeZone(at, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  return asUtc - at.getTime();
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  return guess - offset;
}

export function computeNextMorningUntil(
  nowMs: number,
  defaults: TaskSnoozeDefaults,
): number {
  const d = normalizeTaskSnoozeDefaults(defaults);
  const local = localPartsInTimeZone(new Date(nowMs), d.timezone);
  const targetToday = zonedTimeToUtc(
    local.year,
    local.month,
    local.day,
    d.nextMorningHour,
    d.nextMorningMinute,
    d.timezone,
  );
  if (targetToday > nowMs) return targetToday;
  const nextDay = new Date(
    zonedTimeToUtc(
      local.year,
      local.month,
      local.day + 1,
      d.nextMorningHour,
      d.nextMorningMinute,
      d.timezone,
    ),
  );
  return nextDay.getTime();
}

export function computeSnoozeUntilFromPreset(
  preset: TaskSnoozePresetKey,
  nowMs: number,
  defaults?: TaskSnoozeDefaults | null,
): number {
  switch (preset) {
    case "next_morning":
      return computeNextMorningUntil(nowMs, normalizeTaskSnoozeDefaults(defaults));
    case "3_days":
      return nowMs + 3 * 86_400_000;
    case "5_days":
      return nowMs + 5 * 86_400_000;
    case "1_week":
      return nowMs + 7 * 86_400_000;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export function formatSnoozeUntilLabel(untilMs: number): string {
  return new Date(untilMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
