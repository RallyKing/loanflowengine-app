"use client";

import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { DocumentVaultLinkMetadataEditor } from "@/components/pipeline/tabs/DocumentVaultLinkMetadataEditor";
import { DocumentVaultExpiryBadge } from "@/components/library/DocumentVaultExpiryBadge";
import { DocumentVaultAiSuggestionBadge } from "@/components/library/DocumentVaultAiSuggestionBadge";
import { DocumentSignatureBlock } from "@/components/DocumentSignatureBlock";
import type {
  LibraryDocumentsContext,
  LibraryDocumentsProof,
} from "@/components/LibraryDocumentsPanel";
import type { LibraryDocumentLinkScope } from "@/lib/library/documentVaultHydration";
import type { LibraryDocumentCategory } from "@/lib/library/documentVaultTaxonomy";
import { premiumCardClassName } from "@/lib/pipeline/premiumWorkspaceUi";
import {
  LibraryDocumentsVaultGrid,
  LibraryDocumentsVaultGridSkeleton,
} from "@/components/library/LibraryDocumentsVaultGrid";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FolderInput,
  Globe,
  History,
  Info,
  LayoutList,
  Link2,
  List,
  Loader2,
  MoreVertical,
  Trash2,
  User,
  UserPlus,
  FileDown,
} from "lucide-react";

export type LibraryDocumentListRow = {
  _id: Id<"libraryDocuments">;
  linkId: Id<"libraryDocumentLinks">;
  title: string;
  latestVersionNumber: number;
  latestVersionId: Id<"libraryDocumentVersions"> | undefined;
  latestFileName: string | undefined;
  latestContentType: string | undefined;
  latestUploadedAt: number | undefined;
  updatedAt: number;
  documentCategory?: LibraryDocumentCategory;
  taxYear?: string;
  folderId?: Id<"documentFolders">;
  expiresAt?: number;
  expiryStatus?: "none" | "active" | "expiring_soon" | "expired";
  linkScope: LibraryDocumentLinkScope;
  hydratedContactId?: Id<"contacts">;
  savedToContactProfile?: boolean;
  aiSuggestedCategory?: LibraryDocumentCategory;
  aiConfidence?: number;
  aiSuggestedTaxYear?: string;
  aiSuggestedFolderName?: string;
  reviewStatus?: "rejected";
  rejectionReason?: string;
  isSharedWithClient?: boolean;
};

export type LibraryDocumentsListDensity = "list" | "compact";

const DENSITY_STORAGE_KEY = "document-vault-list-density";

function formatWhen(ts: number | undefined) {
  if (ts == null) return "";
  return new Date(ts).toLocaleString();
}

function readStoredDensity(): LibraryDocumentsListDensity {
  if (typeof window === "undefined") return "list";
  const raw = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return raw === "compact" ? "compact" : "list";
}

export type LibraryDocumentsListProps = {
  rows: LibraryDocumentListRow[];
  layout: "vault" | "embedded";
  context: LibraryDocumentsContext;
  memberUserKey?: string;
  canMutate: boolean;
  canUseHub: boolean;
  uploadBusy: boolean;
  useVaultNav: boolean;
  vaultPipelineFileId: Id<"pipeline"> | null;
  selectedDocumentId: Id<"libraryDocuments"> | null;
  highlightDocumentId: Id<"libraryDocuments"> | null;
  bulkSelectedIds: Set<string>;
  bulkSelectableRows: LibraryDocumentListRow[];
  expanded: Id<"libraryDocuments"> | null;
  versions:
    | Array<{
        _id: Id<"libraryDocumentVersions">;
        version: number;
        fileName: string;
        contentType?: string;
      }>
    | undefined;
  busyDoc: Id<"libraryDocuments"> | null;
  proofForRow: (row: LibraryDocumentListRow) => LibraryDocumentsProof;
  actionTitle: (hint: string) => string;
  onSelectDocument: (id: Id<"libraryDocuments">) => void;
  onToggleBulkSelect: (id: Id<"libraryDocuments">) => void;
  onBulkSelectAll: () => void;
  onBulkClearSelection: () => void;
  onToggleExpanded: (id: Id<"libraryDocuments">) => void;
  onPreview: (
    documentId: Id<"libraryDocuments">,
    versionId: Id<"libraryDocumentVersions">,
    fileName: string,
    contentType?: string,
  ) => void;
  onMoveDoc: (row: LibraryDocumentListRow) => void;
  onOpenProperties: (id: Id<"libraryDocuments">) => void;
  onSaveToContact: (row: LibraryDocumentListRow) => void;
  onAssignToRegistry: (row: LibraryDocumentListRow) => void;
  onDownloadAsPdf: (row: LibraryDocumentListRow) => void;
  exportingPdfDocId: Id<"libraryDocuments"> | null;
  onNewVersion: (
    documentId: Id<"libraryDocuments">,
    file: File,
    proof: LibraryDocumentsProof,
  ) => void;
  onRemoveLink: (
    documentId: Id<"libraryDocuments">,
    proof: LibraryDocumentsProof,
    isGlobalContactDoc: boolean,
    title: string,
  ) => void;
  onRename: (
    documentId: Id<"libraryDocuments">,
    title: string,
    proof: LibraryDocumentsProof,
  ) => void;
  onOptimisticMetaChange: (
    documentId: Id<"libraryDocuments">,
    patch: {
      documentCategory?: LibraryDocumentCategory | null;
      taxYear?: string | null;
    },
  ) => void;
  onAcceptAiSuggestion: (
    documentId: Id<"libraryDocuments">,
    proof: LibraryDocumentsProof,
  ) => void;
  onRejectDocument?: (
    documentId: Id<"libraryDocuments">,
    reason: string,
  ) => void;
  onError: (message: string) => void;
  showBulkToolbar?: boolean;
  bulkToolbar?: React.ReactNode;
  /** Vault grid — enable row drag handles (parent supplies DndContext). */
  dragEnabled?: boolean;
  loading?: boolean;
  className?: string;
};

