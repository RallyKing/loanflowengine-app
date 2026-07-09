"use client";

import { cn } from "@/lib/cn";
import {
  VAULT_FILTER_CHIPS,
  type VaultCategoryFilter,
  type VaultTaxYearFilter,
} from "@/lib/library/documentVaultTaxonomy";

export type DocumentVaultFilterBarProps = {
  activeFilter: VaultCategoryFilter;
  onFilterChange: (filter: VaultCategoryFilter) => void;
  activeTaxYearFilter?: VaultTaxYearFilter;
  onTaxYearFilterChange?: (year: VaultTaxYearFilter) => void;
  /** Descending unique years from loaded tax_return documents. */
  availableTaxYears?: readonly string[];
  className?: string;
};

export function DocumentVaultFilterBar({
  activeFilter,
  onFilterChange,
  activeTaxYearFilter = "all",
  onTaxYearFilterChange,
  availableTaxYears = [],
  className,
}: DocumentVaultFilterBarProps) {
  const showTaxYearRow = activeFilter === "tax_return";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        className="flex min-w-0 flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter documents by category"
      >
        {VAULT_FILTER_CHIPS.map((chip) => {
          const selected = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              data-testid={`pipeline-documents-vault-filter-${chip.id}`}
              aria-pressed={selected}
              onClick={() => onFilterChange(chip.id)}
              className={cn(
                "inline-flex h-8 shrink-0 touch-manipulation items-center rounded-full border px-3 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {showTaxYearRow ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border/50 pt-2"
          role="group"
          aria-label="Filter tax returns by year"
          data-testid="pipeline-documents-vault-tax-year-filters"
        >
          <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Year
          </span>
          <button
            type="button"
            data-testid="pipeline-documents-vault-tax-year-all"
            aria-pressed={activeTaxYearFilter === "all"}
            onClick={() => onTaxYearFilterChange?.("all")}
            className={cn(
              "inline-flex h-7 shrink-0 touch-manipulation items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard",
              activeTaxYearFilter === "all"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/60 bg-background/80 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
            )}
          >
            All Years
          </button>
          {availableTaxYears.map((year) => {
            const selected = activeTaxYearFilter === year;
            return (
              <button
                key={year}
                type="button"
                data-testid={`pipeline-documents-vault-tax-year-${year}`}
                aria-pressed={selected}
                onClick={() => onTaxYearFilterChange?.(year)}
                className={cn(
                  "inline-flex h-7 shrink-0 touch-manipulation items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
