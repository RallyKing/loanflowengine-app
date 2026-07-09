"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  VAULT_FILTER_CHIPS,
  type VaultCategoryFilter,
  type VaultTaxYearFilter,
} from "@/lib/library/documentVaultTaxonomy";
import {
  toggleSetItem,
  type VaultGridStatusFilter,
  type VaultGridTypeFilter,
} from "@/lib/library/vaultGridFilters";

export type DocumentVaultGridFilterBarProps = {
  typeFilters: ReadonlySet<VaultGridTypeFilter>;
  onTypeFiltersChange: (next: Set<VaultGridTypeFilter>) => void;
  statusFilters: ReadonlySet<VaultGridStatusFilter>;
  onStatusFiltersChange: (next: Set<VaultGridStatusFilter>) => void;
  categoryFilter: VaultCategoryFilter;
  onCategoryFilterChange: (filter: VaultCategoryFilter) => void;
  taxYearFilter?: VaultTaxYearFilter;
  onTaxYearFilterChange?: (year: VaultTaxYearFilter) => void;
  availableTaxYears?: readonly string[];
  className?: string;
};

const TYPE_PILLS: { id: VaultGridTypeFilter; label: string }[] = [
  { id: "pdf", label: "PDF" },
  { id: "image", label: "Images" },
];

const STATUS_PILLS: { id: VaultGridStatusFilter; label: string }[] = [
  { id: "pending", label: "Pending signature" },
  { id: "rejected", label: "Rejected" },
];

function FilterPill({
  label,
  selected,
  onClick,
  testId,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 touch-manipulation items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/70 bg-background text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function DocumentVaultGridFilterBar({
  typeFilters,
  onTypeFiltersChange,
  statusFilters,
  onStatusFiltersChange,
  categoryFilter,
  onCategoryFilterChange,
  taxYearFilter = "all",
  onTaxYearFilterChange,
  availableTaxYears = [],
  className,
}: DocumentVaultGridFilterBarProps) {
  const showTaxYears = categoryFilter === "tax_return";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 border-b border-border/60 pb-2",
        className,
      )}
      data-testid="document-vault-grid-filter-bar"
      aria-label="Document grid filters"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Type
        </span>
        {TYPE_PILLS.map((pill) => (
          <FilterPill
            key={pill.id}
            label={pill.label}
            selected={typeFilters.has(pill.id)}
            testId={`document-vault-grid-filter-type-${pill.id}`}
            onClick={() =>
              onTypeFiltersChange(toggleSetItem(typeFilters, pill.id))
            }
          />
        ))}
        <span className="mx-1 hidden h-4 w-px shrink-0 bg-border/70 sm:inline-block" />
        <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        {STATUS_PILLS.map((pill) => (
          <FilterPill
            key={pill.id}
            label={pill.label}
            selected={statusFilters.has(pill.id)}
            testId={`document-vault-grid-filter-status-${pill.id}`}
            onClick={() =>
              onStatusFiltersChange(toggleSetItem(statusFilters, pill.id))
            }
          />
        ))}
        <div className="relative ml-auto min-w-[8.5rem]">
          <label className="sr-only" htmlFor="document-vault-grid-category">
            Category filter
          </label>
          <select
            id="document-vault-grid-category"
            value={categoryFilter}
            onChange={(e) =>
              onCategoryFilterChange(e.target.value as VaultCategoryFilter)
            }
            data-testid="document-vault-grid-category-select"
            className="h-7 w-full appearance-none rounded-dlc-sm border border-border/70 bg-background pl-2 pr-7 text-[11px] font-medium text-foreground"
          >
            {VAULT_FILTER_CHIPS.map((chip) => (
              <option key={chip.id} value={chip.id}>
                {chip.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>

      {showTaxYears ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-1"
          role="group"
          aria-label="Filter tax returns by year"
          data-testid="document-vault-grid-tax-year-filters"
        >
          <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Year
          </span>
          <FilterPill
            label="All years"
            selected={taxYearFilter === "all"}
            testId="document-vault-grid-tax-year-all"
            onClick={() => onTaxYearFilterChange?.("all")}
          />
          {availableTaxYears.map((year) => (
            <FilterPill
              key={year}
              label={year}
              selected={taxYearFilter === year}
              testId={`document-vault-grid-tax-year-${year}`}
              onClick={() => onTaxYearFilterChange?.(year)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
