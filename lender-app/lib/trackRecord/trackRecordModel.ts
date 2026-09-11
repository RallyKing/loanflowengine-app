/**
 * Investment Property Track Record — formulas mirror
 * `Track Record Template.xlsx` (sheet “Track Record”, rev 06.01.2025).
 *
 * Visible schedule (row 27 example, copied down through row 59):
 * - D Property Address · E City · F State · G Zip · H Property Type
 * - I–L Owned by Guarantor #1–#4 (Yes/No)
 * - M Title Held in Name · O Acquisition Date · P Acquisition Price
 * - Q Project Type · R Rehab or Construction Amount
 * - S Exit? (Sold or Leased) · T Date Sold or Leased (last 36 months)
 * - U Sale Price or Rent Amount
 *
 * Hidden helper columns (do not persist; derived):
 * - Y/Z/AA/AB Rehab experience per guarantor
 *     = AND(OR(Q="Rehab", Q="Extensive Rehab"), I/J/K/L="Yes")
 * - AD/AE/AF/AG New construction experience per guarantor
 *     = AND(Q="New Construction", I/J/K/L="Yes")
 *
 * Experience summary (rows 13/15/17/19 + qualifying row 21):
 * - Rehab H13 = COUNTIF(Y27:Y78, TRUE)   (same for Z/AA/AB → H15/H17/H19)
 * - New const J13 = COUNTIF(AD27:AD78, TRUE)
 * - Total N13 = H13+J13
 * - Qualifying H21/J21/N21 = MAX of the four guarantor totals
 *
 * Hidden “List” sheet: Sold | Leased (exit dropdown).
 *
 * Template leftover: rows 60–78 helper formulas are #REF! — DLC ignores them.
 */
import { formatUSD, toNumber } from "@/lib/intake/finance";
import {
  newScheduleRowId,
  normalizeContactIdList,
  type ScheduleBlockMeta,
} from "@/lib/schedule/contactIds";

export const TRACK_RECORD_VERSION = 1 as const;

export const TRACK_RECORD_PROPERTY_TYPE_OPTIONS = [
  "SFR",
  "PUD",
  "Townhome",
  "Condo",
  "2-4 Unit",
  "5+ Multi Family",
] as const;

export const TRACK_RECORD_PROJECT_TYPE_OPTIONS = [
  "Rehab",
  "Extensive Rehab",
  "New Construction",
] as const;

export const TRACK_RECORD_EXIT_OPTIONS = ["Sold", "Leased"] as const;

export const TRACK_RECORD_YES_NO = ["Yes", "No"] as const;

export const TRACK_RECORD_GUARANTOR_COUNT = 4 as const;

export type TrackRecordPropertyType =
  (typeof TRACK_RECORD_PROPERTY_TYPE_OPTIONS)[number];
export type TrackRecordProjectType =
  (typeof TRACK_RECORD_PROJECT_TYPE_OPTIONS)[number];
export type TrackRecordExitType = (typeof TRACK_RECORD_EXIT_OPTIONS)[number];
export type TrackRecordYesNo = (typeof TRACK_RECORD_YES_NO)[number];

export type TrackRecordGuarantorSlot = {
  name?: string;
  /** Optional CRM contact id for this Excel guarantor column. */
  contactId?: string;
};

export type DealTrackRecordRow = {
  rowId?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  ownedByGuarantor1?: string;
  ownedByGuarantor2?: string;
  ownedByGuarantor3?: string;
  ownedByGuarantor4?: string;
  titleHeldInName?: string;
  acquisitionDate?: string;
  acquisitionPrice?: string;
  projectType?: string;
  rehabOrConstructionAmount?: string;
  exitType?: string;
  dateSoldOrLeased?: string;
  salePriceOrRentAmount?: string;
  assignedContactIds?: string[];
};

export type TrackRecordBlockMeta = ScheduleBlockMeta & {
  guarantors?: TrackRecordGuarantorSlot[];
};

export type TrackRecordGuarantorExperience = {
  name: string;
  contactId?: string;
  rehabCount: number;
  newConstructionCount: number;
  total: number;
};

export type TrackRecordExperienceSummary = {
  guarantors: TrackRecordGuarantorExperience[];
  qualifyingRehab: number;
  qualifyingNewConstruction: number;
  qualifyingTotal: number;
};

export type TrackRecordScheduleTotals = {
  acquisitionPrice: number;
  rehabOrConstructionAmount: number;
  salePriceOrRentAmount: number;
  propertyCount: number;
};

