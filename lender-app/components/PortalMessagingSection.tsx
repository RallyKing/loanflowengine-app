"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { MessageSquare, Paperclip, Send } from "lucide-react";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { cn } from "@/lib/utils";

const MAX_ATT_BYTES = 25 * 1024 * 1024;

function validateAtt(file: File): string | null {
  if (!file || file.size <= 0) return "File is empty.";
  if (file.size > MAX_ATT_BYTES)
    return `Max ${Math.round(MAX_ATT_BYTES / (1024 * 1024))} MB per file.`;
  return null;
}

export function PortalMessagingSection({
  sessionToken,
  fileId,
}: {
  sessionToken: string;
  fileId: Id<"pipeline">;
}) {
  const [openRoot, setOpenRoot] = useState<Id<"fileMessages"> | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickAttachmentId, setPickAttachmentId] =
    useState<Id<"fileMessageAttachments"> | null>(null);

  const roots = useQuery(api.clientPortal.listPortalThreadRoots, {
    sessionToken,
    fileId,
    limit: 40,
  });

  const thread = useQuery(
    api.clientPortal.listPortalThreadMessages,
    openRoot
      ? { sessionToken, fileId, threadRootId: openRoot }
      : "skip",
  );

  const post = useMutation(api.clientPortal.postPortalMessage);
  const genUp = useMutation(api.clientPortal.generatePortalMessageUploadUrl);
  const attachUp = useMutation(api.clientPortal.attachPortalMessageUpload);

  const attUrl = useQuery(
    api.clientPortal.getPortalMessageAttachmentUrl,
    pickAttachmentId
      ? { sessionToken, fileId, attachmentId: pickAttachmentId }
      : "skip",
  );

  const uploadFilesToMessage = useCallback(
    async (messageId: Id<"fileMessages">) => {
      for (const file of pendingFiles) {
        const v = validateAtt(file);
        if (v) throw new Error(v);
        const url = await genUp({ sessionToken, fileId, messageId });
        const { storageId } = await postFileToConvexUploadUrl(url, file);
        await attachUp({
          sessionToken,
          fileId,
          messageId,
          storageId: storageId as Id<"_storage">,
          fileName: file.name,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
    },
    [pendingFiles, genUp, attachUp, sessionToken, fileId],
  );

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) {
      setErr("Write a message or attach a file.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (openRoot) {
        if (!text) {
          setErr("Add a message to your reply.");
          setBusy(false);
          return;
        }
        const lastId =
          thread && thread.length > 0
            ? thread[thread.length - 1]!.message._id
            : openRoot;
        const { messageId } = await post({
          sessionToken,
          fileId,
          body: text,
          parentMessageId: lastId,
        });
        await uploadFilesToMessage(messageId);
      } else {
        if (!text) {
          setErr("Start the conversation with a message.");
          setBusy(false);
          return;
        }
        const { messageId } = await post({
          sessionToken,
          fileId,
          body: text,
        });
        await uploadFilesToMessage(messageId);
      }
      setDraft("");
      setPendingFiles([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }, [
    draft,
    pendingFiles,
    openRoot,
    thread,
    post,
    sessionToken,
    fileId,
    uploadFilesToMessage,
  ]);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
        Messages with your team
      </h2>
      <p className="text-xs text-muted-foreground">
        Replies are threaded. Your loan team sees this conversation in their
        workspace. Attachments: up to 25 MB each.
      </p>

      {openRoot ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-card/40 p-3">
          <div className="flex justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Conversation
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpenRoot(null)}
            >
              ← All topics
            </button>
          </div>
          {!thread ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {thread.map((row) => (
                <li
                  key={row.message._id}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    row.message.authorKind === "team"
                      ? "border-border/80 bg-muted/30"
                      : "border-sky-200/60 bg-sky-50/30 dark:border-sky-900/40 dark:bg-sky-950/20",
                  )}
                >
                  <div className="flex flex-wrap justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {row.message.authorLabel ?? "Participant"}
                    </span>
                    <span>
                      {new Date(row.message.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{row.message.body}</p>
                  {row.attachments.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {row.attachments.map((a) => (
                        <li key={a._id}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-border/70 px-2 py-1 text-[11px] text-primary hover:underline"
                            onClick={() => setPickAttachmentId(a._id)}
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
          {pickAttachmentId &&
          attUrl?.status === "ok" &&
          attUrl.url ? (
            <a
              href={attUrl.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-medium text-primary underline"
            >
              Open selected file
            </a>
          ) : null}
        </div>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {!roots?.length ? (
            <li className="text-sm text-muted-foreground">No messages yet.</li>
          ) : (
            roots.map((r) => (
              <li key={r.message._id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-left text-sm hover:bg-muted/25"
                  onClick={() => setOpenRoot(r.message._id)}
                >
                  <div className="text-[11px] text-muted-foreground">
                    {r.replyCount > 0
                      ? `${r.replyCount} repl${r.replyCount === 1 ? "y" : "ies"}`
                      : "Start here"}
                    {r.attachmentCount > 0
                      ? ` · ${r.attachmentCount} attachment(s)`
                      : ""}{" "}
                    · {new Date(r.message.createdAt).toLocaleDateString()}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs">
                    {r.message.body}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder={
            openRoot ? "Reply to this conversation…" : "Start a new topic…"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={8000}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Attach files
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files;
              if (!f?.length) return;
              setPendingFiles(Array.from(f));
              e.target.value = "";
            }}
          />
        </label>
        {pendingFiles.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {pendingFiles.length} file(s) will upload after send.
          </p>
        ) : null}
        {err ? (
          <p className="text-xs text-destructive" role="alert">
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
          {busy ? "Sending…" : openRoot ? "Send reply" : "Send message"}
        </Button>
      </div>
    </section>
  );
}
