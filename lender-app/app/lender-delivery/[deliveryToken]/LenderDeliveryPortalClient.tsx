"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Shield,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { LenderDeliveryBlockPanel } from "@/components/library/LenderDeliveryBlockPanel";
import { RichFilePreview } from "@/components/library/preview/RichFilePreview";
import { cn } from "@/lib/cn";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import { downloadVaultDocumentsZip } from "@/lib/library/downloadVaultDocumentsZip";
import { buildVaultDocumentZipPath } from "@/lib/library/vaultZipPaths";
import {
  buildVerifyAccessPath,
  readPortalAccessProof,
} from "@/lib/portalAccessProof";
import { PortalPageComposition } from "@/components/portal/PortalPageSectionRenderer";
import type { PortalPageSectionInstance } from "@/lib/portalPageSections";

type LenderDeliveryPortalClientProps = {
  deliveryToken: string;
};

type DeliveryDocument = {
  documentId: Id<"libraryDocuments">;
  versionId?: Id<"libraryDocumentVersions">;
  title: string;
  fileName?: string;
  contentType?: string;
  url?: string;
  folderId?: Id<"documentFolders">;
};

type DeliveryFolder = {
  _id: Id<"documentFolders">;
  name: string;
  parentFolderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
};

export function LenderDeliveryPortalClient({
  deliveryToken,
}: LenderDeliveryPortalClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const accessProof = readPortalAccessProof(deliveryToken);
  const delivery = useQuery(api.lenderDeliveryPortal.getDeliveryByToken, {
    token: deliveryToken,
    accessProof,
  });
  const composition = useQuery(
    api.portalDefaults.resolveCompositionForLenderDelivery,
    { token: deliveryToken },
  );
  const recordAccess = useMutation(
    api.lenderDeliveryPortal.recordDeliveryPortalAccess,
  );
  const trackEngagement = useMutation(api.portalEngagement.trackPortalEngagementEvent);
  const accessLoggedRef = useRef(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  useEffect(() => {
    if (delivery?.status !== "verification_required") return;
    router.replace(
      buildVerifyAccessPath(deliveryToken, pathname || `/lender-delivery/${deliveryToken}`),
    );
  }, [delivery?.status, deliveryToken, pathname, router]);

  const emitEngagement = useCallback(
    (
      eventType: "document_previewed" | "folder_expanded" | "package_exported",
      detail: {
        documentTitle?: string;
        folderName?: string;
        packageLabel?: string;
        documentId?: Id<"libraryDocuments">;
        folderId?: Id<"documentFolders">;
      },
    ) => {
      void trackEngagement({
        token: deliveryToken,
        eventType,
        lenderName: delivery?.status === "ok" ? delivery.lenderName : undefined,
        ...detail,
      });
    },
    [delivery, deliveryToken, trackEngagement],
  );

  useEffect(() => {
    if (delivery?.status !== "ok" || accessLoggedRef.current) return;
    accessLoggedRef.current = true;
    void recordAccess({
      token: deliveryToken,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
  }, [delivery?.status, deliveryToken, recordAccess]);

  const handleDownloadAll = useCallback(async () => {
    if (delivery?.status !== "ok" || delivery.permission !== "downloadable") return;
    const folderRows = delivery.folders as DocumentFolderRow[];
    const items = delivery.documents
      .filter((d) => d.url && d.versionId)
      .map((d) => ({
        documentId: d.documentId,
        versionId: d.versionId!,
        fileName: d.fileName ?? d.title,
        url: d.url!,
        zipPath: buildVaultDocumentZipPath(
          folderRows,
          d.folderId,
          d.fileName ?? d.title,
        ),
      }));
    if (items.length === 0) {
      setZipError("No downloadable files in this package.");
      return;
    }
    setZipBusy(true);
    setZipError(null);
    try {
      const zipName = `${delivery.fileLabel.replace(/[^\w.-]+/g, "_")}-package.zip`;
      emitEngagement("package_exported", {
        packageLabel: "completed deal ZIP package",
      });
      await downloadVaultDocumentsZip(items, zipName);
    } catch (e) {
      setZipError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setZipBusy(false);
    }
  }, [delivery, emitEngagement]);

  if (delivery === undefined || delivery?.status === "verification_required") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (delivery.status === "not_found" || delivery.status === "invalid") {
    return <StatusCard tone="error">This delivery link is invalid.</StatusCard>;
  }
  if (delivery.status === "revoked") {
    return (
      <StatusCard tone="error" title="Link Revoked">
        This secure delivery link has been revoked. Contact the sender for a new
        package link.
      </StatusCard>
    );
  }
  if (delivery.status === "expired") {
    return (
      <StatusCard tone="error" title="Link Expired">
        This secure delivery link has expired. Contact the sender for a new package
        link.
      </StatusCard>
    );
  }
  if (delivery.status !== "ok") {
    return <StatusCard tone="error">This delivery link is invalid.</StatusCard>;
  }

  const canDownload = delivery.permission === "downloadable";

  const useComposition =
    composition?.status === "ok" && (composition.sections?.length ?? 0) > 0;
  const compositionChrome =
    composition?.status === "ok" ? composition.chrome ?? null : null;
  const compositionUsesChrome = Boolean(
    compositionChrome &&
      ((compositionChrome.sidebar?.items?.length ?? 0) > 0 ||
        compositionChrome.top),
  );

  const packageBody = (
    <>
        {canDownload ? (
          <div
            className="sticky top-4 z-10 mb-6 rounded-dlc-lg border border-border/80 bg-white p-3 shadow-dlc-2"
            data-testid="lender-data-room-action-hub"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Action hub</p>
                <p className="text-[11px] text-muted-foreground">
                  {delivery.documents.length} document
                  {delivery.documents.length === 1 ? "" : "s"} in package
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="primary"
                className="gap-1.5"
                disabled={zipBusy || delivery.documents.length === 0}
                data-testid="lender-download-all-zip"
                onClick={() => void handleDownloadAll()}
              >
                {zipBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                Download All (ZIP)
              </Button>
            </div>
            {zipError ? (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {zipError}
              </p>
            ) : null}
          </div>
        ) : null}

        {delivery.fileTasks.length > 0 ? (
          <section className="mb-6 space-y-4" data-testid="lender-data-room-blocks">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Deal data
            </h2>
            {delivery.fileTasks.map((task) => (
              <LenderDeliveryBlockPanel
                key={String(task.fileTaskId)}
                deliveryToken={deliveryToken}
                fileTaskId={task.fileTaskId}
                pipelineFileId={delivery.pipelineFileId}
                assignedBlocks={task.assignedBlocks}
                taskTitle={task.title}
              />
            ))}
          </section>
        ) : null}
    </>
  );

  return (
    <div
      className={
        compositionUsesChrome
          ? "min-h-dvh bg-neutral-50 px-0 py-0 sm:px-3 sm:py-6"
          : "min-h-dvh bg-neutral-50 px-4 py-10"
      }
    >
      <div
        className={
          compositionUsesChrome ? "mx-auto max-w-6xl" : "mx-auto max-w-3xl"
        }
      >
        {useComposition && composition ? (
          <PortalPageComposition
            className="mb-6"
            sections={composition.sections as PortalPageSectionInstance[]}
            chrome={compositionChrome}
            context={{
              ...composition.context,
              fileLabel:
                composition.context?.fileLabel ?? delivery.fileLabel,
              workspaceName:
                composition.context?.workspaceName ?? delivery.workspaceName,
              outstandingCount:
                composition.context?.outstandingCount ??
                delivery.documents.length,
            }}
            slots={{
              documentPackage: (
                <div className="space-y-4">
                  {packageBody}
                  <LenderDataRoomDocumentTree
                    folders={delivery.folders}
                    documents={delivery.documents}
                    canDownload={canDownload}
                    onFolderExpand={(folderName, folderId) =>
                      emitEngagement("folder_expanded", {
                        folderName,
                        folderId,
                      })
                    }
                    onDocumentPreview={(documentTitle, documentId) =>
                      emitEngagement("document_previewed", {
                        documentTitle,
                        documentId,
                      })
                    }
                  />
                </div>
              ),
            }}
          />
        ) : (
          <header className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {delivery.workspaceName}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Shield className="h-5 w-5 text-primary" aria-hidden />
              Lender Data Room
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Secure package for {delivery.lenderName} · {delivery.fileLabel}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canDownload ? "View and download" : "View only"} · Read-only deal data
            </p>
          </header>
        )}

        {!useComposition ? (
          <>
            {packageBody}
            <section data-testid="lender-data-room-documents">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </h2>
              <LenderDataRoomDocumentTree
                folders={delivery.folders}
                documents={delivery.documents}
                canDownload={canDownload}
                onFolderExpand={(folderName, folderId) =>
                  emitEngagement("folder_expanded", { folderName, folderId })
                }
                onDocumentPreview={(documentTitle, documentId) =>
                  emitEngagement("document_previewed", {
                    documentTitle,
                    documentId,
                  })
                }
              />
            </section>
          </>
        ) : null}

        {delivery.documents.length === 0 && delivery.folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents in this package.</p>
        ) : null}
      </div>
    </div>
  );
}

function LenderDataRoomDocumentTree({
  folders,
  documents,
  canDownload,
  onFolderExpand,
  onDocumentPreview,
}: {
  folders: DeliveryFolder[];
  documents: DeliveryDocument[];
  canDownload: boolean;
  onFolderExpand?: (folderName: string, folderId: Id<"documentFolders">) => void;
  onDocumentPreview?: (
    documentTitle: string,
    documentId: Id<"libraryDocuments">,
  ) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const folderTree = useMemo(
    () => buildFolderTree(folders as DocumentFolderRow[], null),
    [folders],
  );

  const rootDocs = useMemo(
    () => documents.filter((d) => !d.folderId),
    [documents],
  );

  const toggle = (id: string, folderName: string, folderId: Id<"documentFolders">) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const opening = !next.has(id);
      if (opening) {
        next.add(id);
        onFolderExpand?.(folderName, folderId);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  if (folders.length === 0) {
    return (
      <ul className="space-y-3">
        {documents.map((doc) => (
          <LenderDeliveryDocumentRow
            key={String(doc.documentId)}
            doc={doc}
            canDownload={canDownload}
            onPreview={() =>
              onDocumentPreview?.(doc.title, doc.documentId)
            }
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {folderTree.length > 0 ? (
        <ul className="space-y-2 rounded-dlc-lg border border-border/70 bg-white p-3 shadow-dlc-1">
          {folderTree.map((node) => (
            <FolderDocumentNode
              key={String(node.folder._id)}
              node={node}
              documents={documents}
              expanded={expanded}
              onToggle={toggle}
              canDownload={canDownload}
              depth={0}
              onFolderExpand={onFolderExpand}
              onDocumentPreview={onDocumentPreview}
            />
          ))}
        </ul>
      ) : null}
      {rootDocs.length > 0 ? (
        <ul className="space-y-3">
          {rootDocs.map((doc) => (
            <LenderDeliveryDocumentRow
              key={String(doc.documentId)}
              doc={doc}
              canDownload={canDownload}
              onPreview={() =>
                onDocumentPreview?.(doc.title, doc.documentId)
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FolderDocumentNode({
  node,
  documents,
  expanded,
  onToggle,
  canDownload,
  depth,
  onFolderExpand,
  onDocumentPreview,
}: {
  node: FolderTreeNode;
  documents: DeliveryDocument[];
  expanded: Set<string>;
  onToggle: (id: string, folderName: string, folderId: Id<"documentFolders">) => void;
  canDownload: boolean;
  depth: number;
  onFolderExpand?: (folderName: string, folderId: Id<"documentFolders">) => void;
  onDocumentPreview?: (
    documentTitle: string,
    documentId: Id<"libraryDocuments">,
  ) => void;
}) {
  const folderId = node.folder._id;
  const isOpen = expanded.has(String(folderId));
  const folderDocs = documents.filter(
    (d) => d.folderId && String(d.folderId) === String(folderId),
  );

  return (
    <li>
      <div
        className="flex items-center gap-1.5 py-1"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/40"
          onClick={() => onToggle(String(folderId), node.folder.name, folderId)}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        ) : (
          <Folder className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        )}
        <span className="text-xs font-medium">{node.folder.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {folderDocs.length} file{folderDocs.length === 1 ? "" : "s"}
        </span>
      </div>
      {isOpen ? (
        <div style={{ paddingLeft: depth * 12 + 24 }}>
          <ul className="space-y-2 py-1">
            {folderDocs.map((doc) => (
              <LenderDeliveryDocumentRow
                key={String(doc.documentId)}
                doc={doc}
                canDownload={canDownload}
                compact
                onPreview={() =>
                  onDocumentPreview?.(doc.title, doc.documentId)
                }
              />
            ))}
          </ul>
          {node.children.map((child) => (
            <FolderDocumentNode
              key={String(child.folder._id)}
              node={child}
              documents={documents}
              expanded={expanded}
              onToggle={onToggle}
              canDownload={canDownload}
              depth={depth + 1}
              onFolderExpand={onFolderExpand}
              onDocumentPreview={onDocumentPreview}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function LenderDeliveryDocumentRow({
  doc,
  canDownload,
  compact = false,
  onPreview,
}: {
  doc: DeliveryDocument;
  canDownload: boolean;
  compact?: boolean;
  onPreview?: () => void;
}) {
  const title = doc.title;
  const fileName = doc.fileName ?? doc.title;
  const contentType = doc.contentType;
  const url = doc.url;
  const [previewOpen, setPreviewOpen] = useState(false);

  const handlePreview = () => {
    onPreview?.();
    setPreviewOpen(true);
  };

  const previewPane =
    url && (previewOpen || !canDownload) ? (
      <div
        className="mt-3 overflow-hidden rounded-dlc-md border border-border/60 bg-muted/20 select-none"
        onContextMenu={(e) => e.preventDefault()}
        onMouseEnter={!canDownload ? () => onPreview?.() : undefined}
        data-testid="lender-doc-preview-pane"
      >
        <RichFilePreview
          url={url}
          fileName={fileName}
          contentType={contentType}
          protectMedia={!canDownload}
          viewportClassName="min-h-[min(70vh,32rem)] max-h-[min(70vh,32rem)]"
        />
      </div>
    ) : null;

  return (
    <li
      className={cn(
        "rounded-dlc-lg border border-border/80 bg-white shadow-dlc-1",
        compact ? "p-2" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            {doc.fileName ? (
              <p className="truncate text-xs text-muted-foreground">{doc.fileName}</p>
            ) : null}
          </div>
        </div>
        {canDownload && url ? (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              data-testid="lender-doc-preview"
              onClick={handlePreview}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Preview
            </Button>
            <a href={url} download={fileName ?? title} className="inline-flex">
              <Button type="button" size="sm" variant="outline" className="gap-1 text-xs">
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </Button>
            </a>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Eye className="h-3 w-3" aria-hidden />
            View only
          </span>
        )}
      </div>

      {previewPane}
    </li>
  );
}

function StatusCard({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "error" | "info";
  title?: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div
        className={cn(
          "max-w-md rounded-2xl border p-6 text-center text-sm",
          tone === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-neutral-200 bg-neutral-50 text-neutral-800",
        )}
      >
        {title ? <h1 className="mb-2 text-base font-semibold">{title}</h1> : null}
        {children}
      </div>
    </div>
  );
}
