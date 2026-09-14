/**
 * DC award-radar campus grouping — display merge only.
 *
 * Individual permit/signal rows stay in `dcAwardSignals`. Campus fields let
 * the UI show one owner/principal per campus (or company fallback) while
 * nested child rows keep stage/date/trade/source history.
 *
 * DC17 (44710 Performance Cir) is NOT DC21 (22175 Beaumeade Cir).
 */

import {
  buildDcAwardSignalSourceKey,
  collapseWs,
  normalizeSourceUrl,
  pickDefinedCampusFields,
  type DcAwardRadarCampusFields,
  type DcAwardRadarConfidence,
  type DcAwardRadarContactFields,
  type DcAwardRadarEmailType,
  type DcAwardRadarPhoneType,
  type DcAwardRadarSeedRow,
} from "./dcAwardRadar";

export const EQUINIX_DC21_CAMPUS_KEY = "equinix-dc21-22175-beaumeade";
export const EQUINIX_DC21_CAMPUS_NAME = "Equinix DC21 (22175 Beaumeade Cir)";

export const EQUINIX_DC17_CAMPUS_KEY = "equinix-dc17-44710-performance";
export const EQUINIX_DC17_CAMPUS_NAME = "Equinix DC17 (44710 Performance Cir)";
export const EQUINIX_DC17_PROJECT = "Equinix DC17 (44710 Performance Cir)";
export const BEAUMEADE_PARCEL_C2_LEGACY_PROJECT =
  "Beaumeade Parcel C2 (44710 Performance Cir)";

export const NTT_VA6_CAMPUS_KEY = "ntt-va6-22280-randolph";
export const NTT_VA6_CAMPUS_NAME = "NTT/VA6 (22280 Randolph Dr)";

export const VANTAGE_OH1_CAMPUS_KEY = "vantage-oh1-new-albany";
export const VANTAGE_OH1_CAMPUS_NAME = "Vantage OH1 (New Albany)";

export const DC21_P2_PROJECT = "Equinix DC21-P2 (22175 Beaumeade Cir)";
export const DC21_P2_STAGE =
  "Permit Issued — generator/transformer/LV electrical";
export const DC21_P3_SOURCE_URL =
  "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-046039/";
/** P2 previously reused P3's MLQ URL. Permit-specific MLQ path for BLDC-2025-030931. */
export const DC21_P2_SOURCE_URL =
  "https://mlq.ai/permit-filings/usa/virginia/loudoun-county/bldc-2025-030931/";
export const DC21_P2_LEGACY_SOURCE_URL = DC21_P3_SOURCE_URL;

export const DC21_P2_URL_NOTE =
  "Source URL is the BLDC-2025-030931 MLQ filing (not P3 BLDC-2025-046039).";
export const DC17_IDENTITY_NOTE =
  "Verified Equinix DC17 at 44710 Performance Cir — not DC21 (22175 Beaumeade Cir).";

export type { DcAwardRadarCampusFields };

export type DcAwardRadarCampusMatch = {
  campusKey: string;
  campusName: string;
  isPrimaryInCampus: boolean;
};

export type DcAwardRadarListContact = DcAwardRadarContactFields & {
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

export type DcAwardRadarGroupableRow = DcAwardRadarListContact & {
  _id: string;
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
  campusKey?: string;
  campusName?: string;
  isPrimaryInCampus?: boolean;
};

export type DcAwardRadarCampusGroup = {
  groupKey: string;
  campusKey: string | undefined;
  campusName: string;
  market: string;
  companies: string[];
  contact: DcAwardRadarListContact;
  confidence: DcAwardRadarConfidence;
  signalDate: string;
  signals: DcAwardRadarGroupableRow[];
};

const CONFIDENCE_RANK: Record<DcAwardRadarConfidence, number> = {
  high: 0,
  med: 1,
  low: 2,
};

function normalizeProject(value: string): string {
  return collapseWs(value).toLowerCase();
}

function appendUniqueNote(notes: string, extra: string): string {
  const trimmed = extra.trim();
  if (!trimmed) return notes;
  if (notes.includes(trimmed)) return notes;
  return notes ? `${notes} ${trimmed}` : trimmed;
}

export function parseOptionalCampusPrimary(
  value: string | undefined,
): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "primary"
  ) {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  throw new Error(`Invalid isPrimaryInCampus: ${value}`);
}

