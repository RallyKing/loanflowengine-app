/**
 * DLC public data-center award radar — seed + idempotency helpers.
 *
 * Markets are free-text (any US market). Phase 2 originally seeded Ashburn /
 * DFW / Columbus; nationwide refresh is not limited to those three.
 *
 * Contact enrichment is Hermes/ops-driven (CSV → operator upsert). No Convex
 * web-scrape, cron, or scheduler. GHL / outbound messaging is out of scope
 * (Stacy later: high-confidence only, tag `dc-award-radar`, no auto-blast).
 */

export const DC_AWARD_RADAR_CONFIDENCE = ["high", "med", "low"] as const;
export type DcAwardRadarConfidence = (typeof DC_AWARD_RADAR_CONFIDENCE)[number];

/**
 * Optional multi-vertical radar category. Existing DC rows may omit this
 * (undefined/absent) and must keep working. Explicit `data_center` is allowed
 * for new DC rows; blank remains valid for legacy DC signals.
 */
export const DC_AWARD_RADAR_CATEGORIES = [
  "hospital",
  "dot_civil",
  "industrial_warehouse",
  "k12_higher_ed",
  "data_center",
] as const;
export type DcAwardRadarCategory = (typeof DC_AWARD_RADAR_CATEGORIES)[number];

/** Historical Phase 2 corpus labels only — do not hard-code the UI filter to these. */
export const PHASE2_DC_AWARD_RADAR_MARKETS = [
  "Ashburn VA",
  "Dallas-Fort Worth TX",
  "Columbus OH",
] as const;

/** @deprecated Use PHASE2_DC_AWARD_RADAR_MARKETS for corpus docs; UI must not lock to these. */
export const DC_AWARD_RADAR_MARKETS = PHASE2_DC_AWARD_RADAR_MARKETS;

/** Hard cap per operator mutation call — fail closed, no unbounded loops. */
export const DC_AWARD_OPERATOR_UPSERT_MAX_ROWS = 100;

export const DC_AWARD_PHONE_TYPES = ["cell", "direct", "main", "unknown"] as const;
export type DcAwardRadarPhoneType = (typeof DC_AWARD_PHONE_TYPES)[number];

export const DC_AWARD_EMAIL_TYPES = ["direct", "generic", "unknown"] as const;
export type DcAwardRadarEmailType = (typeof DC_AWARD_EMAIL_TYPES)[number];

export const DC_AWARD_CONTACT_STRING_KEYS = [
  "contactName",
  "contactTitle",
  "email",
  "phone",
  "linkedinUrl",
  "companyWebsite",
  "contactNotes",
] as const;

/** @deprecated Use DC_AWARD_CONTACT_STRING_KEYS; types are handled separately. */
export const DC_AWARD_CONTACT_FIELD_KEYS = DC_AWARD_CONTACT_STRING_KEYS;

export type DcAwardRadarContactFieldKey =
  (typeof DC_AWARD_CONTACT_STRING_KEYS)[number];

export type DcAwardRadarContactFields = {
  contactName?: string;
  contactTitle?: string;
  email?: string;
  emailType?: DcAwardRadarEmailType;
  phone?: string;
  phoneType?: DcAwardRadarPhoneType;
  linkedinUrl?: string;
  companyWebsite?: string;
  contactNotes?: string;
};

/** Display-merge only — does not delete permit history rows. */
export type DcAwardRadarCampusFields = {
  campusKey?: string;
  campusName?: string;
  isPrimaryInCampus?: boolean;
};

export type DcAwardRadarSeedRow = {
  market: string;
  projectOrCampus: string;
  stageSignal: string;
  tradeFocus: string;
  company: string;
  roleIfKnown: string;
  signalDate: string;
  sourceUrl: string;
  sourceType: string;
  confidence: DcAwardRadarConfidence;
  whyItMattersForDlc: string;
  notes: string;
  /** Optional vertical; omit for legacy DC rows. */
  category?: DcAwardRadarCategory;
} & DcAwardRadarContactFields &
  DcAwardRadarCampusFields;

