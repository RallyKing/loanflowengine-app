"use client";

import { useCallback, useEffect, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import {
  type AnnotationToolMode,
} from "@/components/library/DocumentAnnotationLayer";
import { RichFilePreview } from "@/components/library/preview/RichFilePreview";
import {
  DocumentManipulationToolbar,
  type MergeCandidate,
  type VaultPreviewBreadcrumb,
} from "@/components/pipeline/tabs/DocumentManipulationToolbar";
import {
  normalizeVaultAnnotations,
  type VaultVersionAnnotations,
} from "@/lib/library/documentVaultAnnotations";
import {
  extractPdfPages,
  fetchPdfBytes,
  getPdfPageCount,
  mergePdfAppend,
  parsePageListInput,
  rotatePdfAllPages,
} from "@/lib/library/pdfManipulation";
import {
  commitPdfBytesAsNewVersion,
  type VaultUploadMutations,
} from "@/lib/library/uploadFileToVault";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";
import { PROFILE_ASSET_CATEGORIES } from "@/lib/library/documentVaultProfileAssets";

export type DocumentVaultMergeCandidate = MergeCandidate & {
  versionId: Id<"libraryDocumentVersions">;
};

export type DocumentVaultPreviewCanvasProps = {
  fileName: string;
  contentType?: string;
  url: string | null | undefined;
  loading?: boolean;
  className?: string;
  documentId?: Id<"libraryDocuments">;
  versionId?: Id<"libraryDocumentVersions">;
  versionNumber?: number;
  initialAnnotations?: VaultVersionAnnotations | null;
  proof?: LibraryDocumentsProof;
  memberUserKey?: string;
  canMutate?: boolean;
  pipelineFileId?: Id<"pipeline">;
  mergeCandidates?: DocumentVaultMergeCandidate[];
  vaultMutations?: VaultUploadMutations;
  onError?: (message: string) => void;
  onVersionCommitted?: (version: number) => void;
  breadcrumbs?: VaultPreviewBreadcrumb[];
  onBreadcrumbSelect?: (folderId: Id<"documentFolders"> | null) => void;
  onClosePreview?: () => void;
  onToggleFullscreen?: () => void;
  previewFullscreen?: boolean;
  onOpenInWindow?: () => void;
  onOpenProperties?: () => void;
  canEnterEditMode?: boolean;
  onEnterEditMode?: () => void;
};

export function DocumentVaultPreviewCanvas({
  fileName,
  contentType,
  url,
  loading = false,
  className,
  documentId,
  versionId,
  versionNumber = 0,
  initialAnnotations,
  proof,
  memberUserKey,
  canMutate = false,
  pipelineFileId,
  mergeCandidates = [],
  vaultMutations,
  onError,
  onVersionCommitted,
  breadcrumbs,
  onBreadcrumbSelect,
  onClosePreview,
  onToggleFullscreen,
  previewFullscreen = false,
  onOpenInWindow,
  onOpenProperties,
  canEnterEditMode = false,
  onEnterEditMode,
}: DocumentVaultPreviewCanvasProps) {
  const convex = useConvex();
  const patchVersionAnnotations = useMutation(
    api.libraryDocuments.patchVersionAnnotations,
  );
  const linkAndCategorize = useMutation(
    api.libraryDocuments.linkAndCategorizeDocument,
  );
  const logDocumentAccess = useMutation(api.libraryDocuments.logDocumentAccess);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [annotationMode, setAnnotationMode] =
    useState<AnnotationToolMode>("view");
  const [annotations, setAnnotations] = useState<VaultVersionAnnotations>(
    normalizeVaultAnnotations(initialAnnotations),
  );
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractInput, setExtractInput] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeContactId, setFinalizeContactId] = useState<
    Id<"contacts"> | ""
  >("");
  const [finalizeCategory, setFinalizeCategory] =
    useState<LibraryDocumentCategory>("id");
  const [renderEpoch, setRenderEpoch] = useState(0);
  const kind = guessAttachmentKind(contentType, fileName);
  const isPdfEditor =
    kind === "pdf" &&
    Boolean(documentId && versionId && proof && memberUserKey && vaultMutations);

  useEffect(() => {
    setAnnotations(normalizeVaultAnnotations(initialAnnotations));
    setAnnotationsDirty(false);
    setPageIndex(0);
  }, [documentId, versionId, initialAnnotations]);

  useEffect(() => {
    if (!documentId || !memberUserKey) return;
    void logDocumentAccess({
      documentId,
      pipelineFileId,
      action: "view",
      memberUserKey,
    }).catch(() => {});
  }, [documentId, memberUserKey, pipelineFileId, logDocumentAccess]);

  useEffect(() => {
    if (kind !== "pdf" || !url) {
      setPageCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const bytes = await fetchPdfBytes(url);
        const total = await getPdfPageCount(bytes);
        if (!cancelled) setPageCount(total);
      } catch {
        if (!cancelled) setPageCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, url, renderEpoch]);

  const reportError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      onError?.(msg);
    },
    [onError],
  );

  const commitPdfEdit = useCallback(
    async (bytes: Uint8Array, nextFileName: string) => {
      if (
        !documentId ||
        !proof ||
        !memberUserKey ||
        !vaultMutations
      ) {
        return;
      }
      setBusy(true);
      try {
        const { version } = await commitPdfBytesAsNewVersion({
          pdfBytes: bytes,
          fileName: nextFileName,
          documentId,
          proof,
          memberUserKey,
          generateUploadUrl: vaultMutations.generateUploadUrl,
          commitDocumentVersion: vaultMutations.commitDocumentVersion,
        });
        setRenderEpoch((n) => n + 1);
        setPageIndex(0);
        onVersionCommitted?.(version);
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    },
    [
      documentId,
      memberUserKey,
      onVersionCommitted,
      proof,
      reportError,
      vaultMutations,
    ],
  );

  const loadCurrentPdfBytes = useCallback(async () => {
    if (!url) throw new Error("No file URL.");
    return fetchPdfBytes(url);
  }, [url]);

  const handleRotate = useCallback(
    async (direction: "cw" | "ccw") => {
      if (!url) return;
      setBusy(true);
      try {
        const bytes = await loadCurrentPdfBytes();
        const delta = direction === "cw" ? 90 : -90;
        const next = await rotatePdfAllPages(bytes, delta);
        await commitPdfEdit(next, fileName);
      } catch (e) {
        reportError(e);
        setBusy(false);
      }
    },
    [commitPdfEdit, fileName, loadCurrentPdfBytes, reportError, url],
  );

  const handleExtract = useCallback(async () => {
    if (!url) return;
    setBusy(true);
    try {
      const bytes = await loadCurrentPdfBytes();
      const total = await getPdfPageCount(bytes);
      const pages = parsePageListInput(extractInput, total);
      if (pages.length === 0) {
        throw new Error("Enter valid page numbers (e.g. 1, 3, 5-7).");
      }
      const next = await extractPdfPages(bytes, pages);
      await commitPdfEdit(next, fileName);
      setExtractOpen(false);
      setExtractInput("");
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  }, [commitPdfEdit, extractInput, fileName, loadCurrentPdfBytes, reportError, url]);

  const handleMergeSelect = useCallback(
    async (targetDocumentId: string) => {
      if (!url || !memberUserKey) return;
      const target = mergeCandidates.find(
        (c) => c.documentId === targetDocumentId,
      );
      if (!target) return;
      setBusy(true);
      try {
        const mergeMeta = await convex.query(api.libraryDocuments.getVersionUrl, {
          documentId: target.documentId as Id<"libraryDocuments">,
          versionId: target.versionId,
          memberUserKey,
        });
        if (mergeMeta.status !== "ok" || !mergeMeta.url) {
          throw new Error("Could not load document to append.");
        }
        const baseBytes = await loadCurrentPdfBytes();
        const appendBytes = await fetchPdfBytes(mergeMeta.url);
        const next = await mergePdfAppend(baseBytes, appendBytes);
        await commitPdfEdit(next, fileName);
      } catch (e) {
        reportError(e);
        setBusy(false);
      }
    },
    [
      commitPdfEdit,
      convex,
      fileName,
      loadCurrentPdfBytes,
      memberUserKey,
      mergeCandidates,
      reportError,
      url,
    ],
  );

  const saveAnnotations = useCallback(async () => {
    if (!documentId || !versionId || !proof || !memberUserKey) return;
    setBusy(true);
    try {
      await patchVersionAnnotations({
        documentId,
        versionId,
        annotations,
        proof,
        memberUserKey,
      });
      setAnnotationsDirty(false);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [
    annotations,
    annotationsDirty,
    documentId,
    memberUserKey,
    patchVersionAnnotations,
    proof,
    reportError,
    versionId,
  ]);

  const handleAnnotationsChange = useCallback(
    (next: VaultVersionAnnotations) => {
      setAnnotations(next);
      setAnnotationsDirty(true);
    },
    [],
  );

  const finalizeContactsQuery = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    finalizeOpen && pipelineFileId && memberUserKey
      ? { fileId: pipelineFileId, memberUserKey }
      : finalizeOpen && pipelineFileId
        ? { fileId: pipelineFileId }
        : "skip",
  );

  const handleFinalize = useCallback(async () => {
    if (
      !documentId ||
      !versionId ||
      !proof ||
      !pipelineFileId ||
      !memberUserKey ||
      !finalizeContactId
    ) {
      return;
    }
    setBusy(true);
    try {
      if (annotationsDirty) {
        await patchVersionAnnotations({
          documentId,
          versionId,
          annotations,
          proof,
          memberUserKey,
        });
        setAnnotationsDirty(false);
      }
      await linkAndCategorize({
        documentId,
        pipelineFileId,
        contactId: finalizeContactId,
        documentCategory: finalizeCategory,
        memberUserKey,
      });
      setFinalizeOpen(false);
      setFinalizeContactId("");
      setFinalizeCategory("id");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [
    annotations,
    annotationsDirty,
    documentId,
    finalizeCategory,
    finalizeContactId,
    linkAndCategorize,
    memberUserKey,
    patchVersionAnnotations,
    pipelineFileId,
    proof,
    reportError,
    versionId,
  ]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden",
          className,
        )}
        data-testid="document-vault-preview-loading"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          Loading preview…
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden",
          className,
        )}
        data-testid="document-vault-preview-empty"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            No document source found.
          </p>
          <p className="text-xs text-muted-foreground">
            Select a document with an uploaded version to preview it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
          className,
        )}
        data-testid="document-vault-preview-canvas"
      >
        {isPdfEditor ? (
          <DocumentManipulationToolbar
            versionNumber={versionNumber}
            pageIndex={pageIndex}
            pageCount={pageCount}
            busy={busy}
            annotationMode={annotationMode}
            mergeCandidates={mergeCandidates}
            canMutate={canMutate}
            onRotate={(dir) => void handleRotate(dir)}
            onExtractPages={() => {
              setExtractInput(String(pageIndex + 1));
              setExtractOpen(true);
            }}
            onMergeSelect={(id) => void handleMergeSelect(id)}
            onAnnotationModeChange={setAnnotationMode}
            onSaveAnnotations={() => void saveAnnotations()}
            onFinalize={() => setFinalizeOpen(true)}
            onPageChange={setPageIndex}
            breadcrumbs={breadcrumbs}
            onBreadcrumbSelect={onBreadcrumbSelect}
            onClosePreview={onClosePreview}
            onToggleFullscreen={onToggleFullscreen}
            previewFullscreen={previewFullscreen}
            onOpenInWindow={onOpenInWindow}
            onOpenProperties={onOpenProperties}
            fileName={fileName}
            canEnterEditMode={canEnterEditMode}
            onEnterEditMode={onEnterEditMode}
          />
        ) : (
          <DocumentManipulationToolbar
            versionNumber={versionNumber}
            pageIndex={0}
            pageCount={0}
            busy={false}
            annotationMode="view"
            mergeCandidates={[]}
            canMutate={false}
            onRotate={() => {}}
            onExtractPages={() => {}}
            onMergeSelect={() => {}}
            onAnnotationModeChange={() => {}}
            onSaveAnnotations={() => {}}
            onFinalize={() => {}}
            onPageChange={() => {}}
            breadcrumbs={breadcrumbs}
            onBreadcrumbSelect={onBreadcrumbSelect}
            onClosePreview={onClosePreview}
            onToggleFullscreen={onToggleFullscreen}
            previewFullscreen={previewFullscreen}
            onOpenInWindow={onOpenInWindow}
            onOpenProperties={onOpenProperties}
            fileName={fileName}
            canEnterEditMode={canEnterEditMode}
            onEnterEditMode={onEnterEditMode}
          />
        )}

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <RichFilePreview
            url={url}
            fileName={fileName}
            contentType={contentType}
            className="h-full min-h-0 min-w-0"
            viewportClassName="min-h-0"
            onError={onError}
          />
        </div>
      </div>

      <OverlayShell
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        aria-label="Extract pages"
        panelClassName="w-full max-w-sm p-5"
      >
        <h3 className="text-sm font-semibold">Extract pages</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Keep selected pages and save as a new version. Example:{" "}
          <span className="font-mono">1, 3, 5-7</span>
        </p>
        <input
          className="mt-3 h-10 w-full rounded-dlc-sm border border-input bg-background px-2 text-base md:text-sm"
          value={extractInput}
          onChange={(e) => setExtractInput(e.target.value)}
          placeholder="1, 3, 5-7"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExtractOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleExtract()}
          >
            {busy ? "Saving…" : "Extract & save"}
          </Button>
        </div>
      </OverlayShell>

      <OverlayShell
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        aria-label="Finalize and save"
        panelClassName="w-full max-w-md p-5"
      >
        <h3 className="text-sm font-semibold">Finalize &amp; Save</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Save annotations and link this document to a borrower profile with an
          asset type.
        </p>
        {finalizeContactsQuery === undefined ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading contacts…</p>
        ) : finalizeContactsQuery.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Link a CRM contact to this file first.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Contact</span>
              <select
                value={finalizeContactId}
                onChange={(e) =>
                  setFinalizeContactId(
                    e.target.value
                      ? (e.target.value as Id<"contacts">)
                      : "",
                  )
                }
                className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-base md:text-sm"
              >
                <option value="">Select contact…</option>
                {finalizeContactsQuery.map((c) => (
                  <option key={c.contactId} value={c.contactId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                Asset type
              </span>
              <select
                value={finalizeCategory}
                onChange={(e) =>
                  setFinalizeCategory(e.target.value as LibraryDocumentCategory)
                }
                className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-base md:text-sm"
              >
                {PROFILE_ASSET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {LIBRARY_DOCUMENT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFinalizeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              busy ||
              !finalizeContactId ||
              finalizeContactsQuery?.length === 0
            }
            onClick={() => void handleFinalize()}
          >
            {busy ? "Saving…" : "Finalize"}
          </Button>
        </div>
      </OverlayShell>
    </>
  );
}
