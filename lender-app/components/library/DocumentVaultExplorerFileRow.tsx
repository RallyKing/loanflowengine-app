"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { DocumentVaultRejectPopover } from "@/components/library/DocumentVaultRejectPopover";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { vaultDocumentDragId } from "@/lib/library/documentVaultDnD";
import type { LibraryDocumentListRow } from "@/components/library/LibraryDocumentsList";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flag,
  FolderInput,
  GripVertical,
  History,
  Info,
  Link2,
  Loader2,
  MoreVertical,
  AppWindow,
  Pencil,
  Trash2,
  UserPlus,
  FileDown,
} from "lucide-react";
import { LIBRARY_DOCUMENT_CATEGORY_LABELS } from "@/lib/library/documentVaultTaxonomy";
import { VaultRegistryAssignMicroAction } from "@/components/library/VaultRegistryAssignMicroAction";
import { DocumentVaultExplorerStarButton } from "@/components/library/DocumentVaultExplorerStarButton";
import {
  isCreatedVaultHtmlDocument,
  isVaultImageDocument,
} from "@/lib/library/vaultOutboundFileName";

function formatDate(ts: number | undefined) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSize(contentType: string | undefined) {
  if (!contentType) return "—";
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.includes("html")) return "HTML";
  return contentType.split("/").pop()?.toUpperCase() ?? "File";
}

export type DocumentVaultExplorerFileRowProps = {
  row: LibraryDocumentListRow;
  depth: number;
  density?: "default" | "compact";
  isSelected: boolean;
  isHighlighted: boolean;
  canMutate: boolean;
  isBulkChecked: boolean;
  showBulkCheckbox: boolean;
  isStarred?: boolean;
  onToggleStar?: () => void;
  dragEnabled: boolean;
  busyDoc: Id<"libraryDocuments"> | null;
  isEditing: boolean;
  editValue: string;
  proof: LibraryDocumentsProof;
  onSelect: () => void;
  onToggleBulkSelect: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onPreview: () => void;
  /** Float this document only (does not require floating the vault block). */
  onOpenInWindow?: () => void;
  onToggleExpanded: () => void;
  onMoveDoc: () => void;
  /** Move / copy this file to a sibling loan file in the same project. */
  onMoveCopyToFile?: () => void;
  crossFileTransferEnabled?: boolean;
  onOpenProperties: () => void;
  onSaveToContact: () => void;
  onAssignToRegistry: () => void;
  onDownload: () => void;
  onDownloadAsPdf: () => void;
  onDownloadOriginal?: () => void;
  downloading?: boolean;
  exportingPdf?: boolean;
  onRemoveLink: () => void;
  onRejectDocument?: (reason: string) => void;
  onToggleClientVisibility?: () => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
};

