import type { LibraryDocumentCategory } from "@/lib/library/documentVaultTaxonomy";

/** Default shelf-life per category (days). Omit = no automatic expiry. */
export const DOCUMENT_CATEGORY_EXPIRATION_DAYS: Partial<
  Record<LibraryDocumentCategory, number>
> = {
  /** Bank statements, paystubs, deal-specific underwriting docs. */
  deal_specific: 90,
  client_submitted: 90,
  id: 365,
  tax_return: 365,
  dd214: 365 * 5,
};

/** Yellow warning badge when within this many days of expiry. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export type DocumentExpiryStatus =
  | "none"
  | "active"
  | "expiring_soon"
  | "expired";

export function expirationDaysForCategory(
  category: LibraryDocumentCategory | null | undefined,
): number | null {
  if (!category) return null;
  const days = DOCUMENT_CATEGORY_EXPIRATION_DAYS[category];
  return typeof days === "number" && days > 0 ? days : null;
}

export function computeExpiresAt(
  uploadedAt: number | undefined,
  category: LibraryDocumentCategory | null | undefined,
): number | undefined {
  if (uploadedAt == null || uploadedAt <= 0) return undefined;
  const days = expirationDaysForCategory(category);
  if (days == null) return undefined;
  return uploadedAt + days * MS_PER_DAY;
}

export function resolveDocumentExpiryStatus(
  expiresAt: number | undefined,
  now = Date.now(),
): DocumentExpiryStatus {
  if (expiresAt == null) return "none";
  if (now >= expiresAt) return "expired";
  const warningAt =
    expiresAt - DOCUMENT_EXPIRY_WARNING_DAYS * MS_PER_DAY;
  if (now >= warningAt) return "expiring_soon";
  return "active";
}

export function daysUntilExpiry(
  expiresAt: number | undefined,
  now = Date.now(),
): number | null {
  if (expiresAt == null) return null;
  return Math.ceil((expiresAt - now) / MS_PER_DAY);
}

export function effectiveLinkExpiresAt(
  link: {
    expiresAt?: number;
    documentCategory?: LibraryDocumentCategory;
  },
  latestUploadedAt: number | undefined,
): number | undefined {
  if (link.expiresAt != null) return link.expiresAt;
  return computeExpiresAt(latestUploadedAt, link.documentCategory);
}