const OWNED_KEYS = [
  "ownedByGuarantor1",
  "ownedByGuarantor2",
  "ownedByGuarantor3",
  "ownedByGuarantor4",
] as const;

export function newTrackRecordRowId(): string {
  return newScheduleRowId("tr");
}

export function createEmptyTrackRecordRow(
  defaults?: Partial<DealTrackRecordRow>,
): DealTrackRecordRow {
  return {
    rowId: newTrackRecordRowId(),
    ownedByGuarantor1: "No",
    ownedByGuarantor2: "No",
    ownedByGuarantor3: "No",
    ownedByGuarantor4: "No",
    ...defaults,
  };
}

export function createEmptyTrackRecordGuarantors(): TrackRecordGuarantorSlot[] {
  return [{}, {}, {}, {}];
}

export function createEmptyTrackRecordMeta(
  defaults?: Partial<TrackRecordBlockMeta>,
): TrackRecordBlockMeta {
  return {
    assignedContactIds: [],
    guarantors: createEmptyTrackRecordGuarantors(),
    ...defaults,
  };
}

export function normalizeYesNo(
  value: unknown,
): TrackRecordYesNo | "" {
  const raw = String(value ?? "").trim();
  if (raw === "Yes" || raw === "yes" || raw === "Y" || raw === "true") {
    return "Yes";
  }
  if (raw === "No" || raw === "no" || raw === "N" || raw === "false") {
    return "No";
  }
  return "";
}

export function isRehabProjectType(projectType: string | undefined | null): boolean {
  const t = (projectType ?? "").trim();
  return t === "Rehab" || t === "Extensive Rehab";
}

export function isNewConstructionProjectType(
  projectType: string | undefined | null,
): boolean {
  return (projectType ?? "").trim() === "New Construction";
}

/** Hidden Y/Z/AA/AB — rehab experience flag for guarantor index 0–3. */
export function rowHasRehabExperience(
  row: DealTrackRecordRow | undefined | null,
  guarantorIndex: number,
): boolean {
  if (!row || guarantorIndex < 0 || guarantorIndex > 3) return false;
  if (!isRehabProjectType(row.projectType)) return false;
  return normalizeYesNo(row[OWNED_KEYS[guarantorIndex]]) === "Yes";
}

/** Hidden AD/AE/AF/AG — new construction experience flag for guarantor index 0–3. */
export function rowHasNewConstructionExperience(
  row: DealTrackRecordRow | undefined | null,
  guarantorIndex: number,
): boolean {
  if (!row || guarantorIndex < 0 || guarantorIndex > 3) return false;
  if (!isNewConstructionProjectType(row.projectType)) return false;
  return normalizeYesNo(row[OWNED_KEYS[guarantorIndex]]) === "Yes";
}

export function normalizeTrackRecordGuarantors(
  raw: unknown,
): TrackRecordGuarantorSlot[] {
  const source = Array.isArray(raw) ? raw : [];
  const out: TrackRecordGuarantorSlot[] = [];
  for (let i = 0; i < TRACK_RECORD_GUARANTOR_COUNT; i += 1) {
    const rec =
      source[i] && typeof source[i] === "object"
        ? (source[i] as TrackRecordGuarantorSlot)
        : {};
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const contactId =
      typeof rec.contactId === "string" ? rec.contactId.trim() : "";
    out.push({
      ...(name ? { name } : {}),
      ...(contactId ? { contactId } : {}),
    });
  }
  return out;
}

export function normalizeTrackRecordMeta(raw: unknown): TrackRecordBlockMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyTrackRecordMeta();
  }
  const rec = raw as TrackRecordBlockMeta;
  return {
    assignedContactIds: normalizeContactIdList(rec.assignedContactIds),
    guarantors: normalizeTrackRecordGuarantors(rec.guarantors),
  };
}

