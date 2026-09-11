/** Intake Track Record row ↔ CRM `contactTrackRecordProperties`. */
import type { DealTrackRecordRow } from "@/lib/trackRecord/trackRecordModel";
import {
  contactIdsAssociatedWithTrackRecordRow,
  trackRecordRowHasIdentity,
  type TrackRecordBlockMeta,
} from "@/lib/trackRecord/trackRecordModel";

export type ContactTrackRecordPropertyShape = {
  sortOrder: number;
  propertyAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  titleHeldInName?: string;
  acquisitionDate?: string;
  acquisitionPrice?: string;
  projectType?: string;
  rehabOrConstructionAmount?: string;
  exitType?: string;
  dateSoldOrLeased?: string;
  salePriceOrRentAmount?: string;
};

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normKey(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function trackRecordFingerprintFromLegacyRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as DealTrackRecordRow;
  return `${normKey(rec.address)}|${normKey(rec.city)}|${normKey(rec.state)}|${normKey(rec.zip)}|${normKey(rec.acquisitionDate)}`;
}

export function trackRecordFingerprintFromProfileShape(
  row: ContactTrackRecordPropertyShape,
): string {
  return `${normKey(row.propertyAddress)}|${normKey(row.city)}|${normKey(row.state)}|${normKey(row.zip)}|${normKey(row.acquisitionDate)}`;
}

export function trackRecordFingerprintFromStoredProperty(row: {
  propertyAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  acquisitionDate?: string;
}): string {
  return `${normKey(row.propertyAddress)}|${normKey(row.city)}|${normKey(row.state)}|${normKey(row.zip)}|${normKey(row.acquisitionDate)}`;
}

export function trackRecordRowToProfileShape(
  row: unknown,
  sortOrder: number,
): ContactTrackRecordPropertyShape {
  if (!row || typeof row !== "object") return { sortOrder };
  const rec = row as DealTrackRecordRow;
  return {
    sortOrder,
    ...(strField(rec.address) !== undefined
      ? { propertyAddress: strField(rec.address) }
      : {}),
    ...(strField(rec.city) !== undefined ? { city: strField(rec.city) } : {}),
    ...(strField(rec.state) !== undefined ? { state: strField(rec.state) } : {}),
    ...(strField(rec.zip) !== undefined ? { zip: strField(rec.zip) } : {}),
    ...(strField(rec.propertyType) !== undefined
      ? { propertyType: strField(rec.propertyType) }
      : {}),
    ...(strField(rec.titleHeldInName) !== undefined
      ? { titleHeldInName: strField(rec.titleHeldInName) }
      : {}),
    ...(strField(rec.acquisitionDate) !== undefined
      ? { acquisitionDate: strField(rec.acquisitionDate) }
      : {}),
    ...(strField(rec.acquisitionPrice) !== undefined
      ? { acquisitionPrice: strField(rec.acquisitionPrice) }
      : {}),
    ...(strField(rec.projectType) !== undefined
      ? { projectType: strField(rec.projectType) }
      : {}),
    ...(strField(rec.rehabOrConstructionAmount) !== undefined
      ? { rehabOrConstructionAmount: strField(rec.rehabOrConstructionAmount) }
      : {}),
    ...(strField(rec.exitType) !== undefined
      ? { exitType: strField(rec.exitType) }
      : {}),
    ...(strField(rec.dateSoldOrLeased) !== undefined
      ? { dateSoldOrLeased: strField(rec.dateSoldOrLeased) }
      : {}),
    ...(strField(rec.salePriceOrRentAmount) !== undefined
      ? { salePriceOrRentAmount: strField(rec.salePriceOrRentAmount) }
      : {}),
  };
}

export function trackRecordProfileShapeToDealRow(
  row: ContactTrackRecordPropertyShape,
  assignedContactIds?: string[],
): DealTrackRecordRow {
  return {
    ...(row.propertyAddress ? { address: row.propertyAddress } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.state ? { state: row.state } : {}),
    ...(row.zip ? { zip: row.zip } : {}),
    ...(row.propertyType ? { propertyType: row.propertyType } : {}),
    ...(row.titleHeldInName ? { titleHeldInName: row.titleHeldInName } : {}),
    ...(row.acquisitionDate ? { acquisitionDate: row.acquisitionDate } : {}),
    ...(row.acquisitionPrice ? { acquisitionPrice: row.acquisitionPrice } : {}),
    ...(row.projectType ? { projectType: row.projectType } : {}),
    ...(row.rehabOrConstructionAmount
      ? { rehabOrConstructionAmount: row.rehabOrConstructionAmount }
      : {}),
    ...(row.exitType ? { exitType: row.exitType } : {}),
    ...(row.dateSoldOrLeased ? { dateSoldOrLeased: row.dateSoldOrLeased } : {}),
    ...(row.salePriceOrRentAmount
      ? { salePriceOrRentAmount: row.salePriceOrRentAmount }
      : {}),
    ...(assignedContactIds && assignedContactIds.length > 0
      ? { assignedContactIds }
      : {}),
  };
}

export function trackRecordRowsForContact(
  rows: readonly unknown[],
  meta: TrackRecordBlockMeta | undefined | null,
  contactId: string,
): ContactTrackRecordPropertyShape[] {
  const id = contactId.trim();
  if (!id) return [];
  const out: ContactTrackRecordPropertyShape[] = [];
  let sort = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as DealTrackRecordRow;
    if (!trackRecordRowHasIdentity(rec)) continue;
    const associated = contactIdsAssociatedWithTrackRecordRow(rec, meta);
    const blockIds = meta?.assignedContactIds ?? [];
    if (!associated.includes(id) && !blockIds.includes(id)) continue;
    out.push(trackRecordRowToProfileShape(rec, sort));
    sort += 1;
  }
  return out;
}
