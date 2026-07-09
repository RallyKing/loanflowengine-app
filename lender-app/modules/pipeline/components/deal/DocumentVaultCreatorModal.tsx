"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FilePlus2,
  FileText,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Table2,
  Underline,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSubtitle,
} from "@/components/RecordInspectorShell";
import { DocumentEditorImageInsertModal } from "@/components/library/editor/DocumentEditorImageInsertModal";
import { cn } from "@/lib/cn";
import {
  DOCUMENT_CREATOR_MOCK_TEMPLATES,
  DEFAULT_DOCUMENT_CREATOR_TOKENS,
  applyDocumentCreatorTokens,
  buildDocumentEditorImageInsertHtml,
  type DocumentCreatorStep,
  type DocumentCreatorTemplateSource,
  type DocumentCreatorTokenContext,
  resolveDocumentCreatorTokenContext,
} from "@/lib/pipeline/documentVaultCreator";

export type DocumentVaultCreatorSavePayload = {
  title: string;
  html: string;
  attachments: File[];
};

export type DocumentVaultCreatorModalProps = {
  open: boolean;
  onClose: () => void;
  tokenContext?: DocumentCreatorTokenContext;
  savedTemplates?: DocumentCreatorTemplateSource[];
  onSaveDocument?: (
    payload: DocumentVaultCreatorSavePayload,
  ) => void | Promise<void>;
  onSaveTemplate?: (
    payload: DocumentVaultCreatorSavePayload,
  ) => void | Promise<void>;
  /** Upload inline editor images to Convex storage and return a renderable URL. */
  uploadEditorImage?: (file: File) => Promise<string>;
};

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

