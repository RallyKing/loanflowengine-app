"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Eye,
  ExternalLink,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { AttachmentPreviewDialog } from "@/components/AttachmentPreviewDialog";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  uploadLocalFilesViaConvexUrl,
  validateTaskAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import {
  TASK_ATTACHMENTS_UNAVAILABLE_HINT,
  TASK_ATTACHMENTS_UNAVAILABLE_MESSAGE,
} from "@/lib/taskAttachmentsUnavailableCopy";
import { useAttachmentQueryRecovery } from "@/lib/useAttachmentQueryRecovery";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";

export type TaskFileRow = {
  _id: Id<"taskAttachments">;
  _creationTime: number;
  taskId: Id<"tasks">;
  fileName: string;
  contentType: string | undefined;
  size: number | undefined;
  label: string | undefined;
  createdAt: number;
  url: string | null;
};

function TaskAttachmentsPanelDegraded({
  actionTitle,
}: {
  actionTitle: (hint: string) => string;
}) {
  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="flex items-center gap-2 normal-case">
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          Files &amp; attachments
        </span>
      }
      description="Upload any file type. Multiple files per task or subtask are supported (each file up to the size limit below). Preview works for images, PDFs, and plain text."
    >
      <p
        className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
        role="status"
      >
        {TASK_ATTACHMENTS_UNAVAILABLE_MESSAGE}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {TASK_ATTACHMENTS_UNAVAILABLE_HINT} File uploads and edits are
        disabled until attachment queries work again.
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        Per file up to{" "}
        {Math.round(MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024))} MB.
      </p>
      <div className="mb-3 rounded-md border border-dashed border-border/80 bg-muted/10 p-3 opacity-60">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Drop files here to attach</span>
          </div>
          <div className="relative inline-flex h-8 shrink-0 sm:ml-auto">
            <input
              type="file"
              multiple
              disabled
              className="pointer-events-none absolute inset-0 z-10 w-full cursor-not-allowed opacity-0"
              aria-label="Upload files — unavailable"
              title={actionTitle("Attachments unavailable")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none relative z-0 min-w-[6.5rem]"
              disabled
            >
              Add file(s)
            </Button>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        No files are shown while attachment data cannot be loaded.
      </p>
    </CollapsibleSection>
  );
}