export function LibraryDocumentsList({
  rows,
  layout,
  memberUserKey,
  canMutate,
  canUseHub,
  uploadBusy,
  useVaultNav,
  vaultPipelineFileId,
  selectedDocumentId,
  highlightDocumentId,
  bulkSelectedIds,
  bulkSelectableRows,
  expanded,
  versions,
  busyDoc,
  proofForRow,
  actionTitle,
  onSelectDocument,
  onToggleBulkSelect,
  onBulkSelectAll,
  onBulkClearSelection,
  onToggleExpanded,
  onPreview,
  onMoveDoc,
  onOpenProperties,
  onSaveToContact,
  onAssignToRegistry,
  onDownloadAsPdf,
  exportingPdfDocId,
  onNewVersion,
  onRemoveLink,
  onRename,
  onOptimisticMetaChange,
  onAcceptAiSuggestion,
  onRejectDocument,
  onError,
  showBulkToolbar,
  bulkToolbar,
  dragEnabled = false,
  loading = false,
  className,
}: LibraryDocumentsListProps) {
  const [density, setDensity] = useState<LibraryDocumentsListDensity>("list");

  useEffect(() => {
    setDensity(readStoredDensity());
  }, []);

  const setDensityPersisted = (next: LibraryDocumentsListDensity) => {
    setDensity(next);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const isCompact = density === "compact";
  const useVaultGrid = layout === "vault" && !!vaultPipelineFileId;

  if (useVaultGrid && loading) {
    return <LibraryDocumentsVaultGridSkeleton />;
  }

  if (useVaultGrid) {
    return (
      <>
        {showBulkToolbar ? bulkToolbar : null}
        <LibraryDocumentsVaultGrid
          rows={rows}
          canMutate={canMutate}
          memberUserKey={memberUserKey}
          selectedDocumentId={selectedDocumentId}
          highlightDocumentId={highlightDocumentId}
          bulkSelectedIds={bulkSelectedIds}
          bulkSelectableRows={bulkSelectableRows}
          busyDoc={busyDoc}
          dragEnabled={dragEnabled}
          proofForRow={proofForRow}
          onSelectDocument={onSelectDocument}
          onToggleBulkSelect={onToggleBulkSelect}
          onBulkSelectAll={onBulkSelectAll}
          onBulkClearSelection={onBulkClearSelection}
          onPreview={onPreview}
          onMoveDoc={onMoveDoc}
          onOpenProperties={onOpenProperties}
          onSaveToContact={onSaveToContact}
          onAssignToRegistry={onAssignToRegistry}
          onDownloadAsPdf={onDownloadAsPdf}
          exportingPdfDocId={exportingPdfDocId}
          onToggleExpanded={onToggleExpanded}
          onRemoveLink={onRemoveLink}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
          onRejectDocument={(documentId, reason) => {
            if (onRejectDocument) onRejectDocument(documentId, reason);
          }}
          className={className}
        />
      </>
    );
  }

  return (
    <>
      {showBulkToolbar ? bulkToolbar : null}
      <ul
        className={cn(
          "min-w-0",
          isCompact ? "divide-y divide-border/60 rounded-dlc-md border border-border/70" : "space-y-3",
          layout === "vault" && vaultPipelineFileId && !isCompact && "grid gap-3 space-y-0 sm:grid-cols-1",
          className,
        )}
        data-testid="pipeline-documents-vault-list"
        data-list-view={isCompact ? "row-view" : "list-view"}
      >
        {rows.map((d) => {
          const rowProof = proofForRow(d);
          const isGlobalContactDoc =
            layout === "vault" && d.linkScope === "contact";
          const isHighlighted = highlightDocumentId === d._id;
          const isSelected = useVaultNav && selectedDocumentId === d._id;
          const isBulkChecked = bulkSelectedIds.has(String(d._id));
          const showBulkCheckbox =
            layout === "vault" &&
            vaultPipelineFileId &&
            d.linkScope === "pipeline" &&
            d.latestVersionNumber > 0;

          const rowShellClass = cn(
            isCompact
              ? "flex h-10 items-center gap-2 px-2 text-sm transition-colors hover:bg-muted/30"
              : "rounded-dlc-md border border-border/70 bg-dlc-surface-high/50 px-3 py-3 text-sm shadow-dlc-1 transition-all duration-1000",
            !isCompact &&
              layout === "vault" &&
              vaultPipelineFileId &&
              cn(
                premiumCardClassName,
                "border-slate-200/60 px-4 py-4 dark:border-slate-700/80",
                useVaultNav && "cursor-pointer hover:border-primary/30",
              ),
            !isCompact && isGlobalContactDoc && "border-primary/20 bg-dlc-surface-high/70",
            isSelected && !isCompact && "border-primary/50 ring-2 ring-primary/30",
            isSelected && isCompact && "bg-primary/5",
            isHighlighted &&
              !isCompact &&
              "animate-pulse border-amber-400/70 bg-amber-50 ring-2 ring-amber-400/60 dark:border-amber-700/60 dark:bg-amber-950/40 dark:ring-amber-600/50",
            isHighlighted && isCompact && "bg-amber-50 dark:bg-amber-950/30",
            useVaultNav && isCompact && "cursor-pointer",
          );

          const statusIcons = (
            <>
              {isGlobalContactDoc ? (
                <span title="Global document">
                  <User
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-label="Global document"
                  />
                </span>
              ) : d.savedToContactProfile && d.linkScope === "pipeline" ? (
                <span title="Saved to profile">
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label="Saved to contact profile"
                  />
                </span>
              ) : null}
              {layout === "vault" && d.expiryStatus === "expired" ? (
                <span title="Expired">
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0 text-destructive"
                    aria-label="Expired"
                  />
                </span>
              ) : layout === "vault" && d.expiryStatus === "expiring_soon" ? (
                <span title="Expiring soon">
                  <Clock
                    className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-label="Expiring soon"
                  />
                </span>
              ) : null}
            </>
          );

          const actionCluster = (
            <div
              className="ml-auto flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {d.latestVersionNumber > 0 && d.latestVersionId && memberUserKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Preview latest"
                  title="Preview"
                  onClick={() =>
                    useVaultNav
                      ? onSelectDocument(d._id)
                      : onPreview(
                          d._id,
                          d.latestVersionId!,
                          d.latestFileName ?? d.title,
                          d.latestContentType,
                        )
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {!isCompact ? (
                <Button
                  type="button"
                  variant={expanded === d._id ? "outline" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onToggleExpanded(d._id)}
                >
                  Versions
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={expanded === d._id ? "outline" : "ghost"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Versions"
                  title="Versions"
                  onClick={() => onToggleExpanded(d._id)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
              )}
              {layout === "vault" &&
              vaultPipelineFileId &&
              d.linkScope === "pipeline" &&
              canMutate ? (
                <DropdownMenu
                  trigger={
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted"
                      aria-label={`Document actions for ${d.title}`}
                    >
                      <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  }
                  align="end"
                  aria-label={`Document actions for ${d.title}`}
                >
                  <DropdownMenuItem
                    disabled={exportingPdfDocId === d._id || !d.latestVersionId}
                    onClick={() => onDownloadAsPdf(d)}
                  >
                    {exportingPdfDocId === d._id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Download as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMoveDoc(d)}>
                    <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
                    Move to folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenProperties(d._id)}>
                    <Info className="h-4 w-4 shrink-0" aria-hidden />
                    Properties
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAssignToRegistry(d)}>
                    <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                    Assign to Contact/Entity
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSaveToContact(d)}>
                    <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                    Save to Contact Profile
                  </DropdownMenuItem>
                  {canMutate ? (
                    <DropdownMenuItem
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.onchange = () => {
                          const f = input.files?.[0];
                          if (f) onNewVersion(d._id, f, rowProof);
                        };
                        input.click();
                      }}
                    >
                      New version
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenu>
              ) : null}
              {!isCompact && canMutate ? (
                <label
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-muted",
                    busyDoc === d._id && "pointer-events-none opacity-60",
                  )}
                >
                  New version
                  <input
                    type="file"
                    className="sr-only"
                    disabled={!canUseHub || uploadBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onNewVersion(d._id, f, rowProof);
                    }}
                  />
                </label>
              ) : null}
              {canMutate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                  title={actionTitle(
                    isGlobalContactDoc ? "Remove contact link" : "Remove file link",
                  )}
                  aria-label="Remove link"
                  onClick={() =>
                    onRemoveLink(
                      d._id,
                      rowProof,
                      isGlobalContactDoc,
                      d.title,
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              ) : null}
            </div>
          );

          const showAiSuggestion =
            !d.documentCategory && d.aiSuggestedCategory && canMutate;

          const aiSuggestionBadge = showAiSuggestion ? (
            <DocumentVaultAiSuggestionBadge
              suggestedCategory={d.aiSuggestedCategory!}
              confidence={d.aiConfidence}
              compact={isCompact}
              busy={busyDoc === d._id}
              onAccept={() => onAcceptAiSuggestion(d._id, rowProof)}
            />
          ) : null;

          if (isCompact) {
            return (
              <li
                key={d._id}
                role={useVaultNav ? "button" : undefined}
                tabIndex={useVaultNav ? 0 : undefined}
                onClick={useVaultNav ? () => onSelectDocument(d._id) : undefined}
                onKeyDown={
                  useVaultNav
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectDocument(d._id);
                        }
                      }
                    : undefined
                }
                className={rowShellClass}
                data-vault-document-id={d._id}
                data-testid={`pipeline-documents-vault-row-${d._id}`}
              >
                {showBulkCheckbox ? (
                  <OperationalCheckbox
                    checked={isBulkChecked}
                    onChange={() => onToggleBulkSelect(d._id)}
                    aria-label={`Select ${d.title}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {statusIcons}
                  <span className="min-w-0 truncate font-medium">{d.title}</span>
                  {aiSuggestionBadge}
                  {d.latestVersionNumber > 0 ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      v{d.latestVersionNumber}
                    </span>
                  ) : null}
                </div>
                {actionCluster}
              </li>
            );
          }

          return (
            <li
              key={d._id}
              role={useVaultNav ? "button" : undefined}
              tabIndex={useVaultNav ? 0 : undefined}
              onClick={useVaultNav ? () => onSelectDocument(d._id) : undefined}
              onKeyDown={
                useVaultNav
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectDocument(d._id);
                      }
                    }
                  : undefined
              }
              className={rowShellClass}
              data-vault-document-id={d._id}
              data-testid={
                isHighlighted
                  ? `pipeline-documents-vault-row-highlighted-${d._id}`
                  : isGlobalContactDoc
                    ? `pipeline-documents-vault-global-row-${d._id}`
                    : `pipeline-documents-vault-row-${d._id}`
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {showBulkCheckbox ? (
                      <span
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <OperationalCheckbox
                          checked={isBulkChecked}
                          onChange={() => onToggleBulkSelect(d._id)}
                          aria-label={`Select ${d.title}`}
                          data-testid={`document-vault-bulk-check-${d._id}`}
                        />
                      </span>
                    ) : null}
                    <div className="font-medium leading-snug">{d.title}</div>
                    {isGlobalContactDoc ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        data-testid="pipeline-documents-vault-global-badge"
                      >
                        <User className="h-3 w-3 shrink-0" aria-hidden />
                        Global document
                      </span>
                    ) : d.savedToContactProfile && d.linkScope === "pipeline" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                        data-testid="pipeline-documents-vault-saved-to-profile-badge"
                      >
                        <Globe className="h-3 w-3 shrink-0" aria-hidden />
                        Saved to profile
                      </span>
                    ) : null}
                    {aiSuggestionBadge}
                    {layout === "vault" &&
                    d.expiryStatus &&
                    (d.expiryStatus === "expired" ||
                      d.expiryStatus === "expiring_soon") ? (
                      <DocumentVaultExpiryBadge
                        status={d.expiryStatus}
                        expiresAt={d.expiresAt}
                      />
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {d.latestVersionNumber > 0 ? (
                      <>
                        v{d.latestVersionNumber}
                        {d.latestFileName ? ` · ${d.latestFileName}` : ""}
                        {d.latestUploadedAt
                          ? ` · ${formatWhen(d.latestUploadedAt)}`
                          : ""}
                      </>
                    ) : (
                      "No file yet — upload a version."
                    )}
                  </div>
                  {layout === "vault" ? (
                    <DocumentVaultLinkMetadataEditor
                      documentId={d._id}
                      proof={rowProof}
                      memberUserKey={memberUserKey}
                      canMutate={canMutate}
                      documentCategory={d.documentCategory}
                      taxYear={d.taxYear}
                      onOptimisticChange={(patch) =>
                        onOptimisticMetaChange(d._id, patch)
                      }
                      onError={onError}
                    />
                  ) : null}
                  {expanded === d._id && versions !== undefined ? (
                    <div className="mt-2 rounded-dlc-md border border-border/70 bg-muted/20 p-2 text-xs">
                      <div className="mb-1 flex items-center gap-1 font-medium text-muted-foreground">
                        <History className="h-3 w-3" aria-hidden />
                        Versions
                      </div>
                      <ul className="space-y-1">
                        {versions.map((v) => (
                          <li
                            key={v._id}
                            className="flex flex-wrap items-center justify-between gap-1 border-b border-border/40 py-1 last:border-0"
                          >
                            <span className="min-w-0">
                              v{v.version} —{" "}
                              <span className="break-all">{v.fileName}</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-xs"
                              disabled={!memberUserKey}
                              onClick={() =>
                                onPreview(
                                  d._id,
                                  v._id,
                                  v.fileName,
                                  v.contentType,
                                )
                              }
                            >
                              Preview
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div
                  className="flex shrink-0 flex-wrap justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {layout === "vault" &&
                  vaultPipelineFileId &&
                  d.linkScope === "pipeline" &&
                  canMutate ? (
                    <DropdownMenu
                      trigger={
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm border border-input bg-background text-muted-foreground hover:bg-muted"
                          aria-label={`Document actions for ${d.title}`}
                        >
                          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      }
                      align="end"
                      aria-label={`Document actions for ${d.title}`}
                    >
                      <DropdownMenuItem
                        disabled={
                          exportingPdfDocId === d._id || !d.latestVersionId
                        }
                        onClick={() => onDownloadAsPdf(d)}
                      >
                        {exportingPdfDocId === d._id ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        Download as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveDoc(d)}>
                        <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
                        Move to folder
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOpenProperties(d._id)}>
                        <Info className="h-4 w-4 shrink-0" aria-hidden />
                        Properties
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onAssignToRegistry(d)}>
                        <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                        Assign to Contact/Entity
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSaveToContact(d)}>
                        <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                        Save to Contact Profile
                      </DropdownMenuItem>
                    </DropdownMenu>
                  ) : null}
                  {d.latestVersionNumber > 0 &&
                  d.latestVersionId &&
                  memberUserKey ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        useVaultNav
                          ? onSelectDocument(d._id)
                          : onPreview(
                              d._id,
                              d.latestVersionId!,
                              d.latestFileName ?? d.title,
                              d.latestContentType,
                            )
                      }
                    >
                      Preview latest
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={expanded === d._id ? "outline" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onToggleExpanded(d._id)}
                  >
                    Versions
                  </Button>
                  {canMutate ? (
                    <label
                      className={cn(
                        "inline-flex h-7 cursor-pointer items-center rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-muted",
                        busyDoc === d._id && "pointer-events-none opacity-60",
                      )}
                    >
                      New version
                      <input
                        type="file"
                        className="sr-only"
                        disabled={!canUseHub || uploadBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) onNewVersion(d._id, f, rowProof);
                        }}
                      />
                    </label>
                  ) : null}
                  {canMutate ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      title={actionTitle(
                        isGlobalContactDoc
                          ? "Remove contact link"
                          : "Remove file link",
                      )}
                      onClick={() =>
                        onRemoveLink(
                          d._id,
                          rowProof,
                          isGlobalContactDoc,
                          d.title,
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
              {canMutate ? (
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                  <Input
                    className="h-8 max-w-xs text-xs"
                    placeholder="Rename…"
                    defaultValue={d.title}
                    key={`${d._id}-${d.updatedAt}`}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (!next || next === d.title) return;
                      onRename(d._id, next, rowProof);
                    }}
                  />
                </div>
              ) : null}
              <DocumentSignatureBlock
                documentId={d._id}
                documentTitle={d.title}
                proof={rowProof}
                memberUserKey={memberUserKey}
                canMutate={Boolean(canMutate)}
                hasFile={d.latestVersionNumber > 0}
                defaultVersionId={d.latestVersionId}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}