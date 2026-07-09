import type { DealInfoSectionId } from "@/lib/file/dealInfoTabLayout";

/** Deal Info command-center tab — terms, parties, licensing. */
export const DEAL_INFO_IDENTITY_SECTION_IDS: DealInfoSectionId[] = [
  "fileDetails",
  "licensing",
  "borrowers",
  "guarantors",
];

/** Financials command-center tab — underwriting schedules and ratios. */
export const DEAL_INFO_FINANCIAL_SECTION_IDS: DealInfoSectionId[] = [
  "household",
  "income",
  "assets",
  "reo",
  "businessDebt",
];

export type DealInfoSectionGroup = "all" | "identity" | "financials";

export function dealInfoSectionsForGroup(
  group: DealInfoSectionGroup,
): Set<DealInfoSectionId> | null {
  if (group === "all") return null;
  if (group === "identity") {
    return new Set(DEAL_INFO_IDENTITY_SECTION_IDS);
  }
  return new Set(DEAL_INFO_FINANCIAL_SECTION_IDS);
}
