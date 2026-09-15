/**
 * Client-side CSV for filtered unique DC award-radar contacts.
 * Built from already-loaded list data — no scrape, no extra query.
 */

import {
  buildDcAwardGhlSource,
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
  selection: Pick<DcAwardGhlContactBatch<unknown>, "sent" | "total">,
): string {
  return `GHL handoff: all ${selection.sent} GHL-eligible contacts (same full send set as Send to GHL; no send-size cap). Download contacts CSV for the full filtered unique set.`;
}

/** Tag-only HighLevel import CSV — same full eligible send set as Send to GHL. */
export function buildDcAwardRadarGhlHandoffCsv(
  contacts: readonly DcAwardRadarUniqueContact[],
  selection?: Pick<DcAwardGhlContactBatch<unknown>, "sent" | "total">,
): string {
  const note = dcAwardGhlHandoffExportNote(
    selection ?? {
      sent: contacts.length,
      total: contacts.length,
    },
  );
  const lines = [joinCsvLine([...DC_AWARD_RADAR_GHL_HANDOFF_CSV_HEADERS])];
  for (const contact of contacts) {
    const tags = buildDcAwardGhlTags({
      categories: contact.categories,
    });
    lines.push(
      joinCsvLine([
        ...contactCsvCells(contact),
        buildDcAwardGhlSource(contact.linkedinUrl),
        tags.join("; "),
        note,
      ]),
    );
  }
  return joinCsvDocument(lines);
}

export function dcAwardRadarContactsCsvFilename(now = new Date()): string {
  return `award-radar-contacts-full-filtered-${now.toISOString().slice(0, 10)}.csv`;
}

export function dcAwardRadarGhlHandoffCsvFilename(now = new Date()): string {
  return `award-radar-ghl-tag-only-${now.toISOString().slice(0, 10)}.csv`;
}