export function matchKnownCampusFamily(input: {
  projectOrCampus: string;
  company?: string;
}): DcAwardRadarCampusMatch | null {
  const project = normalizeProject(input.projectOrCampus);
  const company = collapseWs(input.company ?? "").toLowerCase();

  if (project.includes("equinix dc21") && project.includes("22175 beaumeade")) {
    return {
      campusKey: EQUINIX_DC21_CAMPUS_KEY,
      campusName: EQUINIX_DC21_CAMPUS_NAME,
      isPrimaryInCampus: project.includes("dc21-p3"),
    };
  }

  if (
    project.includes("beaumeade parcel c2") ||
    (project.includes("equinix dc17") && project.includes("44710 performance"))
  ) {
    return {
      campusKey: EQUINIX_DC17_CAMPUS_KEY,
      campusName: EQUINIX_DC17_CAMPUS_NAME,
      isPrimaryInCampus: true,
    };
  }

  if (
    project.includes("ntt") &&
    project.includes("va6") &&
    project.includes("22280 randolph")
  ) {
    return {
      campusKey: NTT_VA6_CAMPUS_KEY,
      campusName: NTT_VA6_CAMPUS_NAME,
      isPrimaryInCampus: company.includes("hitt"),
    };
  }

  if (project.includes("vantage oh1")) {
    return {
      campusKey: VANTAGE_OH1_CAMPUS_KEY,
      campusName: VANTAGE_OH1_CAMPUS_NAME,
      isPrimaryInCampus:
        project.includes("campus") && !project.includes("building"),
    };
  }

  return null;
}

export function applyKnownCampusAndRemaps(
  row: DcAwardRadarSeedRow,
): DcAwardRadarSeedRow {
  let next: DcAwardRadarSeedRow = { ...row };
  const project = normalizeProject(next.projectOrCampus);
  const stage = collapseWs(next.stageSignal);
  const sourceUrl = normalizeSourceUrl(next.sourceUrl);

  if (
    project === normalizeProject(DC21_P2_PROJECT) &&
    stage === DC21_P2_STAGE &&
    sourceUrl === normalizeSourceUrl(DC21_P2_LEGACY_SOURCE_URL)
  ) {
    next = {
      ...next,
      sourceUrl: DC21_P2_SOURCE_URL,
      notes: appendUniqueNote(next.notes, DC21_P2_URL_NOTE),
    };
  }

  if (project === normalizeProject(BEAUMEADE_PARCEL_C2_LEGACY_PROJECT)) {
    next = {
      ...next,
      projectOrCampus: EQUINIX_DC17_PROJECT,
      notes: appendUniqueNote(next.notes, DC17_IDENTITY_NOTE),
    };
  }

  const matched = matchKnownCampusFamily(next);
  if (!matched) {
    return {
      ...next,
      ...pickDefinedCampusFields(next),
    };
  }

  return {
    ...next,
    ...pickDefinedCampusFields({
      campusKey: next.campusKey ?? matched.campusKey,
      campusName: next.campusName ?? matched.campusName,
      isPrimaryInCampus: next.isPrimaryInCampus ?? matched.isPrimaryInCampus,
    }),
  };
}

export function legacySourceKeysForPrepared(prepared: {
  sourceKey: string;
  sourceUrl: string;
  projectOrCampus: string;
  stageSignal: string;
}): string[] {
  const keys: string[] = [];
  const project = normalizeProject(prepared.projectOrCampus);
  const stage = collapseWs(prepared.stageSignal);

  if (project === normalizeProject(DC21_P2_PROJECT) && stage === DC21_P2_STAGE) {
    keys.push(
      buildDcAwardSignalSourceKey({
        sourceUrl: DC21_P2_LEGACY_SOURCE_URL,
        projectOrCampus: prepared.projectOrCampus,
        stageSignal: prepared.stageSignal,
      }),
    );
  }

  if (
    project === normalizeProject(EQUINIX_DC17_PROJECT) &&
    stage.includes("NEW 4-story data center")
  ) {
    keys.push(
      buildDcAwardSignalSourceKey({
        sourceUrl: prepared.sourceUrl,
        projectOrCampus: BEAUMEADE_PARCEL_C2_LEGACY_PROJECT,
        stageSignal: prepared.stageSignal,
      }),
    );
  }

  return [...new Set(keys)].filter((key) => key !== prepared.sourceKey);
}

