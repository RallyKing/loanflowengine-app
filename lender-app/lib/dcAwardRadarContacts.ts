/**
 * Contact-centric filters and unique-contact rollup for Award Radar.
 *
 * Uses the already-loaded, capped list page — no extra Convex query,
 * no `.collect()`, no scrape. Identity matches `dcAwardRadarStats`
 * (company + contactName, then email / phone / LinkedIn).
 */

import { collapseWs, type DcAwardRadarConfidence } from "./dcAwardRadar";
import type {
  DcAwardRadarCategory,
  DcAwardRadarEmailType,
  DcAwardRadarPhoneType,
} from "./dcAwardRadar";
import type { DcAwardRadarListContact } from "./dcAwardRadarCampus";
import {
  dcAwardContactIdentityKey,
  type DcAwardRadarLeadStatRow,
} from "./dcAwardRadarStats";

export const DC_AWARD_CONTACT_FILTER_IDS = [
  "hasPhone",
  "hasEmail",
  "hasLinkedIn",
  "hasCell",
  "missingPhone",
  "missingEmail",
] as const;

export type DcAwardRadarContactFilterId =
  (typeof DC_AWARD_CONTACT_FILTER_IDS)[number];

export const DC_AWARD_CONTACT_FILTER_LABEL: Record<
  DcAwardRadarContactFilterId,
  string
> = {
  hasPhone: "Has phone",
  hasEmail: "Has email",
  hasLinkedIn: "Has LinkedIn",
  hasCell: "Has cell",
  missingPhone: "Missing phone",
  missingEmail: "Missing email",
};

export type DcAwardRadarContactFilterSet = ReadonlySet<DcAwardRadarContactFilterId>;

export type DcAwardRadarUniqueContact = {
  identityKey: string;
  company: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  phoneType?: DcAwardRadarPhoneType;
  emailType?: DcAwardRadarEmailType;
  linkedinUrl: string;
  companyWebsite: string;
  markets: string[];
  projects: string[];
  trades: string[];
  categories: DcAwardRadarCategory[];
  confidence: DcAwardRadarConfidence;
  hasPhone: boolean;
  hasEmail: boolean;
  hasLinkedIn: boolean;
  hasCell: boolean;
};

export type DcAwardRadarContactSourceRow = DcAwardRadarLeadStatRow & {
  projectOrCampus?: string;
  tradeFocus?: string;
  market?: string;
  category?: DcAwardRadarCategory;
} & DcAwardRadarListContact;

const CONFIDENCE_RANK: Record<DcAwardRadarConfidence, number> = {
  high: 0,
  med: 1,
  low: 2,
};

function firstNonEmpty(
  current: string | undefined,
  incoming: string | undefined,
): string {
  const a = collapseWs(current ?? "");
  if (a) return a;
  return collapseWs(incoming ?? "");
}

function pushUniqueSorted(list: string[], value: string | undefined): string[] {
  const next = collapseWs(value ?? "");
  if (!next) return list;
  const key = next.toLowerCase();
  if (list.some((item) => item.toLowerCase() === key)) return list;
  return [...list, next].sort((a, b) => a.localeCompare(b));
}

function pushUniqueCategory(
  list: DcAwardRadarCategory[],
  value: DcAwardRadarCategory | undefined,
): DcAwardRadarCategory[] {
  if (!value) return list;
  if (list.includes(value)) return list;
  return [...list, value].sort((a, b) => a.localeCompare(b));
}

function preferPhoneType(
  current: DcAwardRadarPhoneType | undefined,
  incoming: DcAwardRadarPhoneType | undefined,
): DcAwardRadarPhoneType | undefined {
  if (current === "cell" || incoming === "cell") return "cell";
  return current ?? incoming;
}

function preferEmailType(
  current: DcAwardRadarEmailType | undefined,
  incoming: DcAwardRadarEmailType | undefined,
): DcAwardRadarEmailType | undefined {
  if (current === "direct" || incoming === "direct") return "direct";
  return current ?? incoming;
}

function preferConfidence(
  current: DcAwardRadarConfidence,
  incoming: DcAwardRadarConfidence,
): DcAwardRadarConfidence {
  return CONFIDENCE_RANK[incoming] < CONFIDENCE_RANK[current]
    ? incoming
    : current;
}

function emptyUnique(identityKey: string): DcAwardRadarUniqueContact {
  return {
    identityKey,
    company: "",
    contactName: "",
    contactTitle: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    companyWebsite: "",
    markets: [],
    projects: [],
    trades: [],
    categories: [],
    confidence: "low",
    hasPhone: false,
    hasEmail: false,
    hasLinkedIn: false,
    hasCell: false,
  };
}

