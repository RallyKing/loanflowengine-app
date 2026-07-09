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
  Crop,
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
  Pencil,
  Trash2,
  UserPlus,
  FileDown,
} from "lucide-react";
import { LIBRARY_DOCUMENT_CATEGORY_LABELS } from "@/lib/library/documentVaultTaxonomy";

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
  isSelected: boolean;
  isHighlighted: boolean;
  canMutate: boolean;
  isBulkChecked: boolean;
  showBulkCheckbox: boolean;
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
  onToggleExpanded: () => void;
  onMoveDoc: () => void;
  onOpenProperties: () => void;
  onSaveToContact: () => void;
  onAssignToRegistry: () => void;
  onDownloadAsPdf: () => void;
  exportingPdf?: boolean;
  onRemoveLink: () => void;
  onRejectDocument?: (reason: string) => void;
  onToggleClientVisibility?: () => void;
};

export function DocumentVaultExplorerFileRow({
  row,
  depth,
  isSelected,
  isHighlighted,
  canMutate,
  isBulkChecked,
  showBulkCheckbox,
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
  onToggleExpanded,
  onMoveDoc,
  onOpenProperties,
  onSaveToContact,
  onAssignToRegistry,
  onDownloadAsPdf,
  exportingPdf = false,
  onRemoveLink,
  onRejectDocument,
  onToggleClientVisibility,
}: DocumentVaultExplorerFileRowProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const isRejected = row.reviewStatus === "rejected";
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
    <li ref={setNodeRef} style={dragStyle} className="min-w-0">
      <div
        className={cn(
          "group/file flex min-h-10 min-w-0 items-center gap-1 rounded-dlc-sm border border-transparent pr-1 transition-colors duration-dlc-short ease-dlc-standard",
          "hover:border-border/50 hover:bg-dlc-surface-high/80",
          isSelected && "border-primary/30 bg-primary/8",
          isHighlighted && "border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25",
          isRejected && "bg-rose-50/60 dark:bg-rose-950/20",
        )}
        style={{ paddingLeft: `${depth * 14 + 28}px` }}
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
            type="button"
            className="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover/file:opacity-100 active:cursor-grabbing"
            aria-label={`Drag ${row.title}`}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <span className="inline-block h-7 w-5 shrink-0" aria-hidden />
        )}

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {showBulkCheckbox ? (
            <OperationalCheckbox
              checked={isBulkChecked}
              onChange={onToggleBulkSelect}
              aria-label={`Select ${row.title}`}
            />
          ) : (
            <span className="inline-block h-4 w-4" aria-hidden />
          )}
        </div>

        <FileText
          className="h-3.5 w-3.5 shrink-0 text-primary/70"
          aria-hidden
        />

        <div className="flex min-w-0 flex-1 items-center gap-3">
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
                disabled={exportingPdf || !row.latestVersionId}
                onClick={onDownloadAsPdf}
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="h-4 w-4" aria-hidden />
                )}
                Download as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveDoc}>
                <FolderInput className="h-4 w-4" aria-hidden />
                Move to folder
              </DropdownMenuItem>
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
