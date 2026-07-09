import Papa from "papaparse";
import {
  FIELD_META,
  LENDER_FIELDS,
  blankLender,
  type Contact,
  type Lender,
  type PhoneNumber,
  type Program,
} from "./schema";

const PROGRAMS_DETAIL_HEADER = "Programs Detail (JSON)";
const CONTACTS_HEADER = "Additional Contacts (JSON)";
const PHONE_NUMBERS_HEADER = "Additional Phones (JSON)";
const RATING_HEADER = "Rating (0-5)";
const RATING_NOTES_HEADER = "Rating Notes";

/**
 * Parse a CSV string (e.g. the Comprehensive_Lender_List.csv or any export with
 * the same headers) into an array of Lender records.
 */
export function parseLenderCsv(csvText: string): Lender[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const out: Lender[] = [];
  for (const row of result.data) {
    const rec = blankLender();
    let empty = true;
    for (const field of LENDER_FIELDS) {
      const header = FIELD_META[field].csvHeader;
      const val = (row[header] ?? "").trim();
      (rec as unknown as Record<string, string>)[field] = val;
      if (val) empty = false;
    }

    // Optional structured programs column — accepts JSON or falls back to
    // `Name | minFico | requirements` one-per-line format.
    const rawPrograms =
      (row[PROGRAMS_DETAIL_HEADER] ?? row["Programs Detail"] ?? "").trim();
    if (rawPrograms) {
      const parsed = parseProgramList(rawPrograms);
      if (parsed.length) rec.programList = parsed;
    }

    const rawContacts = (row[CONTACTS_HEADER] ?? "").trim();
    if (rawContacts) {
      const parsed = parseContactList(rawContacts);
      if (parsed.length) rec.contacts = parsed;
    }

    const rawPhones = (row[PHONE_NUMBERS_HEADER] ?? "").trim();
    if (rawPhones) {
      const parsed = parsePhoneList(rawPhones);
      if (parsed.length) rec.phoneNumbers = parsed;
    }

    const rawRating = (row[RATING_HEADER] ?? "").trim();
    if (rawRating) {
      const n = Number(rawRating);
      if (Number.isFinite(n)) {
        rec.rating = Math.max(0, Math.min(5, Math.round(n)));
        if (n > 0) empty = false;
      }
    }

    const rawRatingNotes = (row[RATING_NOTES_HEADER] ?? "").trim();
    if (rawRatingNotes) {
      rec.ratingNotes = rawRatingNotes;
      empty = false;
    }

    if (empty) continue;
    if (!rec.company) continue;
    if (rec.company.toUpperCase().startsWith("EXAMPLE")) continue;
    out.push(rec);
  }
  return out;
}

function parseProgramList(raw: string): Program[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        return arr
          .map((p: unknown) => {
            const obj = (p ?? {}) as Record<string, unknown>;
            return {
              name: String(obj.name ?? "").trim(),
              minFico: String(obj.minFico ?? "").trim() || undefined,
              requirements: String(obj.requirements ?? "").trim() || undefined,
            };
          })
          .filter((p) => p.name || p.minFico || p.requirements);
      }
    } catch {
      // fall through to pipe format
    }
  }
  // "Name | 680 | DSCR >= 1.1" per line
  return t
    .split(/\r?\n/)
    .map((line) => {
      const [name = "", minFico = "", requirements = ""] = line
        .split("|")
        .map((s) => s.trim());
      return {
        name,
        minFico: minFico || undefined,
        requirements: requirements || undefined,
      };
    })
    .filter((p) => p.name || p.minFico || p.requirements);
}

function serializeProgramList(list: Program[] | undefined): string {
  if (!list || list.length === 0) return "";
  return JSON.stringify(
    list.map((p) => ({
      name: p.name,
      ...(p.minFico ? { minFico: p.minFico } : {}),
      ...(p.requirements ? { requirements: p.requirements } : {}),
    }))
  );
}

function parseContactList(raw: string): Contact[] {
  const t = raw.trim();
  if (!t) return [];
  try {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c: unknown) => {
        const obj = (c ?? {}) as Record<string, unknown>;
        return {
          name: String(obj.name ?? "").trim(),
          titleRole: String(obj.titleRole ?? obj.title ?? "").trim() || undefined,
          phone: String(obj.phone ?? "").trim() || undefined,
          email: String(obj.email ?? "").trim() || undefined,
          notes: String(obj.notes ?? "").trim() || undefined,
        };
      })
      .filter((c) => c.name || c.phone || c.email);
  } catch {
    return [];
  }
}

function serializeContactList(list: Contact[] | undefined): string {
  if (!list || list.length === 0) return "";
  return JSON.stringify(
    list.map((c) => ({
      name: c.name,
      ...(c.titleRole ? { titleRole: c.titleRole } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    }))
  );
}

function parsePhoneList(raw: string): PhoneNumber[] {
  const t = raw.trim();
  if (!t) return [];
  try {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: unknown) => {
        const obj = (p ?? {}) as Record<string, unknown>;
        return {
          label: String(obj.label ?? "").trim() || undefined,
          phone: String(obj.phone ?? "").trim(),
        };
      })
      .filter((p) => p.phone);
  } catch {
    return [];
  }
}

function serializePhoneList(list: PhoneNumber[] | undefined): string {
  if (!list || list.length === 0) return "";
  return JSON.stringify(
    list.map((p) => ({
      ...(p.label ? { label: p.label } : {}),
      phone: p.phone,
    }))
  );
}

/**
 * Build a CSV string from a list of lenders. Includes all standard fields
 * plus a JSON column for the structured programList so round-tripping
 * (export -> re-upload) preserves it.
 */
export function buildLenderCsv(lenders: Lender[]): string {
  const headers = [
    ...LENDER_FIELDS.map((f) => FIELD_META[f].csvHeader),
    PROGRAMS_DETAIL_HEADER,
    CONTACTS_HEADER,
    PHONE_NUMBERS_HEADER,
    RATING_HEADER,
    RATING_NOTES_HEADER,
  ];
  const lines: string[] = [headers.map(csvQuote).join(",")];
  for (const l of lenders) {
    const row = [
      ...LENDER_FIELDS.map((f) => {
        const v = (l as unknown as Record<string, unknown>)[f];
        return typeof v === "string" ? v : v == null ? "" : String(v);
      }),
      serializeProgramList(l.programList),
      serializeContactList(l.contacts),
      serializePhoneList(l.phoneNumbers),
      l.rating ? String(l.rating) : "",
      l.ratingNotes ?? "",
    ];
    lines.push(row.map(csvQuote).join(","));
  }
  return "\uFEFF" + lines.join("\n") + "\n";
}

/** Wrap a value for CSV output: always quoted, doubled inner quotes. */
function csvQuote(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Utility: normalize a string for dedupe keys. */
export function normalizeKey(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Same dedupe rule as the Python build script: (company, email) then (company, name). */
export function dedupeKey(l: Lender): string {
  const company = normalizeKey(l.company);
  const email = (l.email || "").trim().toLowerCase();
  if (email) return `co+em:${company}:${email}`;
  return `co+nm:${company}:${normalizeKey(l.contactName)}`;
}
