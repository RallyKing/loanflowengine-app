"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Save,
  Underline,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import type { Id } from "@/convex/_generated/dataModel";
import {
  extractHtmlDocumentBody,
  htmlDocumentToVaultFile,
} from "@/lib/pipeline/documentVaultCreator";
import {
  uploadNewVersionToVault,
  type VaultUploadMutations,
} from "@/lib/library/uploadFileToVault";
import { DocumentManipulationToolbar } from "@/components/pipeline/tabs/DocumentManipulationToolbar";
import type { VaultPreviewBreadcrumb } from "@/components/pipeline/tabs/DocumentManipulationToolbar";

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export type HtmlDocumentEditorCanvasProps = {
  documentId: Id<"libraryDocuments">;
  title: string;
  url: string;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  vaultMutations: VaultUploadMutations;
  canMutate: boolean;
  versionNumber?: number;
  className?: string;
  breadcrumbs?: VaultPreviewBreadcrumb[];
  onBreadcrumbSelect?: (folderId: Id<"documentFolders"> | null) => void;
  onClosePreview?: () => void;
  onToggleFullscreen?: () => void;
  previewFullscreen?: boolean;
  onOpenProperties?: () => void;
  fileName?: string;
  onError?: (message: string) => void;
  onVersionCommitted?: (version: number) => void;
  onCancelEditMode?: () => void;
};

export function HtmlDocumentEditorCanvas({
  documentId,
  title,
  url,
  proof,
  memberUserKey,
  vaultMutations,
  canMutate,
  versionNumber = 0,
  className,
  breadcrumbs,
  onBreadcrumbSelect,
  onClosePreview,
  onToggleFullscreen,
  previewFullscreen = false,
  onOpenProperties,
  fileName,
  onError,
  onVersionCommitted,
  onCancelEditMode,
}: HtmlDocumentEditorCanvasProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDirty(false);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
        const html = await res.text();
        const body = extractHtmlDocumentBody(html);
        if (!cancelled && editorRef.current) {
          editorRef.current.innerHTML = body;
        }
      } catch (e) {
        if (!cancelled) {
          onError?.(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, documentId, onError]);

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canMutate || !editorRef.current || saving) return;
    const bodyHtml = editorRef.current.innerHTML.trim();
    if (!bodyHtml) {
      onError?.("Document body cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const file = htmlDocumentToVaultFile(title, bodyHtml);
      const { version } = await uploadNewVersionToVault({
        file,
        documentId,
        proof,
        memberUserKey,
        generateUploadUrl: vaultMutations.generateUploadUrl,
        commitDocumentVersion: vaultMutations.commitDocumentVersion,
      });
      setDirty(false);
      onVersionCommitted?.(version);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    canMutate,
    documentId,
    memberUserKey,
    onError,
    onVersionCommitted,
    proof,
    saving,
    title,
    vaultMutations.commitDocumentVersion,
    vaultMutations.generateUploadUrl,
  ]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        className,
      )}
      data-testid="document-vault-html-editor-canvas"
    >
      <DocumentManipulationToolbar
        versionNumber={versionNumber}
        pageIndex={0}
        pageCount={0}
        busy={saving}
        annotationMode="view"
        mergeCandidates={[]}
        canMutate={canMutate}
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
        onOpenProperties={onOpenProperties}
        fileName={fileName}
        canEnterEditMode={false}
        onCancelEditMode={onCancelEditMode}
      />

      <div
        className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border/70 bg-dlc-surface-high/95 px-3 py-2"
        data-testid="document-vault-html-editor-toolbar"
      >
        <ToolbarButton label="Bold" onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => exec("underline")}>
          <Underline className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton label="Heading 1" onClick={() => exec("formatBlock", "h1")}>
          <Heading1 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Heading 2" onClick={() => exec("formatBlock", "h2")}>
          <Heading2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          <List className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton label="Align left" onClick={() => exec("justifyLeft")}>
          <AlignLeft className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Align center" onClick={() => exec("justifyCenter")}>
          <AlignCenter className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Align right" onClick={() => exec("justifyRight")}>
          <AlignRight className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
              Unsaved changes
            </span>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={!canMutate || saving || loading}
            data-testid="document-vault-html-editor-save"
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save
          </Button>
          {onCancelEditMode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Exit editor"
              onClick={onCancelEditMode}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-200/80 dark:bg-slate-900/80">
        {loading ? (
          <div className="flex h-full min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            Loading editor…
          </div>
        ) : (
          <div className="mx-auto my-4 w-full max-w-[210mm] rounded-dlc-sm border border-slate-200 bg-white px-8 py-6 shadow-dlc-3 dark:border-slate-700">
            <div
              ref={editorRef}
              contentEditable={canMutate && !saving}
              suppressContentEditableWarning
              onInput={() => setDirty(true)}
              className={cn(
                "min-h-[480px] w-full outline-none focus:outline-none",
                "prose prose-sm max-w-none text-foreground focus:outline-none",
                "[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold",
                "[&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2",
                "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
                saving && "pointer-events-none opacity-70",
              )}
              data-testid="document-vault-html-editor-body"
              aria-label="Document body editor"
            />
          </div>
        )}
      </div>
    </div>
  );
}