export type DcAwardRadarPreparedRow = {
  sourceKey: string;
  sourceUrl: string;
  market: string;
  projectOrCampus: string;
  stageSignal: string;
  tradeFocus: string;
  company: string;
  roleIfKnown: string;
  signalDate: string;
  sourceType: string;
  confidence: DcAwardRadarConfidence;
  whyItMattersForDlc: string;
  notes: string;
  category?: DcAwardRadarCategory;
} & DcAwardRadarContactFields &
  DcAwardRadarCampusFields;

const SOURCE_KEY_SEP = "::";

/** Normalize CSV `source_url` for storage + index lookup. */
export function normalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${host}${path}${url.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** Fail closed for rendered hrefs — http(s) only. */
export function dcAwardSafeHttpUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function collapseWs(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isDcAwardRadarPhoneType(
  value: string,
): value is DcAwardRadarPhoneType {
  return (DC_AWARD_PHONE_TYPES as readonly string[]).includes(value);
}

export function isDcAwardRadarEmailType(
  value: string,
): value is DcAwardRadarEmailType {
  return (DC_AWARD_EMAIL_TYPES as readonly string[]).includes(value);
}

export function isDcAwardRadarCategory(
  value: string,
): value is DcAwardRadarCategory {
  return (DC_AWARD_RADAR_CATEGORIES as readonly string[]).includes(value);
}

export function parseDcAwardRadarCategory(
  value: string,
): DcAwardRadarCategory {
  // Labels like "K-12 / higher ed" and "DOT / Civil" → snake_case tokens.
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/([a-z])-(\d)/g, "$1$2")
    .replace(/\//g, " ")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!isDcAwardRadarCategory(normalized)) {
    throw new Error(`Invalid category: ${value}`);
  }
  return normalized;
}

/**
 * Category is optional. `undefined` means "leave existing value" on upsert so
 * Phase 2 / DC re-runs do not wipe or invent a category.
 */
export function pickDefinedCategory(row: {
  category?: DcAwardRadarCategory;
}): { category?: DcAwardRadarCategory } {
  if (row.category === undefined) return {};
  return { category: row.category };
}

export function dcAwardCategoryUiLabel(
  category: DcAwardRadarCategory | undefined,
): string {
  switch (category) {
    case "hospital":
      return "Hospital";
    case "dot_civil":
      return "DOT / Civil";
    case "industrial_warehouse":
      return "Industrial / Warehouse";
    case "k12_higher_ed":
      return "K-12 / higher ed";
    case "data_center":
      return "Data center";
    case undefined:
      return "Data center (uncategorized)";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function parseDcAwardRadarPhoneType(
  value: string,
): DcAwardRadarPhoneType {
  const normalized = value.trim().toLowerCase();
  if (!isDcAwardRadarPhoneType(normalized)) {
    throw new Error(`Invalid phoneType: ${value}`);
  }
  return normalized;
}

export function parseDcAwardRadarEmailType(
  value: string,
): DcAwardRadarEmailType {
  const normalized = value.trim().toLowerCase();
  if (!isDcAwardRadarEmailType(normalized)) {
    throw new Error(`Invalid emailType: ${value}`);
  }
  return normalized;
}

/** Prefer owner/principal cell language over generic "contact". */
export function dcAwardPhoneUiLabel(
  phoneType: DcAwardRadarPhoneType | undefined,
): string {
  switch (phoneType) {
    case "direct":
      return "Direct line";
    case "main":
      return "Main / switchboard";
    case "cell":
    case "unknown":
    case undefined:
      return "Cell (likely)";
    default: {
      const _exhaustive: never = phoneType;
      return _exhaustive;
    }
  }
}

export function dcAwardEmailUiLabel(
  emailType: DcAwardRadarEmailType | undefined,
): string {
  switch (emailType) {
    case "generic":
      return "Generic / company email";
    case "direct":
    case "unknown":
    case undefined:
      return "Direct email";
    default: {
      const _exhaustive: never = emailType;
      return _exhaustive;
    }
  }
}

/**
 * Contact fields are optional; empty string is allowed on text fields.
 * `undefined` means "leave existing value" on upsert so Phase 2 re-runs
 * do not wipe Hermes enrichment.
 */
export function pickDefinedCampusFields(
  row: DcAwardRadarCampusFields,
): DcAwardRadarCampusFields {
  const out: DcAwardRadarCampusFields = {};
  if (row.campusKey !== undefined) {
    const campusKey = collapseWs(row.campusKey);
    if (campusKey) out.campusKey = campusKey;
  }
  if (row.campusName !== undefined) {
    const campusName = collapseWs(row.campusName);
    if (campusName) out.campusName = campusName;
  }
  if (row.isPrimaryInCampus !== undefined) {
    out.isPrimaryInCampus = row.isPrimaryInCampus;
  }
  return out;
}

export function pickDefinedContactFields(
  row: DcAwardRadarContactFields,
): DcAwardRadarContactFields {
  const out: DcAwardRadarContactFields = {};
  for (const key of DC_AWARD_CONTACT_STRING_KEYS) {
    const value = row[key];
    if (value !== undefined) {
      out[key] = collapseWs(value);
    }
  }
  if (row.phoneType !== undefined) {
    out.phoneType = row.phoneType;
  }
  if (row.emailType !== undefined) {
    out.emailType = row.emailType;
  }
  return out;
}

/**
 * Stable upsert key. `sourceUrl` is indexed as requested but is **not** unique
 * in the Phase 2 corpus (shared county reports / city dashboards / news pages).
 * Idempotency is sourceUrl + project + stage so all ~29 rows survive a re-run.
 */
export function buildDcAwardSignalSourceKey(input: {
  sourceUrl: string;
  projectOrCampus: string;
  stageSignal: string;
}): string {
  return [
    normalizeSourceUrl(input.sourceUrl),
    collapseWs(input.projectOrCampus).toLowerCase(),
    collapseWs(input.stageSignal).toLowerCase(),
  ].join(SOURCE_KEY_SEP);
}

export function isDcAwardRadarConfidence(
  value: string,
): value is DcAwardRadarConfidence {
  return (DC_AWARD_RADAR_CONFIDENCE as readonly string[]).includes(value);
}

export function prepareDcAwardRadarSeedRow(
  row: DcAwardRadarSeedRow,
): DcAwardRadarPreparedRow {
  const sourceUrl = normalizeSourceUrl(row.sourceUrl);
  if (!sourceUrl) {
    throw new Error("dcAwardSignals seed row is missing sourceUrl.");
  }
  if (!dcAwardSafeHttpUrl(sourceUrl)) {
    throw new Error("dcAwardSignals seed row sourceUrl must be http(s).");
  }
  if (!isDcAwardRadarConfidence(row.confidence)) {
    throw new Error(`Invalid confidence: ${row.confidence}`);
  }
  if (row.category !== undefined && !isDcAwardRadarCategory(row.category)) {
    throw new Error(`Invalid category: ${row.category}`);
  }
  const projectOrCampus = collapseWs(row.projectOrCampus);
  const stageSignal = collapseWs(row.stageSignal);
  return {
    sourceKey: buildDcAwardSignalSourceKey({
      sourceUrl,
      projectOrCampus,
      stageSignal,
    }),
    sourceUrl,
    market: collapseWs(row.market),
    projectOrCampus,
    stageSignal,
    tradeFocus: collapseWs(row.tradeFocus),
    company: collapseWs(row.company),
    roleIfKnown: collapseWs(row.roleIfKnown),
    signalDate: collapseWs(row.signalDate),
    sourceType: collapseWs(row.sourceType),
    confidence: row.confidence,
    whyItMattersForDlc: collapseWs(row.whyItMattersForDlc),
    notes: collapseWs(row.notes),
    ...pickDefinedCategory(row),
    ...pickDefinedContactFields(row),
    ...pickDefinedCampusFields(row),
  };
}

/** Phase 2 public corpus (Joshua). Keep in sync with the award-radar CSV. */
export const PHASE2_DC_AWARD_SIGNAL_SEEDS: readonly DcAwardRadarSeedRow[] = [
  {
    market: "Ashburn VA",
    projectOrCampus: "Equinix DC21-P3 (22175 Beaumeade Cir)",
    stageSignal: "Permit Issued — equipment yard/generators/chillers",
    tradeFocus:
      "Electrical + Mechanical (generators, transformers, LV skids, chillers)",
    company: "DPR Construction",
    roleIfKnown: "GC (permit applicant)",
    signalDate: "2026-04-07",
    sourceUrl:
      "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-046039/",
    sourceType: "County permit (MLQ.ai)",
    confidence: "high",
    whyItMattersForDlc:
      "DPR is GC on active Equinix campus expansion; generator/chiller install signals MEP mobilization",
    notes:
      "Permit BLDC-2025-046039; 4 air-cooled chillers + 2 generators + LV skids",
    campusKey: "equinix-dc21-22175-beaumeade",
    campusName: "Equinix DC21 (22175 Beaumeade Cir)",
    isPrimaryInCampus: true,
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "Equinix DC21-P2 (22175 Beaumeade Cir)",
    stageSignal: "Permit Issued — generator/transformer/LV electrical",
    tradeFocus: "Electrical (generator, transformer, LV equipment)",
    company: "DPR Construction",
    roleIfKnown: "GC (permit applicant)",
    signalDate: "2025-11-07",
    sourceUrl:
      "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-030931/",
    sourceType: "County permit (MLQ.ai)",
    confidence: "high",
    whyItMattersForDlc:
      "Follow-on to P3; generator install = critical power path",
    notes:
      "Permit BLDC-2025-030931; $1.3M estimated cost. Source URL is the BLDC-2025-030931 MLQ filing (not P3 BLDC-2025-046039).",
    campusKey: "equinix-dc21-22175-beaumeade",
    campusName: "Equinix DC21 (22175 Beaumeade Cir)",
    isPrimaryInCampus: false,
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "CyrusOne NVA14 (21529 Beaumeade Cir)",
    stageSignal: "Permit Issued — 2nd floor data hall fit-out",
    tradeFocus: "Electrical + Mechanical (data hall fit-out)",
    company: "RAMCO of Virginia (applicant)",
    roleIfKnown: "Permit applicant (likely owner's rep)",
    signalDate: "2025-01-15",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/214418/Permits---Issued-Building-Report-March-1-15-2025",
    sourceType: "Loudoun County permit report",
    confidence: "high",
    whyItMattersForDlc:
      "Active fit-out at operational CyrusOne campus; data hall work = MEP opportunity",
    notes: "Permit BLDC-2024-041861; 84,000 SF",
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "SDC Ashburn I (21800 Beaumeade Cir)",
    stageSignal: "Permit Issued — renovation to existing data center",
    tradeFocus: "Electrical + Mechanical (renovation)",
    company: "RAMCO of Virginia (applicant)",
    roleIfKnown: "Permit applicant",
    signalDate: "2025-01-15",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/214418/Permits---Issued-Building-Report-March-1-15-2025",
    sourceType: "Loudoun County permit report",
    confidence: "med",
    whyItMattersForDlc:
      "Existing campus renovation; SPEX-2025-0031 filed for expansion to 20k SF",
    notes: "Permit BLDC-2025-009583; 73,487 SF alteration",
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "Digital Dulles (43714 Efficiency Dr)",
    stageSignal: "Permit Issued — data hall fit-out (2 permits)",
    tradeFocus: "Electrical + Mechanical + Fire Suppression",
    company: "Shelton Enterprises (applicant)",
    roleIfKnown: "Permit applicant",
    signalDate: "2025-02-03",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/213328/Building-Permits-Issued-February-1-15-2025",
    sourceType: "Loudoun County permit report",
    confidence: "high",
    whyItMattersForDlc:
      "Two data hall fit-outs in existing shell; MEP + fire suppression = full trade stack",
    notes:
      "Permits BLDC-2024-064836, BLDC-2024-064839; 60k SF each, $100k est.",
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "NTT/VA6 Data Center (22280 Randolph Dr)",
    stageSignal: "Permit Issued — tenant fit-out Phase 12",
    tradeFocus: "Electrical + Mechanical (data hall fit-out)",
    company: "HITT Contracting",
    roleIfKnown: "GC (known from Clark/NTT press)",
    signalDate: "2025-02-05",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/213328/Building-Permits-Issued-February-1-15-2025",
    sourceType: "Loudoun County permit report",
    confidence: "high",
    whyItMattersForDlc:
      "HITT is GC on NTT campus; Phase 12 fit-out = active MEP mobilization",
    notes: "Permit BLDC-2024-035654; $10.6M est., 21,594 SF",
    campusKey: "ntt-va6-22280-randolph",
    campusName: "NTT/VA6 (22280 Randolph Dr)",
    isPrimaryInCampus: true,
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "NTT/VA6 Data Center (22280 Randolph Dr)",
    stageSignal: "Permit Issued — interior buildout data halls L1-L4",
    tradeFocus: "Electrical + Mechanical (major building systems)",
    company: "Gensler (applicant)",
    roleIfKnown: "Architect/Engineer",
    signalDate: "2025-02-04",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/213328/Building-Permits-Issued-February-1-15-2025",
    sourceType: "Loudoun County permit report",
    confidence: "high",
    whyItMattersForDlc:
      "Major systems buildout in 304k SF; West/East data halls multi-level",
    notes: "Permit BLDC-2024-046848; $37M est.",
    campusKey: "ntt-va6-22280-randolph",
    campusName: "NTT/VA6 (22280 Randolph Dr)",
    isPrimaryInCampus: false,
  },
  {
    market: "Ashburn VA",
    projectOrCampus: "Equinix DC17 (44710 Performance Cir)",
    stageSignal: "Permit Issued — NEW 4-story data center (12 data halls)",
    tradeFocus:
      "Electrical + Mechanical (generators, power equipment, mechanical penthouse)",
    company: "DPR Construction",
    roleIfKnown: "GC (permit applicant)",
    signalDate: "2025-05-02",
    sourceUrl:
      "https://www.loudoun.gov/DocumentCenter/View/215564/Building-Permits-Issued-May-1-31-2025",
    sourceType: "Loudoun County permit report",
    confidence: "high",
    whyItMattersForDlc:
      "Ground-up 330k SF Equinix DC17 (not DC21); 12 data halls + generators + power centers = major MEP package",
    notes:
      "Permit BLDC-2024-057229; $89.5M est. Verified Equinix DC17 at 44710 Performance Cir — not DC21 (22175 Beaumeade Cir).",
    campusKey: "equinix-dc17-44710-performance",
    campusName: "Equinix DC17 (44710 Performance Cir)",
    isPrimaryInCampus: true,
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "Aligned Data Centers DFW03 (3801 Britton Rd, Mansfield)",
    stageSignal: "TDLR Registered — new construction",
    tradeFocus: "Electrical + Mechanical (2-story DC + generator yard)",
    company: "Aligned Data Centers (Owner)",
    roleIfKnown: "Owner/Developer",
    signalDate: "2024-05-15 (reg)",
    sourceUrl: "https://www.tdlr.texas.gov/TABS/Projects/TABS2024018570",
    sourceType: "TDLR TABS registration",
    confidence: "high",
    whyItMattersForDlc:
      "$120.5M project; 429k SF; Gensler design; completion 2026-01-27",
    notes: "TABS2024018570; privately funded",
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "QTS DFW1-DC5 (6300 Longhorn Dr, Irving)",
    stageSignal: "TDLR Registered — new construction",
    tradeFocus: "Electrical + Mechanical (DC + critical power + screened yard)",
    company: "Quality Investment Properties Irving LLC (Owner)",
    roleIfKnown: "Owner/Developer",
    signalDate: "2023-10-04 (reg)",
    sourceUrl: "https://www.tdlr.texas.gov/TABS/Projects/TABS2024002327",
    sourceType: "TDLR TABS registration",
    confidence: "high",
    whyItMattersForDlc:
      "$180M project; 264k SF; Corgan design; completion 2025-09-30",
    notes: "TABS2024002327; privately funded",
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "CyrusOne DFW7 (Asphalt Dr, Fort Worth)",
    stageSignal: "TDLR Registered — shell and upfit",
    tradeFocus: "Electrical + Mechanical (single-story DC + 2-story office)",
    company: "CyrusOne (Owner)",
    roleIfKnown: "Owner/Developer",
    signalDate: "2024-09-25 (reg)",
    sourceUrl: "https://tdlr.texas.gov/TABS/Search/Project/TABS2025001810",
    sourceType: "TDLR TABS registration",
    confidence: "high",
    whyItMattersForDlc:
      "$200M project; completion 2026-02-22; shell+upfit = phased MEP",
    notes: "TABS2025001810; Tarrant County",
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "Stream DFWC1 (930 N Sunrise Rd, Wilmer)",
    stageSignal: "TDLR Filed — new construction",
    tradeFocus: "Electrical + Mechanical (2-story 360k SF DC + substation)",
    company: "Stream Data Centers (Owner)",
    roleIfKnown: "Owner/Developer",
    signalDate: "2026-04 (filed)",
    sourceUrl:
      "https://www.datacenterdynamics.com/en/news/stream-files-to-build-48mw-data-center-in-dallas-texas/",
    sourceType: "DCD news + TDLR",
    confidence: "med",
    whyItMattersForDlc:
      "$300M investment; 48MW; construction 2026-04 to 2027-10",
    notes: "DFWC1 TDLR filing; Collin County",
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "Evocative DAL6 Upgrade (1221 Coit Rd, Dallas)",
    stageSignal: "TDLR Filed — renovation",
    tradeFocus:
      "Mechanical + Electrical (chillers, generators, UPS, distribution)",
    company: "Evocative (Owner)",
    roleIfKnown: "Owner/Developer",
    signalDate: "2025-09 (filed)",
    sourceUrl:
      "https://www.datacenterdynamics.com/en/news/stream-files-to-build-48mw-data-center-in-dallas-texas/",
    sourceType: "DCD news + TDLR",
    confidence: "med",
    whyItMattersForDlc:
      "$30M renovation; mechanical/electrical equipment replacement",
    notes: "TDLR application; runs Sep 2025–Feb 2027",
  },
  {
    market: "Dallas-Fort Worth TX",
    projectOrCampus: "PowerHouse/Provident Grand Prairie Campus",
    stageSignal: "News — 1.8GW campus announced",
    tradeFocus: "Site prep / early development",
    company: "PowerHouse + Provident (Developers)",
    roleIfKnown: "Developer",
    signalDate: "2025-02-26",
    sourceUrl:
      "https://www.datacenterdynamics.com/en/news/powerhouse-and-provident-to-develop-18gw-campus-in-dfw-texas/",
    sourceType: "DCD news",
    confidence: "low",
    whyItMattersForDlc:
      "24-building campus; Grand Prairie; long lead time but massive scale",
    notes: "DCD 2025-02-26; 768-acre; Phase 2 announced 2025-01-09",
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Vantage OH1 Campus (New Albany)",
    stageSignal: "Groundbreaking + Under Construction",
    tradeFocus: "Electrical + Mechanical (hyperscale campus)",
    company: "Turner Construction",
    roleIfKnown: "GC (press release)",
    signalDate: "2024-10-25",
    sourceUrl:
      "https://www.turnerconstruction.com/insights/turner-selected-for-2-billion-expansion-project-for-vantage-data-centers",
    sourceType: "GC press release",
    confidence: "high",
    whyItMattersForDlc:
      "$2B+ campus; 192MW; 1.5M SF; 3 buildings; 1st building 2025",
    notes: "Turner + Vantage press; AEP Ohio power",
    campusKey: "vantage-oh1-new-albany",
    campusName: "Vantage OH1 (New Albany)",
    isPrimaryInCampus: true,
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Vantage OH1 — Building 1 (Jug & Horizon)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Turner Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-10 (start)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "500k SF; Turner GC confirmed; Building 1 of 3",
    notes: 'City dashboard: "Vantage, Building 1"',
    campusKey: "vantage-oh1-new-albany",
    campusName: "Vantage OH1 (New Albany)",
    isPrimaryInCampus: false,
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Vantage OH1 — Building 2 (3265 Horizon Ct)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Turner Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-10 (start)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "500k SF; Turner GC; Building 2 of 3",
    notes: 'City dashboard: "Vantage, Building 2"',
    campusKey: "vantage-oh1-new-albany",
    campusName: "Vantage OH1 (New Albany)",
    isPrimaryInCampus: false,
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Vantage OH1 — Building 3 (3205 Horizon Ct)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Turner Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-10 (start)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "500k SF; Turner GC; Building 3 of 3",
    notes: 'City dashboard: "Vantage, Building 3"',
    campusKey: "vantage-oh1-new-albany",
    campusName: "Vantage OH1 (New Albany)",
    isPrimaryInCampus: false,
  },
  {
    market: "Columbus OH",
    projectOrCampus: "CyrusOne COL1 (2470 Clover Valley Rd)",
    stageSignal: "Groundbreaking",
    tradeFocus: "Electrical + Mechanical",
    company: "HITT Contracting",
    roleIfKnown: "GC (LinkedIn + NBC4)",
    signalDate: "2025-09-16",
    sourceUrl:
      "https://www.nbc4i.com/news/local-news/new-albany/permits-offer-details-after-groundbreaking-of-150-million-new-albany-data-center/",
    sourceType: "NBC4 + LinkedIn",
    confidence: "high",
    whyItMattersForDlc:
      '$150M; 274k SF; 2-story; HITT GC confirmed; substation "by others"',
    notes: "State permits: start Nov 2024, completion Sep 2026",
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Meta LCO 2 (1500 Beech Rd)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Turner Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-04 (start)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "302k SF; Turner GC; part of Prometheus supercluster",
    notes: 'City dashboard: "Meta LCO 2"',
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Meta NLH1 (1500 Beech Rd SW)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Turner Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-04 (start)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "138k SF; Turner GC; Meta campus expansion",
    notes: 'City dashboard: "NLH1"',
  },
  {
    market: "Columbus OH",
    projectOrCampus:
      "Meta NLH2/3/5/6/NAH1-9/NAB1-10 (1500 Beech Rd + Green Chapel Rd)",
    stageSignal: "Permitted / Pre-construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Shive-Hattery / Turner Construction",
    roleIfKnown: "GC (city dashboard; varies by building)",
    signalDate: "2025-2026 (permits)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "med",
    whyItMattersForDlc:
      "10+ Meta buildings permitted; Shive-Hattery on some, Turner on others; Prometheus gigawatt cluster",
    notes: "City dashboard lists 15+ Meta projects",
  },
  {
    market: "Columbus OH",
    projectOrCampus: "AWS Buildings A/B/E/F/H (Beech & Jug / Miller & Beech)",
    stageSignal: "Under Construction / Permitted",
    tradeFocus: "Electrical + Mechanical",
    company: "Suffolk / Walbridge / Gray Construction",
    roleIfKnown: "GC (city dashboard; varies)",
    signalDate: "2024-2025 (permits)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "7+ AWS buildings; multiple GCs; massive campus",
    notes: "City dashboard: AWS Buildings A, B, E, F, H + 4/5 series",
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Google 7 (1101 Beech Rd)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Holder Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-2025 (permit)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "170k SF; Holder GC; Google New Albany entry",
    notes: 'City dashboard: "Google 7"',
  },
  {
    market: "Columbus OH",
    projectOrCampus: "QTS NAL2 DC1 (785 Beech Rd)",
    stageSignal: "Under Construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Gray Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2024-2025 (permit)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "high",
    whyItMattersForDlc: "320k SF; Gray GC; QTS New Albany campus",
    notes: 'City dashboard: "QTS NAL2 DC1"',
  },
  {
    market: "Columbus OH",
    projectOrCampus: "QTS NAL2 DC2 (675 Beech Rd)",
    stageSignal: "Permitted / Pre-construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Gray Construction",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2025 (permit)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "med",
    whyItMattersForDlc: "292k SF; Gray GC; Phase 2 of QTS NAL2",
    notes: 'City dashboard: "QTS NAL2 DC2"',
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Cologix COL5 (6787 Green Meadows Dr, Lewis Center)",
    stageSignal: "Groundbreaking + Site Prep",
    tradeFocus: "Electrical + Mechanical",
    company: "Danis Construction",
    roleIfKnown: "GC (Dispatch + Cologix)",
    signalDate: "2025-06-18",
    sourceUrl:
      "https://columbusconstruction.org/cologix-breaks-ground-on-1-billion-datacenter-in-central-ohio/",
    sourceType: "Columbus Dispatch + Cologix press",
    confidence: "high",
    whyItMattersForDlc:
      "$1B campus; 120MW; 400 union workers; Phase 1 fall 2026",
    notes: "Dispatch 2025-06-18; Danis GC confirmed",
  },
  {
    market: "Columbus OH",
    projectOrCampus: "EdgeConneX New Albany (2465 Clover Valley Rd)",
    stageSignal: "Permitted / Pre-construction",
    tradeFocus: "Electrical + Mechanical",
    company: "Burr Computer Environments",
    roleIfKnown: "GC (city dashboard)",
    signalDate: "2025 (permit)",
    sourceUrl: "https://newalbanyohio.org/community-development/project-updates",
    sourceType: "City of New Albany project dashboard",
    confidence: "med",
    whyItMattersForDlc: "700k SF; Burr GC; EdgeConneX campus",
    notes: 'City dashboard: "EdgeConneX"',
  },
  {
    market: "Columbus OH",
    projectOrCampus: "Microsoft New Albany (3287 Beech Rd / CMH02)",
    stageSignal: "Site Prep / Mass Grading",
    tradeFocus: "Electrical + Mechanical (site + foundations)",
    company: "Ames Construction",
    roleIfKnown: "GC (Microsoft blog)",
    signalDate: "2024-11 (start)",
    sourceUrl:
      "https://local.microsoft.com/br/blog/newalbany-datacenter-construction-update",
    sourceType: "Microsoft construction blog",
    confidence: "high",
    whyItMattersForDlc:
      "$420M Phase 1; 245k SF; Ames GC; site prep nearing completion 2026",
    notes: "Microsoft blog May 2026; mass grading Feb-Nov 2026",
  },
];

export const PHASE2_DC_AWARD_SIGNAL_COUNT = PHASE2_DC_AWARD_SIGNAL_SEEDS.length;

export function uniquePreparedPhase2SourceKeys(): string[] {
  const keys = PHASE2_DC_AWARD_SIGNAL_SEEDS.map(
    (row) => prepareDcAwardRadarSeedRow(row).sourceKey,
  );
  return [...new Set(keys)];
}
