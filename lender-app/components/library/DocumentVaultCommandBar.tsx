"use client";

import { BookOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { VaultUploadTriggerButton } from "@/components/library/UploadAndOrganizeZone";
import { DocumentVaultGridFilterBar } from "@/components/library/DocumentVaultGridFilterBar";
import type {
  VaultCategoryFilter,
  VaultTaxYearFilter,
} from "@/lib/library/documentVaultTaxonomy";
import type {
  VaultGridStatusFilter,
  VaultGridTypeFilter,
} from "@/lib/library/vaultGridFilters";

export type DocumentVaultCommandBarProps = {
  canMutate: boolean;
  canUseHub: boolean;
  uploadBusy: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCreate?: () => void;
  onCompile?: () => void;
  onRecallFromClientVault?: () => void;
  onFilesSelected?: (files: FileList | File[]) => void;
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

export function DocumentVaultCommandBar({
  canMutate,
  canUseHub,
  uploadBusy,
  searchQuery,
  onSearchChange,
  onCreate,
  onCompile,
  onRecallFromClientVault,
  onFilesSelected,
  typeFilters,
  onTypeFiltersChange,
  statusFilters,
  onStatusFiltersChange,
  categoryFilter,
  onCategoryFilterChange,
  taxYearFilter,
  onTaxYearFilterChange,
  availableTaxYears,
  className,
}: DocumentVaultCommandBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-1 border-b border-slate-200/90 bg-white/95 px-1 pb-3 pt-1 backdrop-blur-sm dark:border-slate-700/80 dark:bg-dlc-surface-high/95",
        className,
      )}
      data-testid="document-vault-command-bar"
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {canMutate && onCreate ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="h-9 shrink-0 gap-1.5 text-xs"
                onClick={onCreate}
                data-testid="document-vault-create-trigger"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Create
              </Button>
            ) : null}
            {canMutate && onFilesSelected ? (
              <VaultUploadTriggerButton
                disabled={!canUseHub}
                busy={uploadBusy}
                onFilesSelected={onFilesSelected}
              />
            ) : null}
            {canMutate && onCompile ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 text-xs"
                onClick={onCompile}
                data-testid="deal-bible-compile-open"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Compile Deal Package
              </Button>
            ) : null}
            {canMutate && onRecallFromClientVault ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 text-xs"
                onClick={onRecallFromClientVault}
                data-testid="document-vault-recall-client-vault"
              >
                Recall from Client Vault
              </Button>
            ) : null}
          </div>

          <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:max-w-[28rem]">
            <div className="relative min-w-[10rem] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search vault…"
                className="h-9 pl-8 text-sm"
                data-testid="document-vault-search"
                aria-label="Search documents in vault"
              />
            </div>
          </div>
        </div>

        <DocumentVaultGridFilterBar
          typeFilters={typeFilters}
          onTypeFiltersChange={onTypeFiltersChange}
          statusFilters={statusFilters}
          onStatusFiltersChange={onStatusFiltersChange}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          taxYearFilter={taxYearFilter}
          onTaxYearFilterChange={onTaxYearFilterChange}
          availableTaxYears={availableTaxYears}
          className="border-0 pb-0"
        />
      </div>
    </div>
  );
}