export function DocumentVaultCreatorModal({
  open,
  onClose,
  tokenContext,
  savedTemplates = [],
  onSaveDocument,
  onSaveTemplate,
  uploadEditorImage,
}: DocumentVaultCreatorModalProps) {
  const { confirm } = useOperationalConfirm();
  const [step, setStep] = useState<DocumentCreatorStep>("select");
  const [documentTitle, setDocumentTitle] = useState("Untitled document");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [savingMode, setSavingMode] = useState<"document" | "template" | null>(
    null,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [imageInsertOpen, setImageInsertOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const initialEditorHtmlRef = useRef("");
  const resolvedTokens = resolveDocumentCreatorTokenContext(tokenContext);

  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  const templateOptions = useMemo((): DocumentCreatorTemplateSource[] => {
    const builtin: DocumentCreatorTemplateSource[] =
      DOCUMENT_CREATOR_MOCK_TEMPLATES.map((t) => ({ ...t, source: "builtin" }));
    const saved = savedTemplates.map((t) => ({ ...t, source: "saved" as const }));
    return [...saved, ...builtin];
  }, [savedTemplates]);

  const resetState = useCallback(() => {
    setStep("select");
    setDocumentTitle("Untitled document");
    setAttachments([]);
    setSavingMode(null);
    setSelectedTemplateId(null);
    setImageInsertOpen(false);
    setDirty(false);
    savedSelectionRef.current = null;
    initialEditorHtmlRef.current = "";
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  }, []);

  const requestClose = useCallback(async () => {
    if (savingMode) return;
    if (imageInsertOpen) {
      setImageInsertOpen(false);
      return;
    }
    if (dirty && step === "editor") {
      const confirmed = await confirm({
        variant: "delete",
        title: "Discard draft?",
        entityName: documentTitle.trim() || "Untitled document",
        impact: "Unsaved document changes will be lost.",
        confirmLabel: "Discard",
        testId: "document-vault-creator-discard-confirm",
      });
      if (!confirmed) return;
    }
    resetState();
    onClose();
  }, [
    confirm,
    dirty,
    documentTitle,
    imageInsertOpen,
    onClose,
    resetState,
    savingMode,
    step,
  ]);

  const consumeEscape = useCallback(() => {
    if (imageInsertOpen) {
      setImageInsertOpen(false);
      return true;
    }
    return false;
  }, [imageInsertOpen]);

  const handleClose = useCallback(() => {
    void requestClose();
  }, [requestClose]);

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const focusEditorAtEnd = useCallback(() => {
    const el = editorRef.current;
    if (!el || savingMode !== null) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }, [savingMode]);

  const handleCanvasShellMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (savingMode !== null) return;
      if (event.target === event.currentTarget) {
        event.preventDefault();
        focusEditorAtEnd();
      }
    },
    [focusEditorAtEnd, savingMode],
  );

  const exec = useCallback(
    (command: string, value?: string) => {
      focusEditor();
      document.execCommand(command, false, value);
      markDirty();
    },
    [focusEditor, markDirty],
  );

  const insertHtml = useCallback(
    (html: string) => {
      focusEditor();
      document.execCommand("insertHTML", false, html);
      markDirty();
    },
    [focusEditor, markDirty],
  );

  const saveEditorSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      savedSelectionRef.current = null;
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      savedSelectionRef.current = null;
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = null;
      return;
    }
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const restoreSelectionAndInsertHtml = useCallback(
    (html: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const range = savedSelectionRef.current;
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand("insertHTML", false, html);
      savedSelectionRef.current = null;
    },
    [],
  );

  const insertToken = useCallback(
    (token: string) => {
      insertHtml(
        `<span class="rounded bg-primary/10 px-1 font-mono text-[11px] text-primary" contenteditable="false">${token}</span>&nbsp;`,
      );
    },
    [insertHtml],
  );

  const openEditor = useCallback(
    (title: string, html: string, hydrateTokens = false) => {
      const initialHtml = hydrateTokens
        ? applyDocumentCreatorTokens(html, tokenContext)
        : html;
      setDocumentTitle(title);
      setStep("editor");
      setDirty(false);
      initialEditorHtmlRef.current = initialHtml;
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = initialHtml;
          editorRef.current.focus();
        }
      });
    },
    [tokenContext],
  );

  const onSelectBlank = useCallback(() => {
    openEditor("Untitled document", "<p></p>", false);
  }, [openEditor]);

  const selectedTemplate = useMemo(
    () => templateOptions.find((t) => t.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templateOptions],
  );

  const onSelectTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
  }, []);

  const onUseSelectedTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    openEditor(selectedTemplate.title, selectedTemplate.bodyHtml, true);
  }, [openEditor, selectedTemplate]);

  const onInsertTable = useCallback(() => {
    insertHtml(
      `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:8px 0"><tr><td>Label</td><td>Value</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table>`,
    );
  }, [insertHtml]);

  const onInsertImage = useCallback(() => {
    saveEditorSelection();
    setImageInsertOpen(true);
  }, [saveEditorSelection]);

  const onInsertUploadedImage = useCallback(
    (url: string) => {
      try {
        restoreSelectionAndInsertHtml(buildDocumentEditorImageInsertHtml(url));
        markDirty();
      } catch (caught) {
        console.error(caught);
      }
    },
    [markDirty, restoreSelectionAndInsertHtml],
  );

  const onAttachmentDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files ?? []);
      if (!files.length) return;
      setAttachments((prev) => [...prev, ...files]);
      markDirty();
    },
    [markDirty],
  );

  const onAttachmentPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      setAttachments((prev) => [...prev, ...files]);
      markDirty();
      e.target.value = "";
    },
    [markDirty],
  );

  const buildPayload = useCallback((): DocumentVaultCreatorSavePayload => {
    const html = editorRef.current?.innerHTML ?? "";
    return {
      title: documentTitle.trim() || "Untitled document",
      html,
      attachments,
    };
  }, [attachments, documentTitle]);

  const handleSaveDocument = useCallback(async () => {
    if (!onSaveDocument || savingMode) return;
    const payload = buildPayload();
    setSavingMode("document");
    try {
      await onSaveDocument(payload);
      resetState();
      onClose();
    } catch {
      // Parent surfaces errors via toast / vault err banner.
    } finally {
      setSavingMode(null);
    }
  }, [buildPayload, onClose, onSaveDocument, resetState, savingMode]);

  const handleSaveTemplate = useCallback(async () => {
    if (!onSaveTemplate || savingMode) return;
    const payload = buildPayload();
    setSavingMode("template");
    try {
      await onSaveTemplate(payload);
      resetState();
      onClose();
    } catch {
      // Parent surfaces errors.
    } finally {
      setSavingMode(null);
    }
  }, [buildPayload, onClose, onSaveTemplate, resetState, savingMode]);

  const saving = savingMode !== null;

  if (!open) return null;

  return (
    <>
      <RecordInspectorShell
        onClose={() => void requestClose()}
        consumeEscape={consumeEscape}
        resizable
        recordKind="document"
        ariaLabel={
          step === "select" ? "Create document" : "Document editor"
        }
        panelClassName="md:max-w-none"
      >
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="document-vault-creator-modal"
        >
          <RecordInspectorHeader id="document-vault-creator-title">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">
                  {step === "select" ? "Create document" : "Document editor"}
                </h2>
                <RecordInspectorSubtitle>
                  {step === "select"
                    ? "Start blank or from a template — workspace stays visible behind this panel."
                    : "Rich text with deal tokens and attachments"}
                </RecordInspectorSubtitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                aria-label="Close creator"
                disabled={saving}
                onClick={handleClose}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </RecordInspectorHeader>

          {step === "select" ? (
            <RecordInspectorBody>
              <div data-testid="document-vault-creator-select-step">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <button
                type="button"
                className={cn(
                  "group flex min-h-[10rem] flex-col items-start justify-between rounded-dlc-md border-2 border-primary/30 bg-dlc-surface-high p-5 text-left",
                  "shadow-dlc-2 transition-shadow duration-dlc-short ease-dlc-standard hover:border-primary hover:shadow-dlc-3",
                )}
                data-testid="document-vault-creator-blank"
                onClick={onSelectBlank}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-dlc-md bg-primary/10 text-primary">
                  <FilePlus2 className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-base font-semibold text-foreground">
                    Blank document
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Start with an empty A4 canvas and build from scratch.
                  </span>
                </span>
              </button>

              <div className="min-w-0 rounded-dlc-md border border-border/70 bg-dlc-surface-high/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Create from template
                </h3>
                <ul className="mt-3 max-h-[14rem] space-y-2 overflow-y-auto">
                  {templateOptions.map((template) => {
                    const isSelected = selectedTemplateId === template.id;
                    return (
                    <li key={`${template.source}-${template.id}`}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 rounded-dlc-md border px-3 py-3 text-left transition-colors duration-dlc-short ease-dlc-standard",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-dlc-1"
                            : "border-border/60 bg-white hover:border-primary/40 hover:bg-primary/5 dark:bg-slate-800",
                        )}
                        data-testid={`document-vault-creator-template-${template.id}`}
                        onClick={() => onSelectTemplate(template.id)}
                        aria-pressed={isSelected}
                      >
                        <FileText
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="block text-sm font-semibold text-foreground">
                              {template.title}
                            </span>
                            {template.source === "saved" ? (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                Saved
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {template.description}
                          </span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>

                {selectedTemplate ? (
                  <div
                    className="mt-4 rounded-dlc-md border border-primary/25 bg-primary/5 p-4"
                    data-testid="document-vault-creator-template-preview"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Template preview
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {selectedTemplate.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {selectedTemplate.description}
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="mt-4 min-h-10 w-full sm:w-auto"
                      data-testid="document-vault-creator-use-template"
                      onClick={onUseSelectedTemplate}
                    >
                      Use This Template
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Select a template above to preview and load it in the editor.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-dlc-md border border-dashed border-border/70 bg-muted/15 px-4 py-3">
              <p className="text-xs font-medium text-foreground">
                Available deal tokens (live preview)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEFAULT_DOCUMENT_CREATOR_TOKENS.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full border border-border/70 bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {t.token}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Current values: {resolvedTokens.borrower_name} ·{" "}
                {resolvedTokens.loan_amount} · {resolvedTokens.file_name}
              </p>
            </div>
              </div>
            </RecordInspectorBody>
          ) : (
            <>
              <div
                className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/70 bg-dlc-surface-high/95 px-3 py-2 sm:px-4"
                data-testid="document-vault-creator-toolbar"
              >
              <div className="flex flex-wrap items-center gap-0.5">
                <ToolbarButton label="Bold" onClick={() => exec("bold")}>
                  <Bold className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Italic" onClick={() => exec("italic")}>
                  <Italic className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Underline"
                  onClick={() => exec("underline")}
                >
                  <Underline className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <ToolbarButton
                  label="Heading 1"
                  onClick={() => exec("formatBlock", "h1")}
                >
                  <Heading1 className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Heading 2"
                  onClick={() => exec("formatBlock", "h2")}
                >
                  <Heading2 className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <ToolbarButton
                  label="Bulleted list"
                  onClick={() => exec("insertUnorderedList")}
                >
                  <List className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Numbered list"
                  onClick={() => exec("insertOrderedList")}
                >
                  <ListOrdered className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Insert table" onClick={onInsertTable}>
                  <Table2 className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Insert image" onClick={onInsertImage}>
                  <ImageIcon className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <ToolbarButton
                  label="Align left"
                  onClick={() => exec("justifyLeft")}
                >
                  <AlignLeft className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Align center"
                  onClick={() => exec("justifyCenter")}
                >
                  <AlignCenter className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Align right"
                  onClick={() => exec("justifyRight")}
                >
                  <AlignRight className="h-4 w-4" aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Justify"
                  onClick={() => exec("justifyFull")}
                >
                  <AlignJustify className="h-4 w-4" aria-hidden />
                </ToolbarButton>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <input
                  type="text"
                  value={documentTitle}
                  onChange={(e) => {
                    setDocumentTitle(e.target.value);
                    markDirty();
                  }}
                  className="h-8 min-w-[8rem] max-w-[14rem] rounded-dlc-sm border border-border bg-background px-2 text-xs font-medium text-foreground"
                  aria-label="Document title"
                  data-testid="document-vault-creator-title-input"
                  disabled={saving}
                />
                <DropdownMenu
                  aria-label="Insert deal token"
                  align="end"
                  className="min-w-[12rem]"
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      data-testid="document-vault-creator-insert-token"
                      disabled={saving}
                    >
                      Insert token
                    </Button>
                  }
                >
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Deal data tokens
                  </div>
                  <DropdownMenuSeparator />
                  {DEFAULT_DOCUMENT_CREATOR_TOKENS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitem"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => insertToken(t.token)}
                    >
                      <span className="font-medium text-foreground">
                        {t.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {t.token}
                      </span>
                    </button>
                  ))}
                </DropdownMenu>
              </div>
              </div>

              <RecordInspectorBody
                className="flex flex-col overflow-hidden bg-slate-200/80 dark:bg-slate-900/80"
              >
                <div
                  data-testid="document-vault-creator-editor-step"
                  className="flex min-h-0 flex-1 flex-col"
                >
              <div
                className="mx-auto flex min-h-0 w-full max-w-[210mm] flex-1 flex-col rounded-dlc-sm border border-slate-200 bg-white px-8 py-6 shadow-dlc-3 dark:border-slate-700"
                onMouseDown={handleCanvasShellMouseDown}
              >
                <div
                  ref={editorRef}
                  contentEditable={!saving}
                  suppressContentEditableWarning
                  onInput={markDirty}
                  onMouseDown={(event) => {
                    if (saving) return;
                    if (event.currentTarget === event.target) {
                      focusEditorAtEnd();
                    }
                  }}
                  className={cn(
                    "min-h-[400px] w-full flex-1 overflow-y-auto p-4 outline-none focus:outline-none focus:ring-0",
                    "prose prose-sm max-w-none text-foreground",
                    "[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold",
                    "[&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2",
                    "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
                    saving && "pointer-events-none opacity-70",
                  )}
                  data-testid="document-vault-creator-canvas"
                  aria-label="Document body"
                />
              </div>

              <section
                className="mx-auto mt-4 w-full max-w-[210mm] shrink-0"
                data-testid="document-vault-creator-attachments"
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Attachments
                </h3>
                <div
                  className={cn(
                    "rounded-dlc-md border-2 border-dashed border-border/80 bg-white/60 px-4 py-6 text-center dark:bg-slate-800/60",
                    "transition-colors duration-dlc-short ease-dlc-standard hover:border-primary/40 hover:bg-primary/5",
                    saving && "pointer-events-none opacity-70",
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onAttachmentDrop}
                >
                  <Paperclip
                    className="mx-auto h-5 w-5 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Drop files to bind as secondary attachments
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDFs, images, and spreadsheets upload to the vault with the
                    document.
                  </p>
                  <label className="mt-3 inline-block">
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      disabled={saving}
                      onChange={onAttachmentPick}
                    />
                    <span className="cursor-pointer text-xs font-medium text-primary underline-offset-2 hover:underline">
                      Browse files
                    </span>
                  </label>
                </div>
                {attachments.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((file, i) => (
                      <li
                        key={`${file.name}-${i}`}
                        className="flex items-center justify-between rounded-dlc-sm border border-border/60 bg-white px-3 py-1.5 text-xs dark:bg-slate-800"
                      >
                        <span className="truncate font-medium text-foreground">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${file.name}`}
                          disabled={saving}
                          onClick={() => {
                            setAttachments((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            );
                            markDirty();
                          }}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
                </div>
              </RecordInspectorBody>

              <RecordInspectorFooter>
                <div
                  className="flex flex-wrap items-center justify-end gap-2"
                  data-testid="document-vault-creator-footer"
                >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                data-testid="document-vault-creator-save-template"
                disabled={saving || !onSaveTemplate}
                onClick={() => void handleSaveTemplate()}
              >
                {savingMode === "template" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Save as template
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="min-h-10"
                data-testid="document-vault-creator-save-document"
                disabled={saving || !onSaveDocument}
                onClick={() => void handleSaveDocument()}
              >
                {savingMode === "document" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Save document
              </Button>
                </div>
              </RecordInspectorFooter>
            </>
          )}
        </div>
      </RecordInspectorShell>

      <DocumentEditorImageInsertModal
        open={imageInsertOpen}
        onClose={() => setImageInsertOpen(false)}
        onInsert={onInsertUploadedImage}
        uploadImage={uploadEditorImage}
      />
    </>
  );
}
