"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Link2, Loader2, Paperclip, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { InlineFieldSync } from "@/components/inline/InlineFieldSync";
import { cn } from "@/lib/cn";
import type { PipelineFileNoteLinkInput } from "@/lib/pipeline/pipelineFileNotesTypes";
import {
  normalizeAndValidateNoteLinkUrl,
  noteLinkDisplayLabel,
} from "@/lib/pipeline/noteLinkUrl";
import {
  postFileToConvexUploadUrl,
  validateLenderAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import {
  OP_INLINE_SYNC_SPINNER,
  OP_INLINE_SYNC_TEXT,
} from "@/lib/ui/operationalFeedback";
import { OP_INLINE_TEXTAREA_CLASS } from "@/lib/ui/operationalInputs";
import { useResourceAccess } from "@/components/ResourceAccessProvider";

type StagedAttachment = {
  clientId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageId?: Id<"_storage">;
  status: "uploading" | "ready" | "failed";
  errorMessage?: string;
};

type StagedLink = {
  clientId: string;
  url: string;
  title: string;
};

export type NoteComposerProps = {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  rows?: number;
};

function newClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function NoteComposer({
  pipelineFileId,
  organizationId,
  memberUserKey,
  rows = 4,
}: NoteComposerProps) {
  const { readOnly } = useResourceAccess();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [stagedLinks, setStagedLinks] = useState<StagedLink[]>([]);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkFormError, setLinkFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.pipelineFileNotes.generateUploadUrl);
  const createNote = useMutation(api.pipelineFileNotes.createNote);

  const anyUploading = staged.some((s) => s.status === "uploading");
  const readyAttachments = staged.filter(
    (s): s is StagedAttachment & { storageId: Id<"_storage"> } =>
      s.status === "ready" && !!s.storageId,
  );
  const canSubmit =
    !readOnly &&
    !submitting &&
    !anyUploading &&
    (content.trim().length > 0 ||
      readyAttachments.length > 0 ||
      stagedLinks.length > 0);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setFormError(null);

      for (const file of list) {
        const clientId = newClientId();
        const mimeType = file.type?.trim() || "application/octet-stream";
        setStaged((prev) => [
          ...prev,
          {
            clientId,
            fileName: file.name,
            mimeType,
            size: file.size,
            status: "uploading",
          },
        ]);

        const validationError = validateLenderAttachmentFile(file);
        if (validationError) {
          setStaged((prev) =>
            prev.map((s) =>
              s.clientId === clientId
                ? { ...s, status: "failed", errorMessage: validationError }
                : s,
            ),
          );
          continue;
        }

        try {
          const uploadUrl = await generateUploadUrl({
            pipelineFileId,
            organizationId,
            memberUserKey,
          });
          const { storageId } = await postFileToConvexUploadUrl(uploadUrl, file);
          setStaged((prev) =>
            prev.map((s) =>
              s.clientId === clientId
                ? {
                    ...s,
                    storageId: storageId as Id<"_storage">,
                    status: "ready",
                  }
                : s,
            ),
          );
        } catch (caught) {
          const msg =
            caught instanceof Error ? caught.message : "Upload failed";
          setStaged((prev) =>
            prev.map((s) =>
              s.clientId === clientId
                ? { ...s, status: "failed", errorMessage: msg }
                : s,
            ),
          );
        }
      }
    },
    [generateUploadUrl, memberUserKey, organizationId, pipelineFileId],
  );

  const removeStaged = (clientId: string) => {
    setStaged((prev) => prev.filter((s) => s.clientId !== clientId));
  };

  const removeStagedLink = (clientId: string) => {
    setStagedLinks((prev) => prev.filter((s) => s.clientId !== clientId));
  };

  const addStagedLink = () => {
    setLinkFormError(null);
    try {
      const url = normalizeAndValidateNoteLinkUrl(linkUrl);
      setStagedLinks((prev) => [
        ...prev,
        { clientId: newClientId(), url, title: linkTitle.trim() },
      ]);
      setLinkUrl("");
      setLinkTitle("");
      setLinkFormOpen(false);
    } catch (caught) {
      setLinkFormError(
        caught instanceof Error ? caught.message : "Invalid URL",
      );
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const links: PipelineFileNoteLinkInput[] = stagedLinks.map((s) => ({
        url: s.url,
        title: s.title || undefined,
      }));

      await createNote({
        pipelineFileId,
        organizationId,
        memberUserKey,
        content: content.trim(),
        ...(readyAttachments.length > 0
          ? {
              attachments: readyAttachments.map((s) => ({
                storageId: s.storageId,
                fileName: s.fileName,
                mimeType: s.mimeType,
                size: s.size,
              })),
            }
          : {}),
        ...(links.length > 0 ? { links } : {}),
      });
      setContent("");
      setStaged([]);
      setStagedLinks([]);
      setLinkFormOpen(false);
      setLinkUrl("");
      setLinkTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Could not save note",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || anyUploading;

  return (
    <div className="space-y-2" data-testid="pipeline-file-notes-composer">
      {readOnly ? (
        <p className="text-xs text-muted-foreground" role="status">
          You have view-only access to this file. Notes, links, and attachments
          cannot be added until you have edit access.
        </p>
      ) : null}
      <InlineFieldSync loading={busy}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={rows}
          disabled={readOnly || submitting}
          placeholder="Add a note to the audit log…"
          aria-label="Note body"
          className={cn(OP_INLINE_TEXTAREA_CLASS, "resize-y")}
        />
      </InlineFieldSync>

      {staged.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attachments to add">
          {staged.map((s) => (
            <li key={s.clientId}>
              <span
                className={cn(
                  "inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  s.status === "failed"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border/80 bg-muted/40 text-foreground",
                )}
              >
                {s.status === "uploading" ? (
                  <Loader2
                    className={cn(OP_INLINE_SYNC_SPINNER, "h-3 w-3")}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate" title={s.fileName}>
                  {s.fileName}
                </span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${s.fileName}`}
                  disabled={s.status === "uploading" || submitting}
                  onClick={() => removeStaged(s.clientId)}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {stagedLinks.length > 0 ? (
        <ul
          className="flex flex-wrap gap-1.5"
          aria-label="Links to add"
          data-testid="pipeline-note-staged-links"
        >
          {stagedLinks.map((s) => (
            <li key={s.clientId}>
              <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground">
                <span aria-hidden>🔗</span>
                <span className="truncate" title={s.url}>
                  {noteLinkDisplayLabel(s.title, s.url)}
                </span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Remove link"
                  disabled={submitting}
                  onClick={() => removeStagedLink(s.clientId)}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {linkFormOpen ? (
        <div
          className="space-y-2 rounded-dlc-md border border-border/80 bg-dlc-surface p-3"
          role="group"
          aria-label="Add link"
          data-testid="pipeline-note-link-form"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              URL (required)
            </span>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={readOnly || submitting}
              className={cn(
                "h-10 w-full rounded-dlc-sm border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              )}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Label (optional)
            </span>
            <input
              type="text"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Bank Portal"
              aria-label="Link label"
              disabled={readOnly || submitting}
              className={cn(
                "h-10 w-full rounded-dlc-sm border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              )}
            />
          </label>
          {linkFormError ? (
            <p className="text-xs text-destructive" role="alert">
              {linkFormError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!linkUrl.trim() || submitting}
              onClick={addStagedLink}
            >
              Add link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                setLinkFormOpen(false);
                setLinkFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {anyUploading ? (
        <p className="flex items-center gap-1.5" aria-live="polite">
          <Loader2 className={OP_INLINE_SYNC_SPINNER} aria-hidden />
          <span className={OP_INLINE_SYNC_TEXT}>Uploading…</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            multiple
            className="sr-only"
            disabled={readOnly || busy}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) void uploadFiles(files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || busy}
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            aria-controls={fileInputId}
            data-testid="pipeline-note-add-file"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            Add file
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || busy || linkFormOpen}
            className="gap-1.5"
            data-testid="pipeline-note-add-link"
            onClick={() => {
              setLinkFormOpen(true);
              setLinkFormError(null);
            }}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Add link
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          data-testid="pipeline-note-post"
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Posting…" : "Post note"}
        </Button>
      </div>

      {formError ? (
        <p className="text-xs text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}
