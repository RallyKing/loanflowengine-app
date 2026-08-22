"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Download, Loader2, Paperclip, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  MAX_FILE_TASK_CLIENT_TEMPLATES,
  type FileTaskClientTemplateAttachment,
} from "@/lib/fileTaskClientTemplates";
import {
  postFileToConvexUploadUrl,
  validateTaskAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import { cn } from "@/lib/cn";

type UploadRow = {
  clientId: string;
  fileName: string;
  status: "uploading" | "failed";
  errorMessage?: string;
};

export type FileTaskClientTemplateAttachProps = {
  /**
   * Vault file context — uses `documentVaultFileTasks.generateUploadUrl`.
   * Provide this OR `organizationId` (not both required; pipeline wins if both).
   */
  pipelineFileId?: Id<"pipeline">;
  /**
   * Org Manage Templates context — uses `documentTaskTemplates.generateUploadUrl`.
   */
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  value: FileTaskClientTemplateAttachment[];
  onChange: (next: FileTaskClientTemplateAttachment[]) => void;
  disabled?: boolean;
  className?: string;
};

function newClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function FileTaskClientTemplateAttach({
  pipelineFileId,
  organizationId,
  memberUserKey,
  value,
  onChange,
  disabled,
  className,
}: FileTaskClientTemplateAttachProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const generatePipelineUploadUrl = useMutation(
    api.documentVaultFileTasks.generateUploadUrl,
  );
  const generateOrgUploadUrl = useMutation(
    api.documentTaskTemplates.generateUploadUrl,
  );

  const anyUploading = uploads.some((s) => s.status === "uploading");
  const atCap = value.length >= MAX_FILE_TASK_CLIENT_TEMPLATES;
  const canUpload = Boolean(
    memberUserKey && (pipelineFileId || organizationId),
  );

  const removeAt = (storageId: string) => {
    onChange(value.filter((a) => a.storageId !== storageId));
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0 || !memberUserKey) return;
    if (!pipelineFileId && !organizationId) return;

    let nextValue = [...value];
    for (const file of list) {
      if (nextValue.length >= MAX_FILE_TASK_CLIENT_TEMPLATES) break;
      const clientId = newClientId();
      const mimeType = file.type?.trim() || "application/octet-stream";
      setUploads((prev) => [
        ...prev,
        { clientId, fileName: file.name, status: "uploading" },
      ]);

      const validationError = validateTaskAttachmentFile(file);
      if (validationError) {
        setUploads((prev) =>
          prev.map((s) =>
            s.clientId === clientId
              ? { ...s, status: "failed", errorMessage: validationError }
              : s,
          ),
        );
        continue;
      }

      try {
        const postUrl = pipelineFileId
          ? await generatePipelineUploadUrl({
              pipelineFileId,
              memberUserKey,
            })
          : await generateOrgUploadUrl({
              organizationId: organizationId!,
              memberUserKey,
            });
        const { storageId } = await postFileToConvexUploadUrl(postUrl, file, {
          validateFile: validateTaskAttachmentFile,
        });
        nextValue = [
          ...nextValue,
          {
            storageId,
            fileName: file.name,
            mimeType,
            size: file.size,
          },
        ].slice(0, MAX_FILE_TASK_CLIENT_TEMPLATES);
        onChange(nextValue);
        setUploads((prev) => prev.filter((s) => s.clientId !== clientId));
      } catch (e) {
        setUploads((prev) =>
          prev.map((s) =>
            s.clientId === clientId
              ? {
                  ...s,
                  status: "failed",
                  errorMessage:
                    e instanceof Error ? e.message : "Upload failed.",
                }
              : s,
          ),
        );
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="file-task-client-templates"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Client template
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Optional file(s) the client can download while completing this
            request (max {MAX_FILE_TASK_CLIENT_TEMPLATES}).
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            multiple
            disabled={disabled || anyUploading || atCap || !canUpload}
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || anyUploading || atCap || !canUpload}
            onClick={() => inputRef.current?.click()}
            data-testid="file-task-attach-template"
          >
            {anyUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
            )}
            Attach
          </Button>
        </div>
      </div>

      {value.length > 0 || uploads.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((row) => (
            <li
              key={row.storageId}
              className="flex items-center gap-2 rounded-dlc-md border border-border/60 bg-background px-2.5 py-1.5 text-xs"
            >
              <Paperclip
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {row.fileName}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-dlc-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${row.fileName}`}
                disabled={disabled}
                onClick={() => removeAt(row.storageId)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
          {uploads.map((row) => (
            <li
              key={row.clientId}
              className="flex items-center gap-2 rounded-dlc-md border border-border/60 bg-background px-2.5 py-1.5 text-xs"
            >
              <Paperclip
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {row.fileName}
              </span>
              {row.status === "uploading" ? (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <span className="shrink-0 text-[10px] text-red-600">
                  {row.errorMessage ?? "Failed"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FileTaskClientTemplateDownloads({
  templates,
  className,
}: {
  templates: Array<{
    fileName: string;
    url: string;
    mimeType?: string;
    size?: number;
  }>;
  className?: string;
}) {
  if (templates.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-3 rounded-dlc-md border border-border/60 bg-muted/10 px-3 py-2.5",
        className,
      )}
      data-testid="client-portal-task-templates"
    >
      <p className="text-[11px] font-semibold text-foreground">
        Download template{templates.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {templates.map((t) => (
          <li key={`${t.fileName}-${t.url}`}>
            <a
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              download={t.fileName}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.fileName}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
