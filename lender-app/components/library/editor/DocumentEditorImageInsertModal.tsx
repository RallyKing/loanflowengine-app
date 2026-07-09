"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { validateDocumentEditorImageFile } from "@/lib/uploadToConvexStorage";

const ACCEPTED_IMAGE_TYPES =
  "image/png,image/jpeg,image/webp,image/gif";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DocumentEditorImageInsertModalProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  uploadImage?: (file: File) => Promise<string>;
};

export function DocumentEditorImageInsertModal({
  open,
  onClose,
  onInsert,
  uploadImage,
}: DocumentEditorImageInsertModalProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const resetLocalState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setValidationError(null);
    setUploadError(null);
    setUploading(false);
    setDragActive(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    resetLocalState();
    onClose();
  }, [onClose, resetLocalState, uploading]);

  useEffect(() => {
    if (!open) {
      resetLocalState();
    }
  }, [open, resetLocalState]);

  const applyFile = useCallback((file: File | null) => {
    setUploadError(null);
    setValidationError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const err = validateDocumentEditorImageFile(file);
    if (err) {
      setSelectedFile(null);
      setValidationError(err);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const onBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      applyFile(file);
      e.target.value = "";
    },
    [applyFile],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      applyFile(file);
    },
    [applyFile],
  );

  const handleInsert = useCallback(async () => {
    if (!selectedFile || !uploadImage || uploading) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadImage(selectedFile);
      if (!url?.trim()) {
        throw new Error("Upload succeeded but no image URL was returned.");
      }
      onInsert(url.trim());
      resetLocalState();
      onClose();
    } catch (caught) {
      setUploadError(
        caught instanceof Error ? caught.message : "Upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }, [
    onClose,
    onInsert,
    resetLocalState,
    selectedFile,
    uploadImage,
    uploading,
  ]);

  const uploadDisabled = !uploadImage || uploading;

  return (
    <OverlayShell
      open={open}
      onClose={handleClose}
      layer="COMMAND_PALETTE"
      panelClassName={cn(
        "mx-4 flex w-full max-w-md flex-col overflow-hidden p-0 md:max-w-lg",
        "max-h-[min(85dvh,640px)] rounded-2xl border border-gray-100 shadow-2xl",
        "dark:border-gray-800",
      )}
      aria-labelledby="document-editor-image-insert-title"
      data-testid="document-editor-image-insert-modal"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
        <h2
          id="document-editor-image-insert-title"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Insert image
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Close image insert"
          disabled={uploading}
          onClick={handleClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!uploadImage ? (
          <p className="text-sm text-muted-foreground">
            Sign in with vault access to upload images into this document.
          </p>
        ) : selectedFile && previewUrl ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`Preview of ${selectedFile.name}`}
                className="mx-auto max-h-48 w-full object-contain"
              />
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/30">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedFile.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
                {selectedFile.type ? ` · ${selectedFile.type}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 w-full"
              disabled={uploading}
              onClick={() => applyFile(null)}
            >
              Choose a different image
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl border-2 border-dashed p-8 text-center transition-all duration-dlc-short ease-dlc-standard",
              dragActive
                ? "border-blue-500 bg-blue-500/5"
                : "border-gray-200 hover:border-blue-500 dark:border-gray-700",
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            data-testid="document-editor-image-dropzone"
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              disabled={uploadDisabled}
              onChange={onInputChange}
            />
            <Upload
              className="mx-auto h-8 w-8 text-muted-foreground"
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              Drag and drop an image here
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PNG, JPEG, WebP, or GIF — up to 15 MB
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 min-h-10"
              disabled={uploadDisabled}
              onClick={onBrowse}
            >
              <ImageIcon className="mr-2 h-4 w-4" aria-hidden />
              Browse files
            </Button>
          </div>
        )}

        {validationError ? (
          <p
            className="mt-3 text-sm text-destructive"
            role="alert"
            data-testid="document-editor-image-validation-error"
          >
            {validationError}
          </p>
        ) : null}
        {uploadError ? (
          <p
            className="mt-3 text-sm text-destructive"
            role="alert"
            data-testid="document-editor-image-upload-error"
          >
            {uploadError}
          </p>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10"
          disabled={uploading}
          onClick={handleClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="min-h-10"
          data-testid="document-editor-image-insert-submit"
          disabled={!selectedFile || !uploadImage || uploading}
          onClick={() => void handleInsert()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Insert image
        </Button>
      </footer>
    </OverlayShell>
  );
}
