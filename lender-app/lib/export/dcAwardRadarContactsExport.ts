/**
 * Client-side CSV for filtered unique DC award-radar contacts.
 * Built from already-loaded list data — no scrape, no extra query.
 */

import {
  DC_AWARD_RADAR_GHL_SOURCE,
  buildDcAwardGhlTags,
} from "@/lib/dcAwardRadarGhl";
import type { DcAwardRadarUniqueContact } from "@/lib/dcAwardRadarContacts";
import { joinCsvDocument, joinCsvLine } from "@/lib/export/csvEscape";

export const DC_AWARD_RADAR_CONTACT_CSV_HEADERS = [
  "company",
  "contactName",
  "contactTitle",
  "email",
  "phone",
  "phoneType",
  "emailType",
  "linkedinUrl",
  "companyWebsite",
  "markets",
  "projects",
  "confidence",
] as const;

export const DC_AWARD_RADAR_GHL_HANDOFF_CSV_HEADERS = [
  ...DC_AWARD_RADAR_CONTACT_CSV_HEADERS,
  "source",
  "tags",
] as const;

function joinFieldList(values: readonly string[]): string {
  return values.join(" | ");
}

function contactCsvCells(contact: DcAwardRadarUniqueContact): unknown[] {
  return [
    contact.company,
    contact.contactName,
    contact.contactTitle,
    contact.email,
    contact.phone,
    contact.phoneType ?? "",
    contact.emailType ?? "",
    contact.linkedinUrl,
    contact.companyWebsite,
    joinFieldList(contact.markets),
    joinFieldList(contact.projects),
    contact.confidence,
  ];
}

export function buildDcAwardRadarContactsCsv(
  contacts: readonly DcAwardRadarUniqueContact[],
): string {
  const lines = [joinCsvLine([...DC_AWARD_RADAR_CONTACT_CSV_HEADERS])];
  for (const contact of contacts) {
    lines.push(joinCsvLine(contactCsvCells(contact)));
  }
  return joinCsvDocument(lines);
}

/** Tag-only HighLevel import CSV for Stacy/ops when API credentials are unset. */
export function buildDcAwardRadarGhlHandoffCsv(
  contacts: readonly DcAwardRadarUniqueContact[],
): string {
  const lines = [joinCsvLine([...DC_AWARD_RADAR_GHL_HANDOFF_CSV_HEADERS])];
  for (const contact of contacts) {
    const tags = buildDcAwardGhlTags({
      markets: contact.markets,
      trades: contact.trades,
    });
    lines.push(
      joinCsvLine([
        ...contactCsvCells(contact),
        DC_AWARD_RADAR_GHL_SOURCE,
        tags.join("; "),
      ]),
    );
  }
  return joinCsvDocument(lines);
}

export function dcAwardRadarContactsCsvFilename(now = new Date()): string {
  return `dc-award-radar-contacts-${now.toISOString().slice(0, 10)}.csv`;
}

export function dcAwardRadarGhlHandoffCsvFilename(now = new Date()): string {
  return `dc-award-radar-ghl-tag-only-${now.toISOString().slice(0, 10)}.csv`;
}