export function computeTrackRecordExperience(
  rows: readonly DealTrackRecordRow[] | undefined | null,
  meta?: TrackRecordBlockMeta | null,
): TrackRecordExperienceSummary {
  const list = Array.isArray(rows) ? rows : [];
  const slots = normalizeTrackRecordGuarantors(meta?.guarantors);
  const guarantors: TrackRecordGuarantorExperience[] = slots.map((slot, i) => {
    let rehabCount = 0;
    let newConstructionCount = 0;
    for (const row of list) {
      if (rowHasRehabExperience(row, i)) rehabCount += 1;
      if (rowHasNewConstructionExperience(row, i)) newConstructionCount += 1;
    }
    return {
      name: slot.name?.trim() || `Guarantor #${i + 1}`,
      ...(slot.contactId ? { contactId: slot.contactId } : {}),
      rehabCount,
      newConstructionCount,
      total: rehabCount + newConstructionCount,
    };
  });
  const qualifyingRehab = Math.max(...guarantors.map((g) => g.rehabCount), 0);
  const qualifyingNewConstruction = Math.max(
    ...guarantors.map((g) => g.newConstructionCount),
    0,
  );
  const qualifyingTotal = Math.max(...guarantors.map((g) => g.total), 0);
  return {
    guarantors,
    qualifyingRehab,
    qualifyingNewConstruction,
    qualifyingTotal,
  };
}

export function computeTrackRecordScheduleTotals(
  rows: readonly DealTrackRecordRow[] | undefined | null,
): TrackRecordScheduleTotals {
  const list = Array.isArray(rows) ? rows : [];
  let acquisitionPrice = 0;
  let rehabOrConstructionAmount = 0;
  let salePriceOrRentAmount = 0;
  let propertyCount = 0;
  for (const row of list) {
    if (!trackRecordRowHasIdentity(row)) continue;
    propertyCount += 1;
    acquisitionPrice += toNumber(row.acquisitionPrice);
    rehabOrConstructionAmount += toNumber(row.rehabOrConstructionAmount);
    salePriceOrRentAmount += toNumber(row.salePriceOrRentAmount);
  }
  return {
    acquisitionPrice,
    rehabOrConstructionAmount,
    salePriceOrRentAmount,
    propertyCount,
  };
}

export function formatTrackRecordUsd(n: number): string {
  return formatUSD(n);
}

export function trackRecordRowHasIdentity(
  row: DealTrackRecordRow | undefined | null,
): boolean {
  if (!row) return false;
  return Boolean(
    (row.address ?? "").trim() ||
      (row.city ?? "").trim() ||
      (row.titleHeldInName ?? "").trim() ||
      (row.acquisitionDate ?? "").trim() ||
      (row.acquisitionPrice ?? "").trim() ||
      (row.projectType ?? "").trim() ||
      (row.rehabOrConstructionAmount ?? "").trim() ||
      (row.dateSoldOrLeased ?? "").trim() ||
      (row.salePriceOrRentAmount ?? "").trim(),
  );
}

export function cloneTrackRecordRowForCopy(
  row: DealTrackRecordRow,
): DealTrackRecordRow {
  const assignedContactIds = normalizeContactIdList(row.assignedContactIds);
  return {
    ...row,
    rowId: newTrackRecordRowId(),
    ownedByGuarantor1: normalizeYesNo(row.ownedByGuarantor1) || "No",
    ownedByGuarantor2: normalizeYesNo(row.ownedByGuarantor2) || "No",
    ownedByGuarantor3: normalizeYesNo(row.ownedByGuarantor3) || "No",
    ownedByGuarantor4: normalizeYesNo(row.ownedByGuarantor4) || "No",
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
  };
}

export function contactIdsAssociatedWithTrackRecordRow(
  row: DealTrackRecordRow,
  meta?: TrackRecordBlockMeta | null,
): string[] {
  const slots = normalizeTrackRecordGuarantors(meta?.guarantors);
  const fromFlags: string[] = [];
  for (let i = 0; i < TRACK_RECORD_GUARANTOR_COUNT; i += 1) {
    if (normalizeYesNo(row[OWNED_KEYS[i]]) !== "Yes") continue;
    const id = slots[i]?.contactId?.trim();
    if (id) fromFlags.push(id);
  }
  return normalizeContactIdList([
    ...(row.assignedContactIds ?? []),
    ...fromFlags,
  ]);
}

export function allTrackRecordAssociatedContactIds(input: {
  rows: readonly DealTrackRecordRow[] | undefined | null;
  meta?: TrackRecordBlockMeta | null;
}): string[] {
  const meta = normalizeTrackRecordMeta(input.meta);
  const fromRows: string[] = [];
  for (const row of input.rows ?? []) {
    fromRows.push(...contactIdsAssociatedWithTrackRecordRow(row, meta));
  }
  return normalizeContactIdList([
    ...(meta.assignedContactIds ?? []),
    ...fromRows,
    ...normalizeTrackRecordGuarantors(meta.guarantors)
      .map((g) => g.contactId)
      .filter(Boolean) as string[],
  ]);
}
