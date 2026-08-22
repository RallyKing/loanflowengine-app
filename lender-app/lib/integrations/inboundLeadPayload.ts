/**
 * Parse inbound integration webhook payloads into CRM/pipeline lead fields.
 * Used by org automation action `upsert_pipeline_lead`.
 *
 * Company coalesce rule: prefer explicit business name, then company name
 * (`businessName` / `"business name"` / aliases first; then `companyName` /
 * `"company name"` / `company` / aliases). One display company for the entity.
 */

export type InboundLeadFields = {
  externalId?: string;
  /** Display / file title name (first + last, or business name fallback). */
  name: string;
  firstName: string;
  lastName: string;
  /**
   * Coalesced company for entity create/link:
   * first non-empty of business name, then company name.
   */
  businessName?: string;
  /** Company-specific value when present (may equal businessName). */
  companyName?: string;
  email?: string;
  phone?: string;
  /** Raw stage label from the provider (e.g. GHL "3 - Confirm Interest"). */
  stageRaw?: string;
};

const CANONICAL_SLUGS = [
  "confirm_interest",
  "portal_collecting_docs",
  "initial_review",
  "accepted",
  "underwriting",
  "closing",
  "funding",
  "paid_paying",
] as const;

function normalizeStatusKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s/]+/g, "_");
}

const KEYWORD_TO_SLUG: ReadonlyArray<{
  test: RegExp;
  slug: string;
}> = [
  { test: /confirm\s*interest/, slug: "confirm_interest" },
  {
    test: /portal|docs?\s*request|collecting\s*docs/,
    slug: "portal_collecting_docs",
  },
  { test: /initial\s*review/, slug: "initial_review" },
  { test: /\baccepted\b/, slug: "accepted" },
  { test: /underwriting/, slug: "underwriting" },
  { test: /\bclosing\b/, slug: "closing" },
  { test: /\bfunding\b/, slug: "funding" },
  { test: /paid|paying/, slug: "paid_paying" },
  { test: /non[-\s]?responsive/, slug: "non_responsive" },
  { test: /non[-\s]?qualified/, slug: "non_qualified" },
  { test: /not\s*interested/, slug: "not_interested" },
];

/** Strip GHL-style numeric prefixes: "3 - Confirm Interest" → "Confirm Interest". */
export function stripStageNumericPrefix(raw: string): string {
  return raw.replace(/^\s*\d+\s*[-.:)]\s*/, "").trim();
}

/**
 * Map a provider stage label onto a DLC pipeline status/slug.
 * Falls back to `defaultSlug` when no confident match.
 */
export function mapInboundStageToStatusSlug(
  stageRaw: string | undefined | null,
  defaultSlug = "confirm_interest",
): string {
  const trimmed = (stageRaw ?? "").trim();
  if (!trimmed) return defaultSlug;

  const withoutPrefix = stripStageNumericPrefix(trimmed);
  const key = normalizeStatusKey(withoutPrefix);
  if ((CANONICAL_SLUGS as readonly string[]).includes(key)) return key;
  if (
    key === "non_responsive" ||
    key === "non_qualified" ||
    key === "not_interested"
  ) {
    return key;
  }

  const lower = withoutPrefix.toLowerCase();
  for (const row of KEYWORD_TO_SLUG) {
    if (row.test.test(lower)) return row.slug;
  }

  // Last resort: normalized key (may still match an org custom stage slug).
  return key || defaultSlug;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * GHL (and similar) often stringify unresolved merge fields as the literal
 * words `"null"` / `"undefined"`, or leave the raw `{{token}}` in the JSON.
 * Treat those as empty so they do not pollute company / person fields.
 */
export function sanitizeInboundScalarString(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") {
    return undefined;
  }
  // Unresolved merge tag leaked into the payload (e.g. "{{business.name}}").
  if (/^\{\{[^}]+\}\}$/.test(trimmed)) return undefined;
  return trimmed;
}

function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string") {
      const cleaned = sanitizeInboundScalarString(v);
      if (cleaned) return cleaned;
    }
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** First token → firstName; remainder → lastName (CRM-style). */
export function splitPersonName(full: string | undefined | null): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (full ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "" };
  }
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
  };
}

/** Normalize payload keys: "Business Name" / business_name → businessname. */
export function normalizeFieldKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Explicit business / legal-entity name aliases (preferred over company). */
const BUSINESS_NAME_KEYS = [
  "businessName",
  "business_name",
  "business name",
  "businessname",
  "legalName",
  "legal_name",
  "legal name",
  "legalBusinessName",
  "legal_business_name",
] as const;

