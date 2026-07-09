"use client";

import { useCallback, useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MAX_TASK_ATTACHMENT_BYTES } from "@/lib/uploadToConvexStorage";
import type { VaultUploadProgress } from "@/lib/library/uploadFileToVault";

export type UploadAndOrganizeZoneProps = {
  title: string;
  onTitleChange: (value: string) => void;
  disabled?: boolean;
  busy: boolean;
  progress: VaultUploadProgress | null;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  className?: string;
};

function progressLabel(progress: VaultUploadProgress | null): string {
  if (!progress) return "Uploading…";
  if (progress.fileCount > 1) {
    return `${progress.message ?? progress.phase} (${progress.fileIndex}/${progress.fileCount})`;
  }
  return progress.message ?? progress.phase;
}

/** Compact vault ingestion — toolbar trigger + upload queue strip (no dashed drop box). */
export function UploadAndOrganizeZone({
  disabled = false,
  busy,
  progress,
  onFilesSelected,
  className,
}: UploadAndOrganizeZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files?.length || disabled || busy) return;
      void onFilesSelected(Array.from(files));
    },
    [busy, disabled, onFilesSelected],
  );

  if (!busy) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-dlc-sm border border-primary/25 bg-primary/5 px-3 py-1.5",
        className,
      )}
      data-testid="document-vault-upload-queue"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {progressLabel(progress)}
        </p>
        {progress ? (
          <div
            className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-dlc-standard ease-dlc-standard"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        ) : null}
      </div>
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
  );
}

export type VaultUploadTriggerButtonProps = {
  disabled?: boolean;
  busy?: boolean;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  className?: string;
};

export function VaultUploadTriggerButton({
  disabled = false,
  busy = false,
  onFilesSelected,
  className,
}: VaultUploadTriggerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files?.length || disabled || busy) return;
      void onFilesSelected(Array.from(files));
    },
    [busy, disabled, onFilesSelected],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 shrink-0 gap-1.5 border-0 text-xs font-semibold text-white shadow-dlc-1",
          "bg-[#1B4332] hover:bg-[#2D6A4F] focus-visible:ring-[#1B4332]/50",
          "disabled:opacity-60",
          className,
        )}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        data-testid="document-vault-upload-trigger"
        title={`Upload files (max ${Math.round(MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024))} MB each)`}
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        Upload
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
