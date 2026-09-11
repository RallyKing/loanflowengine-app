"use client";

import { BookOpen, Eye, Layers, Link2, Plus, Search, Shield, ShieldOff, Sparkles } from "lucide-react";
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
  /** Same handler as Explorer + Tasks — opens file-task batch create. */
  onAddFileTasks?: () => void;
  onCreate?: () => void;
  onCompile?: () => void;
  onRecallFromClientVault?: () => void;
  onGenerateClientLink?: () => void;
  onManagePortalLinks?: () => void;
  onApplyTemplates?: () => void;
  onViewAsClient?: () => void;
  onDeliverToLender?: () => void;
  onDueDiligence?: () => void;
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

const actionButtonClass =
  "h-9 shrink-0 gap-1.5 whitespace-nowrap text-xs";

export function DocumentVaultCommandBar({
  canMutate,
  canUseHub,
  uploadBusy,
  searchQuery,
  onSearchChange,
  onAddFileTasks,
  onCreate,
  onCompile,
  onRecallFromClientVault,
  onGenerateClientLink,
  onManagePortalLinks,
  onApplyTemplates,
  onViewAsClient,
  onDeliverToLender,
  onDueDiligence,
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
        {/* Row 1 — primary vault actions (wraps cleanly on narrow widths) */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {canMutate && onAddFileTasks ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onAddFileTasks}
              data-testid="document-vault-add-file-tasks-command"
              title="Add file tasks"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Tasks
            </Button>
          ) : null}
          {canMutate && onCreate ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className={actionButtonClass}
              onClick={onCreate}
              data-testid="document-vault-create-trigger"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
              className={actionButtonClass}
              onClick={onCompile}
              data-testid="deal-bible-compile-open"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Compile Deal Package</span>
              <span className="sm:hidden">Compile</span>
            </Button>
          ) : null}
          {canMutate && onApplyTemplates ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className={actionButtonClass}
              onClick={onApplyTemplates}
              data-testid="document-vault-apply-template-command"
            >
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Apply Template</span>
              <span className="sm:hidden">Template</span>
            </Button>
          ) : null}
          {canMutate && onRecallFromClientVault ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onRecallFromClientVault}
              data-testid="document-vault-recall-client-vault"
            >
              <span className="hidden md:inline">Recall from Client Vault</span>
              <span className="md:hidden">Recall</span>
            </Button>
          ) : null}
          {canMutate && onGenerateClientLink ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onGenerateClientLink}
              data-testid="document-vault-generate-client-link"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Client Link
            </Button>
          ) : null}
          {canMutate && onManagePortalLinks ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onManagePortalLinks}
              data-testid="document-vault-manage-portal-links"
            >
              <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden lg:inline">Link Repository</span>
              <span className="lg:hidden">Links</span>
            </Button>
          ) : null}
          {canMutate && onDeliverToLender ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onDeliverToLender}
              data-testid="document-vault-deliver-to-lender"
            >
              <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden lg:inline">Deliver to Lender</span>
              <span className="lg:hidden">Lender</span>
            </Button>
          ) : null}
          {canMutate && onDueDiligence ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={onDueDiligence}
              data-testid="document-vault-due-diligence-command"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden lg:inline">Due Diligence</span>
              <span className="lg:hidden">DD</span>
            </Button>
          ) : null}
        </div>

        {/* Row 2 — session utilities + search (never competes with row 1) */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {canMutate && onViewAsClient ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={actionButtonClass}
              onClick={onViewAsClient}
              data-testid="document-vault-view-as-client"
              title="View as Client"
            >
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">View as Client</span>
            </Button>
          ) : null}
          <div className="relative min-w-[12rem] flex-1 basis-[min(100%,14rem)]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search vault…"
              className="h-9 w-full min-w-0 pl-8 text-sm"
              data-testid="document-vault-search"
              aria-label="Search documents in vault"
            />
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