/** Company / DBA / org aliases (fallback when business empty). */
const COMPANY_NAME_KEYS = [
  "companyName",
  "company_name",
  "company name",
  "companyname",
  "company",
  "organizationName",
  "organization_name",
  "organization name",
  "organization",
  "dba",
  "tradeName",
  "trade_name",
  "trade name",
  "entityName",
  "entity_name",
  "entity name",
] as const;

const BUSINESS_NAME_KEY_NORM = new Set(
  BUSINESS_NAME_KEYS.map((k) => normalizeFieldKey(k)),
);
const COMPANY_NAME_KEY_NORM = new Set(
  COMPANY_NAME_KEYS.map((k) => normalizeFieldKey(k)),
);
const ANY_COMPANY_KEY_NORM = new Set([
  ...BUSINESS_NAME_KEY_NORM,
  ...COMPANY_NAME_KEY_NORM,
]);

function coerceScalarString(value: unknown): string | undefined {
  if (typeof value === "string") return sanitizeInboundScalarString(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Pick a string by exact keys first, then by normalized key match
 * (handles `"business name"`, `Business_Name`, etc.).
 */
export function pickStringFlexible(
  obj: Record<string, unknown>,
  keys: readonly string[],
  normalizedTargets: ReadonlySet<string>,
): string | undefined {
  const exact = pickString(obj, keys);
  if (exact) return exact;
  for (const [k, v] of Object.entries(obj)) {
    if (!normalizedTargets.has(normalizeFieldKey(k))) continue;
    const scalar = coerceScalarString(v);
    if (scalar) return scalar;
    const nested = asRecord(v);
    if (nested) {
      const val = pickString(nested, ["value", "field_value", "fieldValue"]);
      if (val) return val;
    }
  }
  return undefined;
}

function pickFromCustomBags(
  sources: ReadonlyArray<Record<string, unknown>>,
  normalizedTargets: ReadonlySet<string>,
): string | undefined {
  for (const src of sources) {
    for (const bag of [
      src.customFields,
      src.custom_fields,
      src.customData,
      src.custom_data,
      src.customField,
      src.custom_field,
    ]) {
      const found = pickLabeledValueFromUnknown(bag, normalizedTargets);
      if (found) return found;
    }
  }
  return undefined;
}

function pickLabeledValueFromUnknown(
  value: unknown,
  normalizedTargets: ReadonlySet<string>,
): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const rec = asRecord(item);
      if (!rec) continue;
      const label = pickString(rec, [
        "key",
        "name",
        "fieldKey",
        "field_key",
        "fieldName",
        "field_name",
      ]);
      if (!label || !normalizedTargets.has(normalizeFieldKey(label))) {
        continue;
      }
      const val = pickString(rec, ["value", "field_value", "fieldValue"]);
      if (val) return val;
    }
    return undefined;
  }
  const rec = asRecord(value);
  if (!rec) return undefined;
  return pickStringFlexible(rec, [], normalizedTargets);
}

function pickNamedCompanyField(
  sources: ReadonlyArray<Record<string, unknown>>,
  keys: readonly string[],
  normalizedTargets: ReadonlySet<string>,
): string | undefined {
  for (const src of sources) {
    const direct = pickStringFlexible(src, keys, normalizedTargets);
    if (direct) return direct;
  }
  return pickFromCustomBags(sources, normalizedTargets);
}

/**
 * Extract business + company separately, then coalesce:
 * display company = business || company (business wins).
 */
export function pickBusinessAndCompanyNames(
  sources: ReadonlyArray<Record<string, unknown>>,
): { businessName?: string; companyName?: string } {
  const businessOnly = pickNamedCompanyField(
    sources,
    BUSINESS_NAME_KEYS,
    BUSINESS_NAME_KEY_NORM,
  );
  const companyOnly = pickNamedCompanyField(
    sources,
    COMPANY_NAME_KEYS,
    COMPANY_NAME_KEY_NORM,
  );
  const coalesced = businessOnly || companyOnly || undefined;
  return {
    businessName: coalesced,
    companyName: companyOnly || (businessOnly ? businessOnly : undefined),
  };
}

/**
 * Map extracted lead company fields onto Entity Details:
 * - COMPANY NAME (`legalName` / entity companyName) ← coalesced company
 * - DBA ← company name when present, else same coalesced company
 *
 * GHL often only sends `"company name"`; that value must land in both fields.
 */
export function resolveInboundEntityCompanyFields(
  lead: Pick<InboundLeadFields, "businessName" | "companyName">,
): { legalName: string; companyName: string; dba: string } | null {
  const legalName =
    sanitizeInboundScalarString(lead.businessName) ??
    sanitizeInboundScalarString(lead.companyName) ??
    "";
  if (!legalName) return null;
  const companyOnly = sanitizeInboundScalarString(lead.companyName);
  const companyName = companyOnly || legalName;
  // Always mirror company into DBA when inbound creates/links an entity.
  const dba = companyOnly || legalName;
  return { legalName, companyName, dba };
}