export function DocumentVaultExplorerFileRow({
  row,
  depth,
  density = "default",
  isSelected,
  isHighlighted,
  canMutate,
  isBulkChecked,
  showBulkCheckbox,
  isStarred = false,
  onToggleStar,
  dragEnabled,
  busyDoc,
  isEditing,
  editValue,
  onSelect,
  onToggleBulkSelect,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onPreview,
  onOpenInWindow,
  onToggleExpanded,
  onMoveDoc,
  onMoveCopyToFile,
  crossFileTransferEnabled = false,
  onOpenProperties,
  onSaveToContact,
  onAssignToRegistry,
  onDownload,
  onDownloadAsPdf,
  onDownloadOriginal,
  downloading = false,
  exportingPdf = false,
  onRemoveLink,
  onRejectDocument,
  onToggleClientVisibility,
  organizationId,
  memberUserKey,
}: DocumentVaultExplorerFileRowProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const isCompact = density === "compact";
  const isRejected = row.reviewStatus === "rejected";
  const isCreatedHtml = isCreatedVaultHtmlDocument(row);
  const isVaultImage = isVaultImageDocument(row);
  const downloadLabel = isCreatedHtml ? "Download PDF" : "Download";
  const downloadBusy = downloading || (isCreatedHtml && exportingPdf);
  const showDragHandle =
    dragEnabled && row.linkScope === "pipeline" && canMutate && !isRejected;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: vaultDocumentDragId(row._id),
      disabled: !showDragHandle,
      data: { documentId: row._id },
    });

  const dragStyle = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  if (isCompact) {
    return (
      <li style={dragStyle} className="min-w-0">
        <div
          className={cn(
            "group/file flex min-h-6 min-w-0 items-center gap-0.5 border-b border-border/40 py-0.5 pr-1",
            isSelected && "bg-primary/8",
            isHighlighted && "bg-amber-50/60 dark:bg-amber-950/20",
            isRejected && "bg-rose-50/50 dark:bg-rose-950/15",
          )}
          style={{ paddingLeft: `${depth * 10 + 8}px` }}
          data-testid={`document-vault-tree-document-${row._id}`}
          data-vault-document-id={row._id}
        >
          {showDragHandle ? (
            <button
              ref={setNodeRef}
              type="button"
              className="inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
              style={{ touchAction: "none" }}
              aria-label={`Drag ${row.title}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3 w-3" aria-hidden />
            </button>
          ) : (
            <span ref={setNodeRef} className="inline-block h-5 w-4 shrink-0" aria-hidden />
          )}

          {/* bare + negative margin: ~40px hit without inflating dense row height */}
          <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            {showBulkCheckbox ? (
              <label
                className="relative -m-2.5 inline-flex cursor-pointer items-center justify-center p-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <OperationalCheckbox
                  bare
                  checked={isBulkChecked}
                  onChange={onToggleBulkSelect}
                  aria-label={`Select ${row.title}`}
                />
              </label>
            ) : (
              <span className="inline-block h-3.5 w-3.5" aria-hidden />
            )}
          </div>

          {onToggleStar ? (
            <DocumentVaultExplorerStarButton
              starred={isStarred}
              label={row.title}
              onToggle={onToggleStar}
              compact
              testId={`document-vault-star-${row._id}`}
            />
          ) : null}

          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
            onClick={isEditing ? undefined : onSelect}
          >
            <FileText
              className="h-3 w-3 shrink-0 text-primary/70"
              aria-hidden
            />
            {isEditing ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 rounded-dlc-sm border border-border bg-background px-1.5 py-0 text-[11px] font-medium outline-none"
                autoFocus
              />
            ) : (
              <span
                className={cn(
                  "min-w-0 truncate text-[11px] font-medium text-foreground",
                  isSelected && "text-primary",
                )}
              >
                {row.title}
              </span>
            )}
          </button>

          <div
            className="ml-auto flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {canMutate && !isEditing ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={onStartEdit}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden />
                Edit
              </button>
            ) : null}
            {row.latestVersionNumber > 0 && row.latestVersionId ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-700 hover:text-sky-900 dark:text-sky-400"
                onClick={onPreview}
              >
                <Eye className="h-2.5 w-2.5" aria-hidden />
                View
              </button>
            ) : null}
            {row.latestVersionNumber > 0 &&
            row.latestVersionId &&
            onOpenInWindow ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={onOpenInWindow}
                title="Open in floating window"
                aria-label={`Open ${row.title} in window`}
                data-testid={`document-vault-window-${row._id}`}
              >
                <AppWindow className="h-2.5 w-2.5" aria-hidden />
                Window
              </button>
            ) : null}
            {row.latestVersionNumber > 0 && row.latestVersionId ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={onDownload}
                disabled={downloadBusy}
                title={downloadLabel}
                aria-label={`${downloadLabel} ${row.title}`}
                data-testid={`document-vault-download-${row._id}`}
              >
                {downloadBusy ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-2.5 w-2.5" aria-hidden />
                )}
                {isCreatedHtml ? "PDF" : "Download"}
              </button>
            ) : null}
            {isVaultImage &&
            row.latestVersionNumber > 0 &&
            row.latestVersionId ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={onDownloadAsPdf}
                disabled={exportingPdf}
                title="Download PDF"
                aria-label={`Download PDF ${row.title}`}
                data-testid={`document-vault-download-pdf-${row._id}`}
              >
                {exportingPdf ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="h-2.5 w-2.5" aria-hidden />
                )}
                PDF
              </button>
            ) : null}
            {canMutate &&
            row.linkScope === "pipeline" &&
            crossFileTransferEnabled &&
            onMoveCopyToFile ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={onMoveCopyToFile}
                title={`Move or copy ${row.title} to another file`}
                aria-label={`Move or copy ${row.title} to another file`}
                data-testid={`document-vault-file-move-copy-${row._id}`}
              >
                <Copy className="h-2.5 w-2.5" aria-hidden />
                Move
              </button>
            ) : null}
            {canMutate && row.linkScope === "pipeline" ? (
              <VaultRegistryAssignMicroAction
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                target={{ kind: "documentLink", linkId: row.linkId }}
                assignedContactId={row.assignedContactId}
                assignedClientId={row.assignedClientId}
                assignedLenderId={row.assignedLenderId}
                compact
              />
            ) : null}
            {canMutate && row.linkScope === "pipeline" ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400"
                onClick={onAssignToRegistry}
              >
                <Link2 className="h-2.5 w-2.5" aria-hidden />
                Assign
              </button>
            ) : null}
            {canMutate ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 hover:text-red-800 dark:text-red-400"
                onClick={onRemoveLink}
              >
                <Trash2 className="h-2.5 w-2.5" aria-hidden />
                Trash
              </button>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  const statusLabel = (() => {
    if (isRejected) return "Rejected";
    if (row.expiryStatus === "expired") return "Expired";
    if (row.expiryStatus === "expiring_soon") return "Expiring";
    if (row.documentCategory) {
      return LIBRARY_DOCUMENT_CATEGORY_LABELS[row.documentCategory];
    }
    return "Valid";
  })();

  return (
    <li style={dragStyle} className="min-w-0">
      <div
        className={cn(
          "group/file flex min-h-8 min-w-0 items-center gap-0.5 rounded-dlc-sm border border-transparent py-0.5 pr-1 transition-colors duration-dlc-short ease-dlc-standard",
          "hover:border-border/50 hover:bg-dlc-surface-high/80",
          isSelected && "border-primary/30 bg-primary/8",
          isHighlighted && "border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25",
          isRejected && "bg-rose-50/60 dark:bg-rose-950/20",
        )}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        data-testid={`document-vault-tree-document-${row._id}`}
        data-vault-document-id={row._id}
        onClick={isEditing ? undefined : onSelect}
        role={isEditing ? undefined : "button"}
        tabIndex={isEditing ? -1 : 0}
        onKeyDown={
          isEditing
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect();
                }
              }
        }
      >
        {showDragHandle ? (
          <button
            ref={setNodeRef}
            type="button"
            className="inline-flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover/file:opacity-100 active:cursor-grabbing"
            style={{ touchAction: "none" }}
            aria-label={`Drag ${row.title}`}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <span ref={setNodeRef} className="inline-block h-6 w-4 shrink-0" aria-hidden />
        )}

        {/* bare + negative margin: ~40px hit without inflating row height */}
        <div className="relative flex h-6 w-5 shrink-0 items-center justify-center">
          {showBulkCheckbox ? (
            <label
              className="relative -m-2.5 inline-flex cursor-pointer items-center justify-center p-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <OperationalCheckbox
                bare
                checked={isBulkChecked}
                onChange={onToggleBulkSelect}
                aria-label={`Select ${row.title}`}
              />
            </label>
          ) : (
            <span className="inline-block h-3.5 w-3.5" aria-hidden />
          )}
        </div>

        {onToggleStar ? (
          <DocumentVaultExplorerStarButton
            starred={isStarred}
            label={row.title}
            onToggle={onToggleStar}
            testId={`document-vault-star-${row._id}`}
          />
        ) : null}

        <FileText
          className="h-3.5 w-3.5 shrink-0 text-primary/70"
          aria-hidden
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.stopPropagation();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  onCommitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded-dlc-sm border border-border bg-background px-2 py-0.5 text-xs font-medium outline-none ring-primary/30 focus:ring-2"
              aria-label="Rename document"
              autoFocus
            />
          ) : (
            <span
              className={cn(
                "min-w-0 truncate text-xs font-medium text-foreground",
                isSelected && "text-primary",
              )}
            >
              {row.title}
            </span>
          )}

          <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:inline">
            {formatDate(row.latestUploadedAt)}
          </span>
          <span className="hidden shrink-0 text-[10px] text-muted-foreground md:inline">
            {formatSize(row.latestContentType)}
          </span>
          <span
            className={cn(
              "hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium lg:inline-flex",
              isRejected
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                : row.expiryStatus === "expired"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : row.expiryStatus === "expiring_soon"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-border/60 bg-muted/30 text-muted-foreground",
            )}
          >
            {row.expiryStatus === "expired" ? (
              <AlertTriangle className="mr-0.5 inline h-3 w-3" aria-hidden />
            ) : row.expiryStatus === "expiring_soon" ? (
              <Clock className="mr-0.5 inline h-3 w-3" aria-hidden />
            ) : (
              <CheckCircle2 className="mr-0.5 inline h-3 w-3" aria-hidden />
            )}
            {statusLabel}
          </span>
        </div>

        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover/file:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {canMutate && row.linkScope === "pipeline" && onToggleClientVisibility ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0 opacity-70 transition-opacity hover:opacity-100",
                row.isSharedWithClient
                  ? "text-emerald-600 hover:bg-emerald-500/10"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
              aria-label={
                row.isSharedWithClient
                  ? "Shared with client — click to make internal"
                  : "Internal only — click to share with client"
              }
              title={
                row.isSharedWithClient ? "Shared with client" : "Internal only"
              }
              data-testid={`document-vault-visibility-toggle-${row._id}`}
              disabled={busyDoc === row._id}
              onClick={onToggleClientVisibility}
            >
              {row.isSharedWithClient ? (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
          ) : null}
          {row.latestVersionNumber > 0 && row.latestVersionId ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label="Preview"
                title="Preview"
                onClick={onPreview}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {onOpenInWindow ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={`Open ${row.title} in window`}
                  title="Open in floating window"
                  data-testid={`document-vault-window-${row._id}`}
                  onClick={onOpenInWindow}
                >
                  <AppWindow className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label="Edit"
                title="Edit"
                onClick={onPreview}
              >
                <Crop className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label={`${downloadLabel} ${row.title}`}
                title={downloadLabel}
                data-testid={`document-vault-download-${row._id}`}
                disabled={downloadBusy}
                onClick={onDownload}
              >
                {downloadBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
              {isVaultImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={`Download PDF ${row.title}`}
                  title="Download PDF"
                  data-testid={`document-vault-download-pdf-${row._id}`}
                  disabled={exportingPdf}
                  onClick={onDownloadAsPdf}
                >
                  {exportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Versions"
            title="Versions"
            onClick={onToggleExpanded}
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          {canMutate && row.linkScope === "pipeline" && !isRejected && onRejectDocument ? (
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                aria-label={`Flag ${row.title}`}
                title="Request signature / reject"
                onClick={() => setRejectOpen((v) => !v)}
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
              {rejectOpen ? (
                <DocumentVaultRejectPopover
                  documentTitle={row.title}
                  busy={busyDoc === row._id}
                  onClose={() => setRejectOpen(false)}
                  onSubmit={(reason) => {
                    onRejectDocument(reason);
                    setRejectOpen(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {canMutate && !isEditing ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/60"
              aria-label={`Rename ${row.title}`}
              onClick={onStartEdit}
            >
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
          {canMutate && row.linkScope === "pipeline" ? (
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted"
                  aria-label={`Actions for ${row.title}`}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              }
              align="end"
            >
              <DropdownMenuItem
                disabled={downloadBusy || !row.latestVersionId}
                onClick={onDownload}
              >
                {downloadBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : isCreatedHtml ? (
                  <FileDown className="h-4 w-4" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {downloadLabel}
              </DropdownMenuItem>
              {isCreatedHtml && onDownloadOriginal ? (
                <DropdownMenuItem
                  disabled={downloading || !row.latestVersionId}
                  onClick={onDownloadOriginal}
                  data-testid={`document-vault-download-original-${row._id}`}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Download original (HTML)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={exportingPdf || !row.latestVersionId}
                  onClick={onDownloadAsPdf}
                  data-testid={`document-vault-download-pdf-menu-${row._id}`}
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="h-4 w-4" aria-hidden />
                  )}
                  {isVaultImage ? "Download PDF" : "Download as PDF"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onMoveDoc}>
                <FolderInput className="h-4 w-4" aria-hidden />
                Move to folder
              </DropdownMenuItem>
              {crossFileTransferEnabled && onMoveCopyToFile ? (
                <DropdownMenuItem onClick={onMoveCopyToFile}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Move / copy to file…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onOpenProperties}>
                <Info className="h-4 w-4" aria-hidden />
                Properties
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAssignToRegistry}>
                <Link2 className="h-4 w-4" aria-hidden />
                Assign to Contact/Entity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSaveToContact}>
                <UserPlus className="h-4 w-4" aria-hidden />
                Save to Contact Profile
              </DropdownMenuItem>
            </DropdownMenu>
          ) : null}
          {canMutate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              aria-label="Remove link"
              onClick={onRemoveLink}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
