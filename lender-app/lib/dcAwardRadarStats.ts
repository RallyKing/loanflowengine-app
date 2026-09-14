/**
 * Client-side lead counts for the DC award-radar list page.
 *
 * Counts use the already-filtered, `.take(200)` `dcAwardSignals.list` page —
 * no extra Convex query, no `.collect()`, no scheduler.
 *
 * Uniqueness (unique contacts):
 * 1. `company + contactName` when both are non-empty (normalized)
 * 2. else non-empty contact identity: contactName, then email, then phone
 *    digits (7+), then linkedinUrl
 * Rows with none of those keys are signals only — they do not inflate contacts.
 * Campus children that share a key collapse to one contact; phone/email/
 * LinkedIn/cell flags are OR'd across rows that share that key.
 */

import { collapseWs } from "./dcAwardRadar";
import type { DcAwardRadarConfidence } from "./dcAwardRadar";
import type { DcAwardRadarListContact } from "./dcAwardRadarCampus";

export type DcAwardRadarLeadStatRow = {
  company: string;
  confidence: DcAwardRadarConfidence;
} & DcAwardRadarListContact;

export type DcAwardRadarLeadStats = {
  signalCount: number;
  campusGroupCount: number;
  uniqueContactCount: number;
  contactsWithPhone: number;
  contactsWithEmail: number;
  contactsWithLinkedIn: number;
  contactsWithCell: number;
  highConfidenceSignalCount: number;
};

const EMPTY_LEAD_STATS: DcAwardRadarLeadStats = {
  signalCount: 0,
  campusGroupCount: 0,
  uniqueContactCount: 0,
  contactsWithPhone: 0,
  contactsWithEmail: 0,
  contactsWithLinkedIn: 0,
  contactsWithCell: 0,
  highConfidenceSignalCount: 0,
};

export function dcAwardPhoneIdentityDigits(
  phone: string | undefined,
): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Stable identity for one owner/principal. Prefer company+name so campus
 * children (same GC, same person) do not count as multiple leads.
 */
export function dcAwardContactIdentityKey(
  row: Pick<DcAwardRadarLeadStatRow, "company"> & DcAwardRadarListContact,
): string | null {
  const company = collapseWs(row.company ?? "").toLowerCase();
  const name = collapseWs(row.contactName ?? "").toLowerCase();
  if (company && name) return `company-name:${company}|${name}`;
  if (name) return `name:${name}`;

  const email = collapseWs(row.email ?? "").toLowerCase();
  if (email) return `email:${email}`;

  const phone = dcAwardPhoneIdentityDigits(row.phone);
  if (phone) return `phone:${phone}`;

  const linkedin = collapseWs(row.linkedinUrl ?? "").toLowerCase();
  if (linkedin) return `linkedin:${linkedin}`;

  return null;
}

type ContactChannelFlags = {
  phone: boolean;
  email: boolean;
  linkedin: boolean;
  cell: boolean;
};

function emptyFlags(): ContactChannelFlags {
  return { phone: false, email: false, linkedin: false, cell: false };
}

function mergeRowFlags(
  current: ContactChannelFlags,
  row: DcAwardRadarListContact,
): ContactChannelFlags {
  const hasPhone = Boolean(row.phone?.trim());
  return {
    phone: current.phone || hasPhone,
    email: current.email || Boolean(row.email?.trim()),
    linkedin: current.linkedin || Boolean(row.linkedinUrl?.trim()),
    cell: current.cell || (hasPhone && row.phoneType === "cell"),
  };
}

export function summarizeDcAwardRadarLeads(
  rows: readonly DcAwardRadarLeadStatRow[],
  campusGroupCount: number,
): DcAwardRadarLeadStats {
  if (rows.length === 0) {
    return { ...EMPTY_LEAD_STATS, campusGroupCount };
  }

  const contacts = new Map<string, ContactChannelFlags>();
  let highConfidenceSignalCount = 0;

  for (const row of rows) {
    if (row.confidence === "high") highConfidenceSignalCount += 1;
    const key = dcAwardContactIdentityKey(row);
    if (!key) continue;
    const existing = contacts.get(key) ?? emptyFlags();
    contacts.set(key, mergeRowFlags(existing, row));
  }

  let contactsWithPhone = 0;
  let contactsWithEmail = 0;
  let contactsWithLinkedIn = 0;
  let contactsWithCell = 0;
  for (const flags of contacts.values()) {
    if (flags.phone) contactsWithPhone += 1;
    if (flags.email) contactsWithEmail += 1;
    if (flags.linkedin) contactsWithLinkedIn += 1;
    if (flags.cell) contactsWithCell += 1;
  }

  return {
    signalCount: rows.length,
    campusGroupCount,
    uniqueContactCount: contacts.size,
    contactsWithPhone,
    contactsWithEmail,
    contactsWithLinkedIn,
    contactsWithCell,
    highConfidenceSignalCount,
  };
}