function pickBusinessName(
  sources: ReadonlyArray<Record<string, unknown>>,
): string | undefined {
  return pickBusinessAndCompanyNames(sources).businessName;
}

function resolveNameParts(
  sources: ReadonlyArray<Record<string, unknown>>,
  companyFallback?: string,
): { name: string; firstName: string; lastName: string } | null {
  let firstName = "";
  let lastName = "";
  for (const src of sources) {
    if (!firstName) {
      firstName =
        pickString(src, ["firstName", "first_name", "firstname"]) ?? "";
    }
    if (!lastName) {
      lastName = pickString(src, ["lastName", "last_name", "lastname"]) ?? "";
    }
  }

  let full = "";
  for (const src of sources) {
    full =
      pickString(src, [
        "name",
        "fullName",
        "full_name",
        "contactName",
        "contact_name",
      ]) ?? "";
    if (full) break;
  }

  if (!firstName && !lastName && full) {
    const split = splitPersonName(full);
    firstName = split.firstName;
    lastName = split.lastName;
  } else if (!full) {
    full = [firstName, lastName].filter(Boolean).join(" ").trim();
  }

  // Company-only / missing first name: use business/company as first name.
  // Treat empty / whitespace / literal "null" as already sanitized away above.
  if (!firstName) {
    const business = companyFallback || pickBusinessName(sources);
    if (business) {
      firstName = business;
      if (!full) {
        full = [firstName, lastName].filter(Boolean).join(" ").trim();
      }
    }
  }

  if (!full && !firstName && !lastName) return null;
  if (!full) full = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!firstName && full) {
    const split = splitPersonName(full);
    firstName = split.firstName;
    lastName = lastName || split.lastName;
  }

  return { name: full, firstName, lastName };
}

/**
 * Extract lead fields from an integration job payload.
 * Webhook ingest wraps the provider JSON as `{ receivedAt, rawLength, body }`.
 * Also reads nested `contact` / `Contact` / `business` objects (GHL-style).
 */
export function extractInboundLeadFields(
  payload: unknown,
): InboundLeadFields | null {
  const root = asRecord(payload);
  if (!root) return null;

  const body = asRecord(root.body) ?? root;
  const nestedContact =
    asRecord(body.contact) ??
    asRecord(body.Contact) ??
    asRecord(body.lead) ??
    asRecord(body.Lead);
  const nestedBusiness = asRecord(body.business) ?? asRecord(body.Business);

  // Person-name sources only — nested business.name is a company label.
  const nameSources = nestedContact ? [body, nestedContact] : [body];
  const companySources = [
    body,
    ...(nestedContact ? [nestedContact] : []),
    ...(nestedBusiness ? [nestedBusiness] : []),
  ];

  let { businessName, companyName } =
    pickBusinessAndCompanyNames(companySources);
  // GHL nested `business: { name }` is a company label, not a person name.
  if (!businessName && nestedBusiness) {
    const nestedBizName = pickString(nestedBusiness, [
      "name",
      "businessName",
      "companyName",
    ]);
    if (nestedBizName) {
      businessName = nestedBizName;
      if (!companyName) companyName = nestedBizName;
    }
  }

  const names = resolveNameParts(nameSources, businessName);
  if (!names) return null;

  const pickFromSources = (keys: readonly string[]): string | undefined => {
    for (const src of nameSources) {
      const v = pickString(src, keys);
      if (v) return v;
    }
    return undefined;
  };

  return {
    externalId: pickFromSources([
      "id",
      "contactId",
      "contact_id",
      "externalId",
      "external_id",
    ]),
    name: names.name,
    firstName: names.firstName,
    lastName: names.lastName,
    businessName,
    companyName,
    email: pickFromSources(["email", "emailAddress", "email_address"]),
    phone: pickFromSources([
      "phone",
      "mobile",
      "phoneNumber",
      "phone_number",
    ]),
    stageRaw: pickFromSources([
      "stage",
      "pipelineStage",
      "pipeline_stage",
      "status",
    ]),
  };
}

/** True when any known business/company key is present (for diagnostics). */
export function payloadHasCompanyKeyHint(payload: unknown): boolean {
  const root = asRecord(payload);
  if (!root) return false;
  const body = asRecord(root.body) ?? root;
  for (const [k] of Object.entries(body)) {
    if (ANY_COMPANY_KEY_NORM.has(normalizeFieldKey(k))) return true;
  }
  return false;
}
