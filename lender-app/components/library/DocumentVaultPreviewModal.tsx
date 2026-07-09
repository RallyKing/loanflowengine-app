"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";
import {
  DocumentVaultPreviewCanvas,
  type DocumentVaultMergeCandidate,
} from "@/components/pipeline/tabs/DocumentVaultPreviewCanvas";
import { DocumentEditorCanvas } from "@/components/library/editor/DocumentEditorCanvas";
import { HtmlDocumentEditorCanvas } from "@/components/library/editor/HtmlDocumentEditorCanvas";
import {
  BlockIdentityHeader,
  fileTypeBadgeLabel,
} from "@/components/library/preview/BlockIdentityHeader";
import { PreviewEditorSkeleton } from "@/components/library/preview/PreviewEditorSkeleton";
import type { VaultPreviewBreadcrumb } from "@/components/pipeline/tabs/DocumentManipulationToolbar";
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import type { VaultVersionAnnotations } from "@/lib/library/documentVaultAnnotations";
import {
  fetchPdfBytes,
  getPdfPageCount,
} from "@/lib/library/pdfManipulation";

export type PreviewMode = "view" | "edit";

export type DocumentVaultPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  fileName: string;
  contentType?: string;
  url: string | null | undefined;
  loading?: boolean;
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
  breadcrumbs?: VaultPreviewBreadcrumb[];
  onBreadcrumbSelect?: (folderId: Id<"documentFolders"> | null) => void;
  onOpenProperties?: () => void;
  onError?: (message: string) => void;
  onVersionCommitted?: (version: number) => void;
  lastModified?: number;
};

