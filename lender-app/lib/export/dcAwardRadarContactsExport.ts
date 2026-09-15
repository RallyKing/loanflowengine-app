/**
 * Client-side CSV for filtered unique DC award-radar contacts.
 * Built from already-loaded list data — no scrape, no extra query.
 */

import {
  DC_AWARD_RADAR_GHL_MAX_CONTACTS,
  DC_AWARD_RADAR_GHL_SOURCE,
  buildDcAwardGhlTags,
  type DcAwardGhlContactBatch,
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
  "exportNote",
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

export function dcAwardGhlHandoffExportNote(
  selection: Pick<
    DcAwardGhlContactBatch<unknown>,
    "sent" | "total" | "truncated"
  >,
): string {
  if (selection.truncated) {
    return `GHL handoff cap: first ${selection.sent} of ${selection.total} (same as Send). Download contacts CSV for the full filtered set.`;
  }
  return `GHL handoff: ${selection.sent} of ${selection.total} filtered unique contacts (at or under ${DC_AWARD_RADAR_GHL_MAX_CONTACTS}-contact cap).`;
}

/** Tag-only HighLevel import CSV — same disclosed batch as Send to GHL. */
export function buildDcAwardRadarGhlHandoffCsv(
  contacts: readonly DcAwardRadarUniqueContact[],
  selection?: Pick<
    DcAwardGhlContactBatch<unknown>,
    "sent" | "total" | "truncated"
  >,
): string {
  const note = dcAwardGhlHandoffExportNote(
    selection ?? {
      sent: contacts.length,
      total: contacts.length,
      truncated: false,
    },
  );
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
        note,
      ]),
    );
  }
  return joinCsvDocument(lines);
}

export function dcAwardRadarContactsCsvFilename(now = new Date()): string {
  return `dc-award-radar-contacts-full-filtered-${now.toISOString().slice(0, 10)}.csv`;
}

export function dcAwardRadarGhlHandoffCsvFilename(
  selection?: Pick<
    DcAwardGhlContactBatch<unknown>,
    "sent" | "total" | "truncated"
  >,
  now = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  if (selection?.truncated) {
    return `dc-award-radar-ghl-tag-only-first-${selection.sent}-of-${selection.total}-${day}.csv`;
  }
  return `dc-award-radar-ghl-tag-only-${day}.csv`;
}
