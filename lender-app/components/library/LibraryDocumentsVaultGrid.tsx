"use client";

import { useMemo, useState } from "react";
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
import { DocumentVaultExpiryBadge } from "@/components/library/DocumentVaultExpiryBadge";
import { DocumentVaultAiSuggestionBadge } from "@/components/library/DocumentVaultAiSuggestionBadge";
import { DocumentVaultRejectPopover } from "@/components/library/DocumentVaultRejectPopover";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";
import { vaultDocumentDragId } from "@/lib/library/documentVaultDnD";
import {
  isCreatedVaultHtmlDocument,
  isVaultImageDocument,
  vaultDocumentOutboundFileName,
} from "@/lib/library/vaultOutboundFileName";
import type { LibraryDocumentListRow } from "@/components/library/LibraryDocumentsList";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Crop,
  Eye,
  FileText,
  Flag,
  FolderInput,
  GripVertical,
  History,
  Info,
  Link2,
  Loader2,
  MoreVertical,
  Trash2,
  User,
  UserPlus,
  FileDown,
  Download,
} from "lucide-react";

export type VaultGridSortColumn =
  | "title"
  | "category"
  | "uploaded"
  | "expiry";

type SortState = {
  column: VaultGridSortColumn;
  direction: "asc" | "desc";
};

function formatDate(ts: number | undefined) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function categorySortKey(row: LibraryDocumentListRow): string {
  if (row.documentCategory) {
    return LIBRARY_DOCUMENT_CATEGORY_LABELS[row.documentCategory];
  }
  if (row.customDocumentCategoryName) {
    return row.customDocumentCategoryName;
  }
  if (row.aiSuggestedCategory) {
    return `~${LIBRARY_DOCUMENT_CATEGORY_LABELS[row.aiSuggestedCategory]}`;
  }
  return "zzz";
}

function expirySortKey(row: LibraryDocumentListRow): number {
  const rank: Record<string, number> = {
    expired: 0,
    expiring_soon: 1,
    active: 2,
    none: 3,
  };
  return rank[row.expiryStatus ?? "none"] ?? 3;
}

function sortRows(
  rows: LibraryDocumentListRow[],
  sort: SortState,
): LibraryDocumentListRow[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sort.column) {
      case "title":
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        break;
      case "category":
        cmp = categorySortKey(a).localeCompare(categorySortKey(b), undefined, {
          sensitivity: "base",
        });
        break;
      case "uploaded":
        cmp = (a.latestUploadedAt ?? 0) - (b.latestUploadedAt ?? 0);
        break;
      case "expiry":
        cmp = expirySortKey(a) - expirySortKey(b);
        break;
    }
    return cmp * dir;
  });
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: VaultGridSortColumn;
  sort: SortState;
  onSort: (column: VaultGridSortColumn) => void;
  className?: string;
}) {
  const active = sort.column === column;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-10 border-b border-border/70 bg-dlc-surface-high/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm",
        className,
      )}
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  );
}

function CategoryCell({ row }: { row: LibraryDocumentListRow }) {
  if (row.documentCategory || row.customDocumentCategoryName) {
    return (
      <span className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-foreground">
        <span className="truncate">
          {row.documentCategory
            ? LIBRARY_DOCUMENT_CATEGORY_LABELS[row.documentCategory]
            : row.customDocumentCategoryName}
          {row.documentCategory === "tax_return" && row.taxYear
            ? ` · ${row.taxYear}`
            : ""}
        </span>
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground">Unassigned</span>
  );
}

function LinkedToCell({ row }: { row: LibraryDocumentListRow }) {
  if (row.linkScope === "contact") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <User className="h-3 w-3 shrink-0" aria-hidden />
        Global
      </span>
    );
  }
  if (row.savedToContactProfile) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
        Profile
      </span>
    );
  }
  return <span className="text-[10px] text-muted-foreground">—</span>;
}