function mergeUniqueContact(
  current: DcAwardRadarUniqueContact,
  row: DcAwardRadarContactSourceRow,
): DcAwardRadarUniqueContact {
  const phone = firstNonEmpty(current.phone, row.phone);
  const email = firstNonEmpty(current.email, row.email);
  const linkedinUrl = firstNonEmpty(current.linkedinUrl, row.linkedinUrl);
  const hasPhone = current.hasPhone || Boolean(row.phone?.trim());
  const hasEmail = current.hasEmail || Boolean(row.email?.trim());
  const hasLinkedIn = current.hasLinkedIn || Boolean(row.linkedinUrl?.trim());
  const hasCell =
    current.hasCell || (Boolean(row.phone?.trim()) && row.phoneType === "cell");
  return {
    identityKey: current.identityKey,
    company: firstNonEmpty(current.company, row.company),
    contactName: firstNonEmpty(current.contactName, row.contactName),
    contactTitle: firstNonEmpty(current.contactTitle, row.contactTitle),
    email,
    phone,
    phoneType: preferPhoneType(current.phoneType, row.phoneType),
    emailType: preferEmailType(current.emailType, row.emailType),
    linkedinUrl,
    companyWebsite: firstNonEmpty(current.companyWebsite, row.companyWebsite),
    markets: pushUniqueSorted(current.markets, row.market),
    projects: pushUniqueSorted(current.projects, row.projectOrCampus),
    trades: pushUniqueSorted(current.trades, row.tradeFocus),
    categories: pushUniqueCategory(current.categories, row.category),
    confidence: preferConfidence(current.confidence, row.confidence),
    hasPhone,
    hasEmail,
    hasLinkedIn,
    hasCell,
  };
}

export function collectUniqueDcAwardContacts(
  rows: readonly DcAwardRadarContactSourceRow[],
): DcAwardRadarUniqueContact[] {
  const byKey = new Map<string, DcAwardRadarUniqueContact>();
  for (const row of rows) {
    const key = dcAwardContactIdentityKey(row);
    if (!key) continue;
    const existing = byKey.get(key) ?? emptyUnique(key);
    byKey.set(key, mergeUniqueContact(existing, row));
  }
  return [...byKey.values()].sort((a, b) => {
    const companyCmp = a.company.localeCompare(b.company);
    if (companyCmp !== 0) return companyCmp;
    return a.contactName.localeCompare(b.contactName);
  });
}

export function uniqueContactMatchesFilters(
  contact: DcAwardRadarUniqueContact,
  filters: DcAwardRadarContactFilterSet,
): boolean {
  if (filters.size === 0) return true;
  if (filters.has("hasPhone") && !contact.hasPhone) return false;
  if (filters.has("hasEmail") && !contact.hasEmail) return false;
  if (filters.has("hasLinkedIn") && !contact.hasLinkedIn) return false;
  if (filters.has("hasCell") && !contact.hasCell) return false;
  if (filters.has("missingPhone") && contact.hasPhone) return false;
  if (filters.has("missingEmail") && contact.hasEmail) return false;
  return true;
}

export function filterUniqueDcAwardContacts(
  contacts: readonly DcAwardRadarUniqueContact[],
  filters: DcAwardRadarContactFilterSet,
): DcAwardRadarUniqueContact[] {
  if (filters.size === 0) return [...contacts];
  return contacts.filter((contact) =>
    uniqueContactMatchesFilters(contact, filters),
  );
}

/**
 * Keep signal rows whose unique contact matches the contact filters.
 * When any filter is on, rows with no contact identity are hidden.
 */
export function filterSignalsByContactFilters<
  T extends DcAwardRadarContactSourceRow,
>(rows: readonly T[], filters: DcAwardRadarContactFilterSet): T[] {
  if (filters.size === 0) return [...rows];
  const allowed = new Set(
    filterUniqueDcAwardContacts(collectUniqueDcAwardContacts(rows), filters).map(
      (contact) => contact.identityKey,
    ),
  );
  return rows.filter((row) => {
    const key = dcAwardContactIdentityKey(row);
    return key !== null && allowed.has(key);
  });
}

export function toggleDcAwardContactFilter(
  current: DcAwardRadarContactFilterSet,
  id: DcAwardRadarContactFilterId,
): Set<DcAwardRadarContactFilterId> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function uniqueContactHasGhlIdentity(
  contact: Pick<DcAwardRadarUniqueContact, "email" | "phone">,
): boolean {
  return Boolean(contact.email.trim() || contact.phone.trim());
}