export function dcAwardCampusGroupKey(
  row: Pick<DcAwardRadarGroupableRow, "campusKey" | "company">,
): string {
  const campusKey = row.campusKey?.trim();
  if (campusKey) return `campus:${campusKey}`;
  return `company:${collapseWs(row.company).toLowerCase()}`;
}

export function dcAwardRowHasContact(
  row: DcAwardRadarListContact,
): boolean {
  return Boolean(
    row.contactName?.trim() ||
      row.email?.trim() ||
      row.phone?.trim() ||
      row.linkedinUrl?.trim(),
  );
}

export function pickCampusGroupContact(
  rows: readonly DcAwardRadarGroupableRow[],
): DcAwardRadarListContact {
  const primary = rows.find(
    (row) => row.isPrimaryInCampus && dcAwardRowHasContact(row),
  );
  const chosen =
    primary ?? rows.find((row) => dcAwardRowHasContact(row)) ?? rows[0];
  if (!chosen) return {};
  return {
    contactName: chosen.contactName,
    contactTitle: chosen.contactTitle,
    email: chosen.email,
    emailType: chosen.emailType,
    phone: chosen.phone,
    phoneType: chosen.phoneType,
    linkedinUrl: chosen.linkedinUrl,
    companyWebsite: chosen.companyWebsite,
    contactNotes: chosen.contactNotes,
  };
}

function bestConfidence(
  rows: readonly DcAwardRadarGroupableRow[],
): DcAwardRadarConfidence {
  return rows.reduce<DcAwardRadarConfidence>((best, row) => {
    return CONFIDENCE_RANK[row.confidence] < CONFIDENCE_RANK[best]
      ? row.confidence
      : best;
  }, "low");
}

function uniqueCompanies(rows: readonly DcAwardRadarGroupableRow[]): string[] {
  const seen = new Set<string>();
  const companies: string[] = [];
  for (const row of rows) {
    const company = collapseWs(row.company);
    const key = company.toLowerCase();
    if (!company || seen.has(key)) continue;
    seen.add(key);
    companies.push(company);
  }
  return companies;
}

export function groupDcAwardRadarSignals(
  rows: readonly DcAwardRadarGroupableRow[],
): DcAwardRadarCampusGroup[] {
  const buckets = new Map<string, DcAwardRadarGroupableRow[]>();
  for (const row of rows) {
    const key = dcAwardCampusGroupKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const groups: DcAwardRadarCampusGroup[] = [];
  for (const [groupKey, signals] of buckets) {
    const sortedSignals = [...signals].sort((a, b) => {
      const dateCmp = b.signalDate.localeCompare(a.signalDate);
      if (dateCmp !== 0) return dateCmp;
      return a.projectOrCampus.localeCompare(b.projectOrCampus);
    });
    const head = sortedSignals[0];
    if (!head) continue;
    const campusKey = head.campusKey?.trim() || undefined;
    const campusName =
      sortedSignals.find((row) => row.campusName?.trim())?.campusName?.trim() ||
      uniqueCompanies(sortedSignals)[0] ||
      head.company;
    groups.push({
      groupKey,
      campusKey,
      campusName,
      market: head.market,
      companies: uniqueCompanies(sortedSignals),
      contact: pickCampusGroupContact(sortedSignals),
      confidence: bestConfidence(sortedSignals),
      signalDate: head.signalDate,
      signals: sortedSignals,
    });
  }

  return groups.sort((a, b) => {
    const marketCmp = a.market.localeCompare(b.market);
    if (marketCmp !== 0) return marketCmp;
    return a.campusName.localeCompare(b.campusName);
  });
}