function StatusCell({ row }: { row: LibraryDocumentListRow }) {
  if (row.reviewStatus === "rejected") {
    return (
      <span
        className="inline-flex max-w-[10rem] flex-col gap-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400"
        title={row.rejectionReason}
      >
        <span className="inline-flex items-center gap-1">
          <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Rejected
        </span>
        {row.rejectionReason ? (
          <span className="truncate text-[9px] font-normal text-rose-600/80 dark:text-rose-400/80">
            {row.rejectionReason}
          </span>
        ) : null}
      </span>
    );
  }
  if (row.expiryStatus === "expired") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Expired
      </span>
    );
  }
  if (row.expiryStatus === "expiring_soon") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Soon
      </span>
    );
  }
  if (row.expiryStatus === "active" && row.expiresAt) {
    return (
      <DocumentVaultExpiryBadge status="active" expiresAt={row.expiresAt} />
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600/80" aria-hidden />
      Valid
    </span>
  );
}

function DraggableGridRow({
  row,
  showDragHandle,
  dragActive,
  children,
  className,
  ...props
}: {
  row: LibraryDocumentListRow;
  showDragHandle: boolean;
  dragActive: boolean;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: vaultDocumentDragId(row._id),
      disabled: !dragActive,
      data: { documentId: row._id },
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(className, isDragging && "opacity-40")}
      {...props}
    >
      {showDragHandle ? (
        <td className="w-8 px-1 py-1.5">
          {dragActive ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
              aria-label={`Drag ${row.title}`}
              {...listeners}
              {...attributes}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm text-muted-foreground/30"
              title="Rejected — cannot move"
              aria-label="Drag disabled for rejected document"
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </td>
      ) : null}
      {children}
    </tr>
  );
}

export function LibraryDocumentsVaultGridSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-dlc-md border border-border/70"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="pipeline-documents-vault-grid-skeleton"
    >
      <div className="border-b border-border/60 bg-muted/20 px-2 py-2">
        <div className="flex gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-3 w-16 animate-pulse rounded bg-muted/50"
            />
          ))}
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 border-b border-border/40 px-2 py-2 last:border-0"
        >
          <div className="h-4 w-4 animate-pulse rounded bg-muted/40" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted/35" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/30" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted/25" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted/20" />
        </div>
      ))}
      <span className="sr-only">Loading documents</span>
    </div>
  );
}

export type LibraryDocumentsVaultGridProps = {
  rows: LibraryDocumentListRow[];
  canMutate: boolean;
  memberUserKey?: string;
  selectedDocumentId: Id<"libraryDocuments"> | null;
  highlightDocumentId: Id<"libraryDocuments"> | null;
  bulkSelectedIds: Set<string>;
  bulkSelectableRows: LibraryDocumentListRow[];
  busyDoc: Id<"libraryDocuments"> | null;
  dragEnabled: boolean;
  proofForRow: (row: LibraryDocumentListRow) => LibraryDocumentsProof;
  onSelectDocument: (id: Id<"libraryDocuments">) => void;
  onToggleBulkSelect: (id: Id<"libraryDocuments">) => void;
  onBulkSelectAll: () => void;
  onBulkClearSelection: () => void;
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
  onDownloadOriginal?: (row: LibraryDocumentListRow) => void;
  exportingPdfDocId: Id<"libraryDocuments"> | null;
  onToggleExpanded: (id: Id<"libraryDocuments">) => void;
  onRemoveLink: (
    documentId: Id<"libraryDocuments">,
    proof: LibraryDocumentsProof,
    isGlobalContactDoc: boolean,
    title: string,
  ) => void;
  onAcceptAiSuggestion: (
    documentId: Id<"libraryDocuments">,
    proof: LibraryDocumentsProof,
  ) => void;
  onRejectDocument: (
    documentId: Id<"libraryDocuments">,
    reason: string,
  ) => void;
  className?: string;
};

