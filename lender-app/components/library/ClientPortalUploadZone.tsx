"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { cn } from "@/lib/cn";

export type ClientPortalUploadZoneProps = {
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string | null;
  onFiles: (files: File[]) => Promise<void>;
  successMessage?: string | null;
  onResetSuccess?: () => void;
};

export function ClientPortalUploadZone({
  disabled = false,
  busy = false,
  busyLabel,
  onFiles,
  successMessage,
  onResetSuccess,
}: ClientPortalUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.size > 0);
      if (list.length === 0 || disabled || busy) return;
      setError(null);
      try {
        await onFiles(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    },
    [busy, disabled, onFiles],
  );

  const statusLabel = busy
    ? busyLabel?.trim() || "Uploading…"
    : "Tap to choose files or drag and drop";

  return (
    <div>
      {successMessage ? (
        <div
          className="mb-3 flex flex-col items-center rounded-dlc-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-center"
          data-testid="client-portal-upload-success"
        >
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
          <p className="mt-2 text-sm font-medium text-emerald-900">
            {successMessage}
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            You can keep adding more files below.
          </p>
          {onResetSuccess ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
              onClick={onResetSuccess}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-[12rem] cursor-pointer flex-col items-center justify-center rounded-dlc-lg border-2 border-dashed px-4 py-8 text-center transition-colors duration-dlc-standard ease-dlc-standard",
          dragOver
            ? "border-emerald-600 bg-emerald-50/80"
            : "border-neutral-300 bg-neutral-50/50 hover:border-emerald-500/60",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        data-testid="client-portal-upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          multiple
          accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          disabled={disabled || busy}
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          className="sr-only"
          accept="image/*"
          capture="environment"
          disabled={disabled || busy}
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          {busy ? (
            <FileText className="h-6 w-6 animate-pulse" aria-hidden />
          ) : (
            <Upload className="h-6 w-6" aria-hidden />
          )}
        </div>
        <p className="mt-4 text-sm font-medium text-neutral-900">{statusLabel}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Select multiple files at once · max 25 MB each
        </p>
        {!busy ? (
          <button
            type="button"
            className="mt-3 rounded-dlc-sm border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
            onClick={(e) => {
              e.stopPropagation();
              cameraRef.current?.click();
            }}
          >
            Take photo
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-center text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
