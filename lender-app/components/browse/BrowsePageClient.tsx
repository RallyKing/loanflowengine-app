"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { LenderTable } from "@/components/LenderTable";

export function BrowsePageClient({
  embedded = false,
  quickSearch,
  onQuickSearchChange,
  hideQuickSearchField,
  initialOpenLenderId = null,
}: {
  embedded?: boolean;
  quickSearch?: string;
  onQuickSearchChange?: (value: string) => void;
  hideQuickSearchField?: boolean;
  initialOpenLenderId?: Id<"lenders"> | null;
}) {
  const table = (
    <LenderTable
      quickSearch={quickSearch}
      onQuickSearchChange={onQuickSearchChange}
      hideQuickSearchField={hideQuickSearchField}
      initialOpenLenderId={initialOpenLenderId}
    />
  );
  if (embedded) {
    return table;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lender Database</h1>
        <p className="text-sm text-muted-foreground">
          Search and filter funding sources. Click a row to view full details,
          edit, or delete.
        </p>
      </div>
      {table}
    </div>
  );
}