export function LibraryDocumentsVaultGrid({
  rows,
  canMutate,
  memberUserKey,
  selectedDocumentId,
  highlightDocumentId,
  bulkSelectedIds,
  bulkSelectableRows,
  busyDoc,
  dragEnabled,
  proofForRow,
  onSelectDocument,
  onToggleBulkSelect,
  onBulkSelectAll,
  onBulkClearSelection,
  onMoveDoc,
  onOpenProperties,
  onSaveToContact,
  onAssignToRegistry,
  onDownloadAsPdf,
  onDownloadOriginal,
  exportingPdfDocId,
  onToggleExpanded,
  onRemoveLink,
  onAcceptAiSuggestion,
  onRejectDocument,
  className,
}: LibraryDocumentsVaultGridProps) {
  const [sort, setSort] = useState<SortState>({
    column: "uploaded",
    direction: "desc",
  });
  const [rejectPopoverDocId, setRejectPopoverDocId] =
    useState<Id<"libraryDocuments"> | null>(null);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  const toggleSort = (column: VaultGridSortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  };

  const allBulkChecked =
    bulkSelectableRows.length > 0 &&
    bulkSelectableRows.every((d) => bulkSelectedIds.has(String(d._id)));

  return (
    <div
      className={cn(
        "min-h-0 overflow-auto rounded-dlc-md border border-border/70",
        className,
      )}
      data-testid="document-vault-data-grid"
    >
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr>
            {dragEnabled ? (
              <th
                scope="col"
                className="sticky top-0 z-10 w-8 border-b border-border/70 bg-dlc-surface-high/95 backdrop-blur-sm"
              />
            ) : null}
            <th
              scope="col"
              className="sticky top-0 z-10 w-10 border-b border-border/70 bg-dlc-surface-high/95 px-2 py-2 backdrop-blur-sm"
            >
              {canMutate && bulkSelectableRows.length > 0 ? (
                <OperationalCheckbox
                  checked={allBulkChecked}
                  onChange={(e) => {
                    if (e.target.checked) onBulkSelectAll();
                    else onBulkClearSelection();
                  }}
                  aria-label="Select all documents"
                  data-testid="document-vault-select-all"
                />
              ) : null}
            </th>
            <SortHeader
              label="Name"
              column="title"
              sort={sort}
              onSort={toggleSort}
              className="min-w-[12rem]"
            />
            <SortHeader
              label="Category & AI"
              column="category"
              sort={sort}
              onSort={toggleSort}
              className="min-w-[9rem]"
            />
            <th
              scope="col"
              className="sticky top-0 z-10 border-b border-border/70 bg-dlc-surface-high/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
            >
              Linked to
            </th>
            <SortHeader
              label="Status"
              column="expiry"
              sort={sort}
              onSort={toggleSort}
              className="min-w-[5rem]"
            />
            <SortHeader
              label="Uploaded"
              column="uploaded"
              sort={sort}
              onSort={toggleSort}
              className="min-w-[6rem]"
            />
            <th
              scope="col"
              className="sticky top-0 z-10 border-b border-border/70 bg-dlc-surface-high/95 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((d) => {
            const rowProof = proofForRow(d);
            const isGlobalContactDoc = d.linkScope === "contact";
            const isSelected = selectedDocumentId === d._id;
            const isHighlighted = highlightDocumentId === d._id;
            const isBulkChecked = bulkSelectedIds.has(String(d._id));
            const showBulkCheckbox =
              d.linkScope === "pipeline" && d.latestVersionNumber > 0;
            const isRejected = d.reviewStatus === "rejected";
            const showDragHandle =
              dragEnabled && d.linkScope === "pipeline" && canMutate;
            const rowDraggable = showDragHandle && !isRejected;
            const showAiSuggestion =
              !d.documentCategory && d.aiSuggestedCategory && canMutate;

            return (
              <DraggableGridRow
                key={d._id}
                row={d}
                showDragHandle={showDragHandle}
                dragActive={rowDraggable}
                data-vault-document-id={d._id}
                data-testid={`pipeline-documents-vault-row-${d._id}`}
                className={cn(
                  "group/row border-b border-border/40 transition-colors last:border-0",
                  "hover:bg-muted/25",
                  isSelected && "bg-primary/8",
                  isHighlighted &&
                    "bg-amber-50/80 dark:bg-amber-950/25",
                  isRejected &&
                    "bg-rose-50/70 hover:bg-rose-50/90 dark:bg-rose-950/20 dark:hover:bg-rose-950/30",
                  isGlobalContactDoc && !isRejected && "opacity-90",
                )}
                onClick={() => onSelectDocument(d._id)}
              >
                <td
                  className="px-2 py-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showBulkCheckbox ? (
                    <OperationalCheckbox
                      checked={isBulkChecked}
                      onChange={() => onToggleBulkSelect(d._id)}
                      aria-label={`Select ${d.title}`}
                    />
                  ) : null}
                </td>
                <td className="max-w-[14rem] px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <FileText
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium leading-tight">
                        {d.title}
                      </div>
                      {(() => {
                        const outbound = vaultDocumentOutboundFileName(d);
                        return outbound && outbound !== d.title ? (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {outbound}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <CategoryCell row={d} />
                    {showAiSuggestion ? (
                      <DocumentVaultAiSuggestionBadge
                        suggestedCategory={d.aiSuggestedCategory!}
                        confidence={d.aiConfidence}
                        compact
                        busy={busyDoc === d._id}
                        onAccept={() => onAcceptAiSuggestion(d._id, rowProof)}
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <LinkedToCell row={d} />
                </td>
                <td className="px-2 py-1.5">
                  <StatusCell row={d} />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(d.latestUploadedAt)}
                </td>
                <td
                  className="px-2 py-1.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center justify-end gap-0.5">
                    {d.latestVersionNumber > 0 && d.latestVersionId ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label="Preview"
                          title="Preview"
                          onClick={() => onSelectDocument(d._id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label="Page editor"
                          title="Page editor"
                          onClick={() => onSelectDocument(d._id)}
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
                      onClick={() => onToggleExpanded(d._id)}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    {canMutate &&
                    d.linkScope === "pipeline" &&
                    !isRejected ? (
                      <div className="relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                          aria-label={`Reject ${d.title}`}
                          title="Reject & request re-upload"
                          data-testid={`document-vault-reject-${d._id}`}
                          onClick={() =>
                            setRejectPopoverDocId((prev) =>
                              prev === d._id ? null : d._id,
                            )
                          }
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </Button>
                        {rejectPopoverDocId === d._id ? (
                          <DocumentVaultRejectPopover
                            documentTitle={d.title}
                            busy={busyDoc === d._id}
                            onClose={() => setRejectPopoverDocId(null)}
                            onSubmit={(reason) => {
                              onRejectDocument(d._id, reason);
                              setRejectPopoverDocId(null);
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {canMutate && d.linkScope === "pipeline" ? (
                      <DropdownMenu
                        trigger={
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted"
                            aria-label={`Actions for ${d.title}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        }
                        align="end"
                      >
                        <DropdownMenuItem
                          disabled={
                            exportingPdfDocId === d._id || !d.latestVersionId
                          }
                          onClick={() => onDownloadAsPdf(d)}
                        >
                          {exportingPdfDocId === d._id ? (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <FileDown className="h-4 w-4" aria-hidden />
                          )}
                          {isCreatedVaultHtmlDocument(d) ||
                          isVaultImageDocument(d)
                            ? "Download PDF"
                            : "Download as PDF"}
                        </DropdownMenuItem>
                        {isCreatedVaultHtmlDocument(d) && onDownloadOriginal ? (
                          <DropdownMenuItem
                            disabled={!d.latestVersionId}
                            onClick={() => onDownloadOriginal(d)}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                            Download original (HTML)
                          </DropdownMenuItem>
                        ) : null}
                        {isVaultImageDocument(d) && onDownloadOriginal ? (
                          <DropdownMenuItem
                            disabled={!d.latestVersionId}
                            onClick={() => onDownloadOriginal(d)}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                            Download original
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onClick={() => onMoveDoc(d)}>
                          <FolderInput className="h-4 w-4" aria-hidden />
                          Move to folder
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onOpenProperties(d._id)}
                        >
                          <Info className="h-4 w-4" aria-hidden />
                          Properties
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAssignToRegistry(d)}>
                          <Link2 className="h-4 w-4" aria-hidden />
                          Assign to Contact/Entity
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onSaveToContact(d)}>
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
                        onClick={() =>
                          onRemoveLink(
                            d._id,
                            rowProof,
                            isGlobalContactDoc,
                            d.title,
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </DraggableGridRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
