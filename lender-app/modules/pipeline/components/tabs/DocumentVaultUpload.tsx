"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { MAX_TASK_ATTACHMENT_BYTES } from "@/lib/uploadToConvexStorage";
import type { VaultUploadProgress } from "@/lib/library/uploadFileToVault";

export type DocumentVaultUploadProps = {
  title: string;
  onTitleChange: (value: string) => void;
  disabled?: boolean;
  busy: boolean;
  progress: VaultUploadProgress | null;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  className?: string;
};

function progressLabel(progress: VaultUploadProgress | null): string {
  if (!progress) return "Upload document";
  if (progress.fileCount > 1) {
    return `${progress.message ?? progress.phase} (${progress.fileIndex}/${progress.fileCount})`;
  }
  return progress.message ?? progress.phase;
}

export function DocumentVaultUpload({
  title,
  onTitleChange,
  disabled = false,
  busy,
  progress,
  onFilesSelected,
  className,
}: DocumentVaultUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files?.length || disabled || busy) return;
      void onFilesSelected(Array.from(files));
    },
    [busy, disabled, onFilesSelected],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
        <span className="text-muted-foreground">
          Optional title for the next upload
        </span>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Tax Return 2024"
          className="h-10 text-sm"
          disabled={disabled || busy}
          data-testid="pipeline-documents-vault-title-input"
        />
      </label>

      <div
        role="button"
        tabIndex={disabled || busy ? -1 : 0}
        aria-disabled={disabled || busy}
        aria-busy={busy}
        data-testid="document-vault-upload-dropzone"
        className={cn(
          "relative flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-dlc-md border-2 border-dashed px-4 py-4 text-center transition-colors duration-dlc-standard ease-dlc-standard",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border/70 bg-background/50 hover:border-primary/40 hover:bg-muted/20",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!disabled && !busy) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled && !busy) inputRef.current?.click();
          }
        }}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">
          {busy ? progressLabel(progress) : "Drop files or click to upload"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Max {Math.round(MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024))} MB per file
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={disabled || busy}
          data-testid="pipeline-documents-vault-upload-input"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {busy && progress ? (
        <div
          className="space-y-1"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uploading ${progress.fileName}`}
          data-testid="document-vault-upload-progress"
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-dlc-standard ease-dlc-standard"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {progress.fileName} — {progressLabel(progress)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