function TaskAttachmentsPanelInner({
  taskId,
  organizationId,
  memberUserKey,
  canUseHub,
  actionTitle,
}: {
  taskId: Id<"tasks">;
  organizationId: Id<"organizations"> | null;
  memberUserKey: string;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const { confirm } = useOperationalConfirm();
  const orgArgs =
    organizationId && memberUserKey.trim().length > 0
      ? { organizationId, memberUserKey: memberUserKey.trim() }
      : null;
  const listRaw = useQuery(
    api.tasks.listTaskFiles,
    orgArgs ? { taskId, ...orgArgs } : "skip",
  );
  /** Same Convex file-storage upload URL as lender attachments (`lenderFiles:generateUploadUrl`). */
  const generateUploadUrl = useMutation(api.lenderFiles.generateUploadUrl);
  const addFileM = useMutation(api.tasks.addTaskFile);
  const removeFileM = useMutation(api.tasks.removeTaskFile);
  const updateFileLabelM = useMutation(api.tasks.updateTaskFileLabel);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<TaskFileRow | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function formatSize(n: number | undefined) {
    if (n == null || n < 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function processFiles(raw: File[]) {
    if (!raw.length || !canUseHub || !orgArgs) return;

    setUploading(true);
    setErr(null);
    try {
      const { ok, failures, attempted } = await uploadLocalFilesViaConvexUrl({
        files: raw,
        validateFile: validateTaskAttachmentFile,
        generateUploadUrl: () => generateUploadUrl({}),
        onProgress: (current, total) =>
          setUploadProgress({ current, total }),
        commitEach: async ({ storageId, fileName, contentType, size }) => {
          await addFileM({
            taskId,
            storageId: storageId as Id<"_storage">,
            fileName,
            contentType,
            size,
            ...orgArgs,
          });
        },
      });
      if (failures.length > 0) {
        if (ok === 0) {
          setErr(
            attempted > 1
              ? `Upload failed: ${failures.join("; ")}`
              : failures[0] ?? "Upload failed"
          );
        } else {
          setErr(
            `Uploaded ${ok} of ${attempted} file(s). Not attached: ${failures.join("; ")}`
          );
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const list = input.files;
    const arr = list ? Array.from(list) : [];
    await processFiles(arr);
    input.value = "";
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!canUseHub || uploading || !orgArgs) return;
    void processFiles(Array.from(e.dataTransfer.files));
  }

  const fileRows = listRaw;

  const listTruncated =
    fileRows !== undefined && fileRows.length >= 500
      ? "Showing the 500 most recent attachments."
      : null;

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="flex items-center gap-2 normal-case">
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          Files &amp; attachments
        </span>
      }
      description="Upload any file type. Multiple files per task or subtask are supported (each file up to the size limit below). Preview works for images, PDFs, and plain text."
    >
      <AttachmentPreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        actionTitle={actionTitle}
      />
      {!canUseHub && (
        <p
          className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          Connect to Convex (wait for the live connection) to upload or remove
          files. Viewing may still work for files that already have a URL.
        </p>
      )}
      {canUseHub && !orgArgs && (
        <p
          className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          Select an organization to load or attach files for this task.
        </p>
      )}
      <p className="mb-2 text-xs text-muted-foreground">
        Per file up to{" "}
        {Math.round(MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024))} MB. There is no
        limit on how many files you can attach. Drag and drop or use Add
        file(s).
      </p>
      {listTruncated && (
        <p className="mb-2 text-xs text-amber-800 dark:text-amber-200" role="status">
          {listTruncated}
        </p>
      )}
      <div
        className={`mb-3 rounded-md border border-dashed p-3 transition-colors ${
          dragActive && canUseHub && !uploading && orgArgs
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-muted/10"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading && orgArgs) setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading && orgArgs) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={onDropFiles}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Drop files here when connected</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Drop files here to attach</span>
          </div>
          <div className="relative inline-flex h-8 shrink-0 sm:ml-auto">
            <input
              type="file"
              multiple
              disabled={!canUseHub || uploading || !orgArgs}
              onChange={onPickFile}
              className="absolute inset-0 z-10 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Upload files to this task — browse device"
              title={actionTitle("Add one or more files to this task")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none relative z-0 min-w-[6.5rem]"
              disabled={!canUseHub || uploading || !orgArgs}
            >
              {uploading
                ? uploadProgress
                  ? `Uploading ${uploadProgress.current} / ${uploadProgress.total}…`
                  : "Uploading…"
                : "Add file(s)"}
            </Button>
          </div>
        </div>
      </div>
      {err && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
      {fileRows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading attachments…</p>
      ) : fileRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached yet.</p>
      ) : (
        <ul className="space-y-3" aria-label="Attached files">
          {fileRows.map((a) => (
            <li
              key={a._id}
              className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <FileText
                className="hidden h-8 w-8 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {a.fileName}
                  </span>
                  {a.url && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setPreviewFile(a)}
                        title={actionTitle("Preview in app")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <a
                        href={a.url}
                        download={a.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-primary hover:bg-muted"
                        title={actionTitle("Open in new tab")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(a.size)}
                  {a.contentType ? ` · ${a.contentType}` : ""}
                </div>
                <div className="pt-0.5">
                  <Input
                    key={`${a._id}-label`}
                    className="h-8 text-xs"
                    placeholder="Optional label"
                    defaultValue={a.label ?? ""}
                    title={actionTitle("Short label for this file")}
                    readOnly={!canUseHub || !orgArgs}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      const cur = a.label?.trim() ?? "";
                      if (next === cur) return;
                      if (!orgArgs) return;
                      void updateFileLabelM({
                        id: a._id,
                        label: next || undefined,
                        ...orgArgs,
                      });
                    }}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 self-end text-destructive hover:bg-destructive/10"
                disabled={!canUseHub || !orgArgs}
                onClick={() => {
                  void (async () => {
                    if (!orgArgs) return;
                    const ok = await confirm(
                      unlinkConfirm(
                        a.fileName,
                        "This file is removed from this task. Other records are not affected.",
                      ),
                    );
                    if (!ok) return;
                    void removeFileM({ id: a._id, ...orgArgs });
                  })();
                }}
                title={actionTitle("Remove file")}
                aria-label={`Remove ${a.fileName}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

export function TaskAttachmentsPanel(props: {
  taskId: Id<"tasks">;
  organizationId: Id<"organizations"> | null;
  memberUserKey: string;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const { canUseHub, phase } = useLiveConnection();
  const recoverOnKeys = useAttachmentQueryRecovery(canUseHub, phase);

  return (
    <ConvexQueryBoundary
      key={props.taskId}
      silent
      recoverOnKeys={recoverOnKeys}
      fallback={<TaskAttachmentsPanelDegraded actionTitle={props.actionTitle} />}
    >
      <TaskAttachmentsPanelInner {...props} />
    </ConvexQueryBoundary>
  );
}
