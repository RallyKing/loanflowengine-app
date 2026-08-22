/**
 * HTML date inputs require YYYY-MM-DD. Legacy REO / business-debt rows
 * often store MM/DD/YYYY, M/D/YY, or ISO datetimes — those look "broken"
 * in `<input type="date">` (blank, non-editable) until normalized.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const US_SLASH = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (year < 1800 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function expandYear(raw: string): number {
  if (raw.length === 2) {
    const n = Number(raw);
    return n > 50 ? 1900 + n : 2000 + n;
  }
  return Number(raw);
}

/** Persist / compare as YYYY-MM-DD, or "" when empty / unparseable. */
export function normalizeScheduleDateInput(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return "";
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  const s = String(raw).trim();
  if (!s) return "";

  const iso = s.match(ISO_DAY);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidYmd(year, month, day) ? ymd(year, month, day) : "";
  }

  const slash = s.match(US_SLASH);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = expandYear(slash[3]!);
    return isValidYmd(year, month, day) ? ymd(year, month, day) : "";
  }

  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return "";
  const d = new Date(parsed);
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Controlled `<input type="date">` value — never a non-ISO string. */
export function toHtmlDateInputValue(raw: unknown): string {
  return normalizeScheduleDateInput(raw);
}

/** Coerce deal-row scalars so Convex string validators accept them. */
export function coerceScheduleString(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return undefined;
}