export function DocumentVaultPreviewModal({
  open,
  onClose,
  onBreadcrumbSelect,
  onOpenProperties,
  onVersionCommitted,
  breadcrumbs,
  fileName,
  contentType,
  url: urlProp,
  loading: loadingProp = false,
  documentId,
  versionId,
  versionNumber: versionNumberProp,
  initialAnnotations: initialAnnotationsProp,
  proof,
  memberUserKey,
  canMutate = false,
  pipelineFileId,
  mergeCandidates,
  vaultMutations,
  onError,
  lastModified,
}: DocumentVaultPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("view");
  const [displayFileName, setDisplayFileName] = useState(fileName);
  const [isEditingPreviewTitle, setIsEditingPreviewTitle] = useState(false);
  const [previewTitleDraft, setPreviewTitleDraft] = useState(fileName);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageCountLoading, setPageCountLoading] = useState(false);
  const [editToolbarSlot, setEditToolbarSlot] = useState<HTMLDivElement | null>(
    null,
  );

  const versionUrlQuery = useQuery(
    api.libraryDocuments.getVersionUrl,
    open && documentId && versionId && memberUserKey
      ? {
          documentId,
          versionId,
          memberUserKey,
        }
      : "skip",
  );
  const patchDocumentTitle = useMutation(api.libraryDocuments.patchDocumentTitle);

  useEffect(() => {
    setDisplayFileName(fileName);
    setPreviewTitleDraft(fileName);
    setIsEditingPreviewTitle(false);
  }, [fileName, documentId, versionId, open]);

  const docUrl = useMemo(() => {
    if (versionUrlQuery?.status === "ok" && versionUrlQuery.url) {
      return versionUrlQuery.url;
    }
    return urlProp ?? null;
  }, [urlProp, versionUrlQuery]);

  const docLoading = useMemo(() => {
    if (!open || !documentId || !versionId || !memberUserKey) {
      return loadingProp;
    }
    if (versionUrlQuery === undefined) return true;
    if (versionUrlQuery.status === "ok" && versionUrlQuery.url) return false;
    return loadingProp;
  }, [
    documentId,
    loadingProp,
    memberUserKey,
    open,
    versionId,
    versionUrlQuery,
  ]);

  const versionNumber =
    versionUrlQuery?.status === "ok"
      ? versionUrlQuery.version
      : versionNumberProp;

  const initialAnnotations =
    versionUrlQuery?.status === "ok"
      ? (versionUrlQuery.annotations ?? null)
      : initialAnnotationsProp;

  const kind = guessAttachmentKind(contentType, fileName);
  const fileTypeLabel = fileTypeBadgeLabel(contentType, fileName);

  const canEnterHtmlEditMode = useMemo(
    () =>
      Boolean(
        documentId &&
          proof &&
          memberUserKey &&
          vaultMutations &&
          canMutate &&
          kind === "html" &&
          docUrl,
      ),
    [canMutate, docUrl, documentId, kind, memberUserKey, proof, vaultMutations],
  );

  const canEnterMediaEditMode = useMemo(
    () =>
      Boolean(
        documentId &&
          proof &&
          memberUserKey &&
          vaultMutations &&
          canMutate &&
          (kind === "pdf" || kind === "image"),
      ),
    [
      canMutate,
      documentId,
      kind,
      memberUserKey,
      proof,
      vaultMutations,
    ],
  );

  const canEnterEditMode = canEnterHtmlEditMode || canEnterMediaEditMode;

  const handleSavePreviewTitle = useCallback(async () => {
    if (!documentId || !proof || !memberUserKey) {
      setIsEditingPreviewTitle(false);
      return;
    }
    const trimmed = previewTitleDraft.trim();
    if (!trimmed) {
      setPreviewTitleDraft(displayFileName);
      setIsEditingPreviewTitle(false);
      return;
    }
    if (trimmed === displayFileName) {
      setIsEditingPreviewTitle(false);
      return;
    }
    try {
      await patchDocumentTitle({
        documentId,
        title: trimmed,
        proof,
        memberUserKey,
      });
      setDisplayFileName(trimmed);
      setIsEditingPreviewTitle(false);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  }, [
    displayFileName,
    documentId,
    memberUserKey,
    onError,
    patchDocumentTitle,
    previewTitleDraft,
    proof,
  ]);

  const handleEnterEditMode = useCallback(() => {
    setIsEditingPreviewTitle(false);
    setMode("edit");
  }, []);

  useEffect(() => {
    if (!open) {
      setIsFullscreen(false);
      setMode("view");
    }
  }, [open]);

  useEffect(() => {
    setMode("view");
    setPageCount(null);
  }, [documentId, versionId]);

  useEffect(() => {
    if (!open || !docUrl) {
      setPageCount(kind === "image" ? 1 : null);
      setPageCountLoading(false);
      return;
    }

    if (kind === "image") {
      setPageCount(1);
      setPageCountLoading(false);
      return;
    }

    if (kind !== "pdf") {
      setPageCount(null);
      setPageCountLoading(false);
      return;
    }

    let cancelled = false;
    setPageCountLoading(true);
    void (async () => {
      try {
        const bytes = await fetchPdfBytes(docUrl);
        const total = await getPdfPageCount(bytes);
        if (!cancelled) setPageCount(total);
      } catch {
        if (!cancelled) setPageCount(null);
      } finally {
        if (!cancelled) setPageCountLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docUrl, kind, open, documentId, versionId]);

  const panelClassName = cn(
    "flex h-[min(100dvh,960px)] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-background",
    isFullscreen
      ? "fixed inset-0 z-[51] h-[100dvh] max-w-none rounded-none border-0 shadow-none"
      : "mx-auto max-w-5xl rounded-dlc-lg border border-border/70 shadow-dlc-3",
  );

  const sharedChrome = {
    breadcrumbs,
    onBreadcrumbSelect,
    onClosePreview: onClose,
    onToggleFullscreen: () => setIsFullscreen((prev) => !prev),
    previewFullscreen: isFullscreen,
    onOpenProperties,
    fileName: displayFileName,
  };

  const editorReady =
    mode === "edit" &&
    canEnterMediaEditMode &&
    documentId &&
    proof &&
    memberUserKey &&
    vaultMutations &&
    docUrl &&
    !docLoading;

  const htmlEditorReady =
    mode === "edit" &&
    canEnterHtmlEditMode &&
    documentId &&
    proof &&
    memberUserKey &&
    vaultMutations &&
    docUrl &&
    !docLoading;

  const editorKey = `editor-${documentId ?? "none"}-${versionId ?? "none"}-${mode}`;

  useEffect(() => {
    if (mode !== "edit" || !editorReady) return;

    let t1 = 0;
    let t2 = 0;
    const raf = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      t1 = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
      t2 = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
    });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mode, editorReady]);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      wrapPanel={false}
      layer="MODAL"
      align="center"
      className="fixed inset-0 z-[var(--z-modal,50)] items-stretch justify-center p-0 sm:p-4"
      contentClassName="flex h-full w-full max-w-full min-h-0 items-stretch justify-center"
      scrimClassName={isFullscreen ? "bg-background" : undefined}
      aria-label="Document preview"
      data-testid="document-vault-preview-modal"
    >
      <div
        className={panelClassName}
        role="document"
        aria-label={displayFileName || "Document preview"}
        data-preview-mode={mode}
      >
        <BlockIdentityHeader
          fileName={displayFileName}
          fileType={fileTypeLabel}
          pageCount={pageCount}
          pageCountLoading={pageCountLoading}
          lastModified={lastModified}
          mode={mode}
          className="relative z-30 shrink-0"
          canEditTitle={Boolean(canMutate && documentId && proof && memberUserKey)}
          isEditingTitle={isEditingPreviewTitle}
          editTitleValue={previewTitleDraft}
          onStartEditTitle={() => {
            setPreviewTitleDraft(displayFileName);
            setIsEditingPreviewTitle(true);
          }}
          onEditTitleChange={setPreviewTitleDraft}
          onSaveTitle={() => void handleSavePreviewTitle()}
          onCancelEditTitle={() => {
            setPreviewTitleDraft(displayFileName);
            setIsEditingPreviewTitle(false);
          }}
        />

        <div
          ref={setEditToolbarSlot}
          className={cn(
            "relative z-30 shrink-0",
            mode !== "edit" && "hidden",
          )}
          data-testid="document-vault-edit-toolbar-slot"
        />

        {mode === "edit" && canEnterHtmlEditMode ? (
          htmlEditorReady ? (
            <HtmlDocumentEditorCanvas
              documentId={documentId!}
              title={displayFileName}
              url={docUrl!}
              proof={proof!}
              memberUserKey={memberUserKey!}
              vaultMutations={vaultMutations!}
              canMutate={canMutate}
              versionNumber={versionNumber}
              className="min-h-0 min-w-0 flex-1 overflow-hidden border-0 shadow-none"
              onError={onError}
              onVersionCommitted={onVersionCommitted}
              onCancelEditMode={() => setMode("view")}
              {...sharedChrome}
            />
          ) : (
            <PreviewEditorSkeleton
              className="min-h-0 flex-1"
              onCancelEditMode={() => setMode("view")}
            />
          )
        ) : mode === "edit" && canEnterMediaEditMode ? (
          editorReady ? (
            <DocumentEditorCanvas
              key={editorKey}
              contentType={contentType}
              url={docUrl}
              className="min-h-0 min-w-0 flex-1 overflow-hidden border-0 shadow-none"
              documentId={documentId!}
              versionNumber={versionNumber}
              proof={proof!}
              memberUserKey={memberUserKey!}
              canMutate={canMutate}
              vaultMutations={vaultMutations!}
              onError={onError}
              onVersionCommitted={onVersionCommitted}
              onCancelEditMode={() => setMode("view")}
              toolbarSlot={editToolbarSlot}
              {...sharedChrome}
            />
          ) : (
            <PreviewEditorSkeleton
              className="min-h-0 flex-1"
              onCancelEditMode={() => setMode("view")}
            />
          )
        ) : (
          <DocumentVaultPreviewCanvas
            key={`view-${documentId ?? "none"}-${versionId ?? "none"}`}
            contentType={contentType}
            url={docUrl}
            loading={docLoading}
            className="min-h-0 min-w-0 flex-1 overflow-hidden border-0 shadow-none"
            documentId={documentId}
            versionId={versionId}
            versionNumber={versionNumber}
            initialAnnotations={initialAnnotations}
            proof={proof}
            memberUserKey={memberUserKey}
            canMutate={canMutate}
            pipelineFileId={pipelineFileId}
            mergeCandidates={mergeCandidates}
            vaultMutations={vaultMutations}
            onError={onError}
            onVersionCommitted={onVersionCommitted}
            canEnterEditMode={canEnterEditMode}
            onEnterEditMode={handleEnterEditMode}
            {...sharedChrome}
          />
        )}
      </div>
    </OverlayShell>
  );
}
