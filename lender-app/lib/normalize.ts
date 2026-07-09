/**
 * Small set of deterministic string normalizers so every record in the
 * database looks the same regardless of how it was entered (manual form,
 * CSV upload, AI discovery import, legacy pipeline, etc.).
 */

/**
 * Turn any phone input into one of:
 *   - ""                         -> ""     (pass-through empty)
 *   - 10 digits                  -> "(555) 123-4567"
 *   - 11 digits starting with 1  -> "(555) 123-4567"
 *   - 11 digits other country    -> "+X 555-123-4567"
 *   - with extension             -> "(555) 123-4567 x1234"
 *   - unrecognized               -> trimmed original
 *
 * We never throw — the worst case is returning the trimmed input.
 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  // Split extension (x, ext, extension, # )
  const extMatch = trimmed.match(
    /(?:\s*(?:x|ext\.?|extension|#)\s*([0-9]{1,6}))\s*$/i
  );
  let ext = "";
  let body = trimmed;
  if (extMatch) {
    ext = extMatch[1];
    body = trimmed.slice(0, extMatch.index).trim();
  }

  const digits = body.replace(/\D+/g, "");
  if (!digits) return trimmed; // unknown format, keep as-is

  let core: string;
  if (digits.length === 10) {
    core = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    core = `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 7) {
    core = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else if (digits.length > 10) {
    // Assume leading country code is 1-3 digits.
    const ccLen = digits.length - 10;
    const cc = digits.slice(0, ccLen);
    const rest = digits.slice(ccLen);
    core = `+${cc} (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  } else {
    return trimmed;
  }

  return ext ? `${core} x${ext}` : core;
}

export function normalizeEmail(raw: string | undefined | null): string {
  if (!raw) return "";
  return String(raw).trim().toLowerCase();
}

/**
 * Normalize a website URL. We:
 *   - trim whitespace
 *   - strip any surrounding angle brackets / quotes
 *   - drop trailing slash
 *   - leave the protocol alone if present, strip it if not (display form)
 */
export function normalizeWebsite(raw: string | undefined | null): string {
  if (!raw) return "";
  let v = String(raw).trim().replace(/^[<"']+|[>"']+$/g, "");
  if (!v) return "";
  // Collapse whitespace inside
  v = v.replace(/\s+/g, "");
  // Drop trailing slash (keep path-level slashes)
  v = v.replace(/\/+$/g, "");
  // Lowercase host but preserve path case
  try {
    const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const u = new URL(withProto);
    const host = u.host.toLowerCase();
    const path = u.pathname === "/" ? "" : u.pathname;
    const originalHadProto = /^https?:\/\//i.test(v);
    return originalHadProto ? `${u.protocol}//${host}${path}${u.search}` : `${host}${path}${u.search}`;
  } catch {
    return v.toLowerCase();
  }
}

/** Collapse runs of whitespace and trim. Safe for any free-text field. */
export function normalizeWhitespace(raw: string | undefined | null): string {
  if (!raw) return "";
  return String(raw).replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * Normalize a 2-letter US state list — accepts messy input like
 *   "fl, texas; CA, cal"
 * and returns "CA, FL, TX" (uniq, upper-cased, comma+space).
 * If input doesn't look like a list of states (e.g. "Nationwide except HI"),
 * we just collapse whitespace and return as-is.
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

export function normalizeStates(raw: string | undefined | null): string {
  if (!raw) return "";
  const original = String(raw).trim();
  if (!original) return "";

  const lower = original.toLowerCase();
  if (
    lower.includes("nationwide") ||
    lower.includes("all 50") ||
    lower.includes("except") ||
    lower.includes("all states") ||
    lower.includes("50 states")
  ) {
    return normalizeWhitespace(original);
  }

  const tokens = original
    .split(/[,;/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return original;

  const codes = new Set<string>();
  let unrecognized = 0;
  for (const t of tokens) {
    const upper = t.toUpperCase();
    if (upper.length === 2 && STATE_CODES.has(upper)) {
      codes.add(upper);
      continue;
    }
    const asName = STATE_NAME_TO_CODE[t.toLowerCase()];
    if (asName) {
      codes.add(asName);
      continue;
    }
    unrecognized += 1;
  }

  // If most tokens are unrecognized, fall back to the original phrase.
  if (unrecognized > tokens.length / 2) return normalizeWhitespace(original);
  if (codes.size === 0) return normalizeWhitespace(original);

  return Array.from(codes).sort().join(", ");
}
