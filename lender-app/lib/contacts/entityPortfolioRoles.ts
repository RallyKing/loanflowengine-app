/**
 * Entity portfolio — position categorization for individual ↔ entity links.
 */

export const OWNERSHIP_POSITIONS = [
  "Owner",
  "Member",
  "Managing Member",
  "Partner",
  "Guarantor",
] as const;

export const OPERATIONAL_POSITIONS = [
  "President",
  "CEO",
  "CFO",
  "COO",
  "Director",
  "Officer",
  "Manager",
] as const;

export type EntityPositionCategory = "ownership" | "operational" | "other";

function normalizePositionKey(position: string): string {
  return position.trim().toLowerCase();
}

export function entityPositionCategory(
  position: string | undefined,
): EntityPositionCategory {
  const key = normalizePositionKey(position ?? "");
  if (!key) return "other";
  if (
    OWNERSHIP_POSITIONS.some((p) => normalizePositionKey(p) === key) ||
    key.includes("owner") ||
    key.includes("partner") ||
    key.includes("member") ||
    key.includes("guarantor")
  ) {
    return "ownership";
  }
  if (
    OPERATIONAL_POSITIONS.some((p) => normalizePositionKey(p) === key) ||
    key.includes("president") ||
    key.includes("ceo") ||
    key.includes("cfo") ||
    key.includes("coo") ||
    key.includes("director") ||
    key.includes("officer")
  ) {
    return "operational";
  }
  return "other";
}

export function entityPositionCategoryLabel(
  category: EntityPositionCategory,
): string {
  switch (category) {
    case "ownership":
      return "Ownership";
    case "operational":
      return "Operational";
    default:
      return "Other";
  }
}

export function portfolioCountLabel(count: number): string {
  if (count === 0) return "No entities in portfolio";
  if (count === 1) return "1 entity managed";
  return `${count} entities managed`;
}
