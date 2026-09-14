/**
 * Hermes/ops payload parsers for DC award radar.
 *
 * Convex mutations receive already-parsed, bounded row arrays. Parsing stays
 * in CLI / UI so Convex never scrapes, polls, or reads files.
 */

import {
  DC_AWARD_CONTACT_FIELD_KEYS,
  DC_AWARD_OPERATOR_UPSERT_MAX_ROWS,
  isDcAwardRadarConfidence,
  pickDefinedContactFields,
  type DcAwardRadarContactFields,
  type DcAwardRadarSeedRow,
} from "./dcAwardRadar";

export { DC_AWARD_OPERATOR_UPSERT_MAX_ROWS };

export type DcAwardRadarContactOnlyRow = DcAwardRadarContactFields & {
  sourceKey?: string;
  sourceUrl?: string;
  projectOrCampus?: string;
  stageSignal?: string;
};

export type ParseDcAwardRadarPayloadResult<T> = {
  rows: T[];
  format: "json" | "csv";
};

const HEADER_ALIASES: Record<string, string> = {
  market: "market",
  project_or_campus: "projectOrCampus",
  projectorcampus: "projectOrCampus",
  project: "projectOrCampus",
  stage_signal: "stageSignal",
  stagesignal: "stageSignal",
  stage: "stageSignal",
  trade_focus: "tradeFocus",
  tradefocus: "tradeFocus",
  company: "company",
  role_if_known: "roleIfKnown",
  roleifknown: "roleIfKnown",
  signal_date: "signalDate",
  signaldate: "signalDate",
  source_url: "sourceUrl",
  sourceurl: "sourceUrl",
  source_type: "sourceType",
  sourcetype: "sourceType",
  confidence: "confidence",
  why_it_matters_for_dlc: "whyItMattersForDlc",
  whyitmattersfordlc: "whyItMattersForDlc",
  why_it_matters: "whyItMattersForDlc",
  notes: "notes",
  contact_name: "contactName",
  contactname: "contactName",
  contact_title: "contactTitle",
  contacttitle: "contactTitle",
  email: "email",
  phone: "phone",
  linkedin_url: "linkedinUrl",
  linkedinurl: "linkedinUrl",
  linkedin: "linkedinUrl",
  company_website: "companyWebsite",
  companywebsite: "companyWebsite",
  website: "companyWebsite",
  contact_notes: "contactNotes",
  contactnotes: "contactNotes",
  source_key: "sourceKey",
  sourcekey: "sourceKey",
};

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function canonicalField(header: string): string | undefined {
  const key = normalizeHeader(header);
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/_/g, "")];
}

export function assertBoundedOperatorRows(rowCount: number, label: string): void {
  if (rowCount < 1) {
    throw new Error(`${label}: payload has no rows.`);
  }
  if (rowCount > DC_AWARD_OPERATOR_UPSERT_MAX_ROWS) {
    throw new Error(
      `${label}: ${rowCount} rows exceeds the ${DC_AWARD_OPERATOR_UPSERT_MAX_ROWS}-row one-shot cap. Split the file and re-run.`,
    );
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsvRecords(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV payload needs a header row and at least one data row.");
  }
  const headers = parseCsvLine(lines[0] ?? "").map((header) => canonicalField(header));
  const records: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((field, index) => {
      if (!field) return;
      record[field] = cells[index] ?? "";
    });
    records.push(record);
  }
  return records;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object row.");
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const raw = record[key];
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = stringField(record, key);
  if (value === undefined) {
    throw new Error(`Row is missing required field: ${key}`);
  }
  return value;
}

function contactFieldsFromRecord(
  record: Record<string, unknown>,
): DcAwardRadarContactFields {
  const raw: DcAwardRadarContactFields = {};
  for (const key of DC_AWARD_CONTACT_FIELD_KEYS) {
    const value = stringField(record, key);
    if (value !== undefined) raw[key] = value;
  }
  return pickDefinedContactFields(raw);
}

