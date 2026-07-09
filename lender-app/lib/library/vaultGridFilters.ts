import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";

export type VaultGridTypeFilter = "pdf" | "image";
export type VaultGridStatusFilter = "pending" | "rejected";

export type VaultGridFilterRow = {
  latestContentType?: string;
  latestFileName?: string;
  reviewStatus?: "rejected";
  aiSuggestedCategory?: unknown;
  documentCategory?: unknown;
};

export function isVaultGridPdf(row: VaultGridFilterRow): boolean {
  return (
    guessAttachmentKind(row.latestContentType, row.latestFileName ?? "") ===
    "pdf"
  );
}

export function isVaultGridImage(row: VaultGridFilterRow): boolean {
  return (
    guessAttachmentKind(row.latestContentType, row.latestFileName ?? "") ===
    "image"
  );
}

/** Awaiting category acceptance or review — not rejected. */
export function isVaultGridPending(row: VaultGridFilterRow): boolean {
  if (row.reviewStatus === "rejected") return false;
  return Boolean(row.aiSuggestedCategory && row.documentCategory == null);
}

export function isVaultGridRejected(row: VaultGridFilterRow): boolean {
  return row.reviewStatus === "rejected";
}

function matchesTypeGroup(
  row: VaultGridFilterRow,
  filters: ReadonlySet<VaultGridTypeFilter>,
): boolean {
  if (filters.size === 0) return true;
  for (const filter of filters) {
    if (filter === "pdf" && isVaultGridPdf(row)) return true;
    if (filter === "image" && isVaultGridImage(row)) return true;
  }
  return false;
}

function matchesStatusGroup(
  row: VaultGridFilterRow,
  filters: ReadonlySet<VaultGridStatusFilter>,
): boolean {
  if (filters.size === 0) return true;
  for (const filter of filters) {
    if (filter === "rejected" && isVaultGridRejected(row)) return true;
    if (filter === "pending" && isVaultGridPending(row)) return true;
  }
  return false;
}

/** Additive AND across groups; OR within each pill group. */
export function applyVaultGridFilters<T extends VaultGridFilterRow>(
  rows: T[],
  typeFilters: ReadonlySet<VaultGridTypeFilter>,
  statusFilters: ReadonlySet<VaultGridStatusFilter>,
): T[] {
  return rows.filter(
    (row) =>
      matchesTypeGroup(row, typeFilters) &&
      matchesStatusGroup(row, statusFilters),
  );
}

export function toggleSetItem<T>(prev: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(prev);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}
