"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { MessageSquare, Paperclip, Send } from "lucide-react";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { cn } from "@/lib/utils";

const MAX_PORTAL_MSG_BYTES = 25 * 1024 * 1024;

type ThreadRootRow = {
  message: Doc<"fileMessages">;
  replyCount: number;
  attachmentCount: number;
};

/** Dedupe roots by id (defensive when optimistic/reconciled duplicates appear). */
function normalizeSoftRoots(roots: ThreadRootRow[] | undefined): ThreadRootRow[] {
  if (!roots?.length) return [];
  const byId = new Map<string, ThreadRootRow>();
  for (const row of roots) {
    const id = row.message._id as string;
    const prev = byId.get(id);
    if (!prev || row.message.updatedAt > prev.message.updatedAt) {
      byId.set(id, row);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.message.createdAt - a.message.createdAt,
  );
}

function validateMessageAttachment(file: File): string | null {
  if (!file || file.size <= 0) return "File is empty.";
  if (file.size > MAX_PORTAL_MSG_BYTES) {
    return `Max ${Math.round(MAX_PORTAL_MSG_BYTES / (1024 * 1024))} MB per attachment.`;
  }
  return null;
}

function previewBody(body: string): string {
  const t = body.trim();
  if (t.length <= 100) return t;
  return `${t.slice(0, 97)}…`;
}

type Audience = "internal" | "portal";

export function FileMessagingPanel({
  pipelineFileId,
  memberUserKey,
  sectionOpen,
  onSectionOpenChange,
  embedded = false,
}: {
  pipelineFileId: Id<"pipeline">;
  memberUserKey: string | undefined;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
  /** When true, renders message UI only (parent owns collapse chrome). */
  embedded?: boolean;
}) {
  const sectionControlled =
    sectionOpen !== undefined && onSectionOpenChange !== undefined;
  const [audience, setAudience] = useState<Audience>("internal");
  const [openThreadRootId, setOpenThreadRootId] =
    useState<Id<"fileMessages"> | null>(null);
  const [draft, setDraft] = useState("");
  const [contactId, setContactId] = useState<Id<"contacts"> | "">("");
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const caps = useQuery(
    api.fileMessages.getCapabilities,
    memberUserKey
      ? { pipelineFileId, memberUserKey }
      : { pipelineFileId },
  );

  const contacts = useQuery(
    api.fileMessages.listLinkedContactsForMessaging,
    memberUserKey && caps?.canRead
      ? { pipelineFileId, memberUserKey }
      : "skip",
  );

  const roots = useQuery(
    api.fileMessages.listThreadRoots,
    memberUserKey && caps?.canRead
      ? {
          pipelineFileId,
          memberUserKey,
          audience,
          limit: 40,
        }
      : "skip",
  );

  const threadMessages = useQuery(
    api.fileMessages.listThreadMessages,
    memberUserKey && openThreadRootId && caps?.canRead
      ? {
          pipelineFileId,
          memberUserKey,
          threadRootId: openThreadRootId,
        }
      : "skip",
  );

  const postRoot = useMutation(api.fileMessages.postThreadRoot);
  const postReply = useMutation(api.fileMessages.postThreadReply);
  const genUpload = useMutation(api.fileMessages.generateAttachmentUploadUrl);
  const attach = useMutation(api.fileMessages.attachUploadToMessage);

  const [downloadAttachmentId, setDownloadAttachmentId] = useState<
    Id<"fileMessageAttachments"> | null
  >(null);

  const attachmentUrl = useQuery(
    api.fileMessages.getAttachmentUrl,
    memberUserKey && downloadAttachmentId
      ? {
          pipelineFileId,
          memberUserKey,
          attachmentId: downloadAttachmentId,
        }
      : "skip",
  );

  const sendWithOptionalAttachments = useCallback(
    async (messageId: Id<"fileMessages">) => {
      if (!memberUserKey) return;
      for (const file of pendingFiles) {
        const v = validateMessageAttachment(file);
        if (v) throw new Error(v);
        const postUrl = await genUpload({
          pipelineFileId,
          memberUserKey,
          messageId,
        });
        const { storageId } = await postFileToConvexUploadUrl(postUrl, file);
        await attach({
          pipelineFileId,
          memberUserKey,
          messageId,
          storageId: storageId as Id<"_storage">,
          fileName: file.name,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
    },
    [
      memberUserKey,
      pipelineFileId,
      genUpload,
      attach,
      pendingFiles,
    ],
  );

  const submit = useCallback(async () => {
    if (!memberUserKey || !caps?.canPost) return;
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) {
      setErr("Write a message or attach a file.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (openThreadRootId) {
        if (!text) {
          setErr("Add text for your reply.");
          setBusy(false);
          return;
        }
        const parentMessageId =
          threadMessages && threadMessages.length > 0
            ? threadMessages[threadMessages.length - 1]!.message._id
            : openThreadRootId;
        const { messageId } = await postReply({
          pipelineFileId,
          memberUserKey,
          parentMessageId,
          body: text,
        });
        await sendWithOptionalAttachments(messageId);
        setDraft("");
        setPendingFiles([]);
      } else {
        if (!text) {
          setErr("Start the thread with a message.");
          setBusy(false);
          return;
        }
        const { messageId } = await postRoot({
          pipelineFileId,
          memberUserKey,
          audience,
          body: text,
          contactId: contactId || undefined,
        });
        await sendWithOptionalAttachments(messageId);
        setDraft("");
        setPendingFiles([]);
        setContactId("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }, [
    memberUserKey,
    caps?.canPost,
    draft,
    pendingFiles,
    openThreadRootId,
    threadMessages,
    postReply,
    postRoot,
    pipelineFileId,
    audience,
    contactId,
    sendWithOptionalAttachments,
  ]);

  const threadList = normalizeSoftRoots(roots);

  if (!memberUserKey) {
    return (
      <p className="px-2 text-[11px] text-muted-foreground">
        Sign in to view and send file messages.
      </p>
    );
  }

  if (caps === undefined) {
    return (
      <p className="px-2 text-[11px] text-muted-foreground">Loading messages…</p>
    );
  }

  if (caps === null || !caps.canRead) {
    return (
      <p className="px-2 text-[11px] text-muted-foreground">
        You don&apos;t have access to deal messages on this file.
      </p>
    );
  }

  const messagingBody = (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setAudience("internal");
            setOpenThreadRootId(null);
          }}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            audience === "internal"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border/80 text-muted-foreground hover:bg-muted/40",
          )}
        >
          Internal team
        </button>
        <button
          type="button"
          onClick={() => {
            setAudience("portal");
            setOpenThreadRootId(null);
          }}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            audience === "portal"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border/80 text-muted-foreground hover:bg-muted/40",
          )}
        >
          Client (portal)
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() => setOpenThreadRootId(null)}
        >
          New thread
        </Button>
      </div>

      {openThreadRootId ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border/70 bg-muted/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Thread
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpenThreadRootId(null)}
            >
              ← All threads
            </Button>
          </div>
          {!threadMessages ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-3">
              {threadMessages.map((row) => (
                <li
                  key={row.message._id}
                  className={cn(
                    "rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm",
                    row.message.authorKind === "client" && "border-sky-200/50",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-xs font-semibold">
                      {row.message.authorLabel ||
                        (row.message.authorKind === "team"
                          ? "Team"
                          : "Client")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(row.message.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {row.message.contactId ? (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Contact-tagged message
                    </p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {row.message.body}
                  </p>
                  {row.attachments.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {row.attachments.map((a) => (
                        <li key={a._id}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-2 py-1 text-[11px] text-primary hover:underline"
                            onClick={() => setDownloadAttachmentId(a._id)}
                          >
                            <Paperclip className="h-3 w-3" />
                            {a.fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {downloadAttachmentId &&
          attachmentUrl?.status === "ok" &&
          attachmentUrl.url ? (
            <p className="text-xs">
              <a
                href={attachmentUrl.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline"
              >
                Open selected attachment
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="mb-4 max-h-48 space-y-2 overflow-y-auto pr-1">
          {threadList.length === 0 ? (
            <li className="text-xs text-muted-foreground">No threads yet.</li>
          ) : (
            threadList.map((t: ThreadRootRow) => (
              <li key={t.message._id}>
                <button
                  type="button"
                  onClick={() => setOpenThreadRootId(t.message._id)}
                  className="w-full rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/25"
                >
                  <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {t.message.authorLabel ?? "—"} ·{" "}
                      {t.replyCount > 0
                        ? `${t.replyCount} repl${t.replyCount === 1 ? "y" : "ies"}`
                        : "No replies"}
                      {t.attachmentCount > 0
                        ? ` · ${t.attachmentCount} file(s)`
                        : ""}
                    </span>
                    <span>
                      {new Date(t.message.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-foreground">
                    {previewBody(t.message.body)}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {!openThreadRootId ? (
        <div className="mb-2 space-y-1">
          <label className="text-[11px] text-muted-foreground">
            Link to contact (optional)
          </label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            value={contactId}
            onChange={(e) =>
              setContactId(
                (e.target.value || "") as Id<"contacts"> | "",
              )
            }
          >
            <option value="">— None —</option>
            {(contacts ?? []).map((c) => (
              <option key={c.contactId} value={c.contactId}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!caps.canPost ? (
        <p className="text-xs text-muted-foreground">
          You have view access only. Ask an editor to grant file edit access to
          reply.
        </p>
      ) : (
        <>
          <textarea
            className="mb-2 min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder={
              openThreadRootId
                ? "Write a reply…"
                : "Start a new thread…"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={8000}
          />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              <span>Attach files</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const list = e.target.files;
                  if (!list?.length) return;
                  setPendingFiles(Array.from(list));
                  e.target.value = "";
                }}
              />
            </label>
            {pendingFiles.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {pendingFiles.length} file(s) ready
              </span>
            ) : null}
          </div>
          {err ? (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => void submit()}
          >
            <Send className="h-3.5 w-3.5" />
            {busy ? "Sending…" : openThreadRootId ? "Reply" : "Start thread"}
          </Button>
        </>
      )}
    </>
  );

  if (embedded) {
    return messagingBody;
  }

  return (
    <CollapsibleSection
      variant="card"
      animated
      lazyMount
      {...(sectionControlled
        ? { open: sectionOpen, onOpenChange: onSectionOpenChange }
        : { defaultOpen: false })}
      title={
        <span className="flex items-center gap-2 normal-case">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Deal messages
        </span>
      }
      description="Team-only threads stay internal. Client threads are visible in the borrower portal. Optionally tag a linked CRM contact."
    >
      {messagingBody}
    </CollapsibleSection>
  );
}