export function recordToSeedRow(record: Record<string, unknown>): DcAwardRadarSeedRow {
  const confidenceRaw = requiredString(record, "confidence").trim().toLowerCase();
  if (!isDcAwardRadarConfidence(confidenceRaw)) {
    throw new Error(`Invalid confidence: ${confidenceRaw}`);
  }
  return {
    market: requiredString(record, "market"),
    projectOrCampus: requiredString(record, "projectOrCampus"),
    stageSignal: requiredString(record, "stageSignal"),
    tradeFocus: requiredString(record, "tradeFocus"),
    company: requiredString(record, "company"),
    roleIfKnown: requiredString(record, "roleIfKnown"),
    signalDate: requiredString(record, "signalDate"),
    sourceUrl: requiredString(record, "sourceUrl"),
    sourceType: requiredString(record, "sourceType"),
    confidence: confidenceRaw,
    whyItMattersForDlc: requiredString(record, "whyItMattersForDlc"),
    notes: requiredString(record, "notes"),
    ...contactFieldsFromRecord(record),
  };
}

export function recordToContactOnlyRow(
  record: Record<string, unknown>,
): DcAwardRadarContactOnlyRow {
  const sourceKey = stringField(record, "sourceKey");
  const sourceUrl = stringField(record, "sourceUrl");
  const projectOrCampus = stringField(record, "projectOrCampus");
  const stageSignal = stringField(record, "stageSignal");
  if (!sourceKey?.trim() && !(sourceUrl?.trim() && projectOrCampus?.trim() && stageSignal?.trim())) {
    throw new Error(
      "Contact row needs sourceKey, or sourceUrl + projectOrCampus + stageSignal.",
    );
  }
  return {
    ...(sourceKey !== undefined ? { sourceKey } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    ...(projectOrCampus !== undefined ? { projectOrCampus } : {}),
    ...(stageSignal !== undefined ? { stageSignal } : {}),
    ...contactFieldsFromRecord(record),
  };
}

function parseJsonArray(text: string): unknown[] {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && "rows" in parsed) {
    const rows = (parsed as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  throw new Error("JSON payload must be an array or { rows: [...] }.");
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}

export function parseDcAwardRadarNationwidePayload(
  raw: string,
): ParseDcAwardRadarPayloadResult<DcAwardRadarSeedRow> {
  const text = raw.trim();
  if (!text) throw new Error("Nationwide payload is empty.");
  if (looksLikeJson(text)) {
    const rows = parseJsonArray(text).map((item) => recordToSeedRow(asRecord(item)));
    return { rows, format: "json" };
  }
  const rows = parseCsvRecords(text).map((record) => recordToSeedRow(record));
  return { rows, format: "csv" };
}

export function parseDcAwardRadarContactPayload(
  raw: string,
): ParseDcAwardRadarPayloadResult<DcAwardRadarContactOnlyRow> {
  const text = raw.trim();
  if (!text) throw new Error("Contact payload is empty.");
  if (looksLikeJson(text)) {
    const rows = parseJsonArray(text).map((item) =>
      recordToContactOnlyRow(asRecord(item)),
    );
    return { rows, format: "json" };
  }
  const rows = parseCsvRecords(text).map((record) => recordToContactOnlyRow(record));
  return { rows, format: "csv" };
}

/** UI paste path — one mutation, fail closed above the row cap. */
export function parseBoundedDcAwardRadarNationwidePayload(
  raw: string,
): ParseDcAwardRadarPayloadResult<DcAwardRadarSeedRow> {
  const parsed = parseDcAwardRadarNationwidePayload(raw);
  assertBoundedOperatorRows(parsed.rows.length, "Import nationwide refresh");
  return parsed;
}

export function parseBoundedDcAwardRadarContactPayload(
  raw: string,
): ParseDcAwardRadarPayloadResult<DcAwardRadarContactOnlyRow> {
  const parsed = parseDcAwardRadarContactPayload(raw);
  assertBoundedOperatorRows(parsed.rows.length, "Refresh contacts");
  return parsed;
}

export function chunkOperatorRows<T>(rows: readonly T[], size = DC_AWARD_OPERATOR_UPSERT_MAX_ROWS): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
