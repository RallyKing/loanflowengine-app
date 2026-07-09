"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";

type SubjectKind = Doc<"collaborationThreads">["subjectKind"];

export function ThreadPanel(props: {
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  subjectKind: SubjectKind;
  pipelineFileId?: Id<"pipeline">;
  taskId?: Id<"tasks">;
  lenderId?: Id<"lenders">;
  libraryDocumentId?: Id<"libraryDocuments">;
  internalNoteKey?: string;
  className?: string;
}) {
  const [activeThreadId, setActiveThreadId] = useState<Id<"collaborationThreads"> | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const tabVisible = useDocumentTabVisible();

  const threadsArgs = useMemo(
    () => {
      if (!tabVisible) return "skip" as const;
      return {
        organizationId: props.organizationId,
        memberUserKey: props.memberUserKey,
        subjectKind: props.subjectKind,
        pipelineFileId: props.pipelineFileId,
        taskId: props.taskId,
        lenderId: props.lenderId,
        libraryDocumentId: props.libraryDocumentId,
        internalNoteKey: props.internalNoteKey,
      };
    },
    [
      tabVisible,
      props.organizationId,
      props.memberUserKey,
      props.subjectKind,
      props.pipelineFileId,
      props.taskId,
      props.lenderId,
      props.libraryDocumentId,
      props.internalNoteKey,
    ],
  );

  useConvexSubMountTrace("ThreadPanel");
  useConvexSubQueryArgsTrace("ThreadPanel:threads", threadsArgs, {
    queryKey: "comments.listThreadsForSubject",
    route: "file",
  });
  const threads = useQuery(api.comments.listThreadsForSubject, threadsArgs);

  const threadId =
    activeThreadId ?? (threads?.length ? threads[0]!._id : null);

  const commentsArgs = useMemo(():
    | { threadId: Id<"collaborationThreads">; memberUserKey?: string }
    | "skip" => {
    if (!tabVisible || !threadId) return "skip";
    return { threadId, memberUserKey: props.memberUserKey };
  }, [tabVisible, threadId, props.memberUserKey]);

  const comments = useQuery(api.comments.listCommentsForThread, commentsArgs);

  const createThread = useMutation(api.comments.createThread);
  const addComment = useMutation(api.comments.addComment);
  const resolveThr = useMutation(api.comments.resolveThread);

  const grouped = useMemo(() => {
    if (!comments) return [];
    return comments;
  }, [comments]);

  async function ensureThread(): Promise<Id<"collaborationThreads"> | null> {
    if (threadId) return threadId;
    const id = await createThread({
      memberUserKey: props.memberUserKey,
      organizationId: props.organizationId,
      subjectKind: props.subjectKind,
      title: "Discussion",
      pipelineFileId: props.pipelineFileId,
      taskId: props.taskId,
      lenderId: props.lenderId,
      libraryDocumentId: props.libraryDocumentId,
      internalNoteKey: props.internalNoteKey,
    });
    setActiveThreadId(id);
    return id;
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-dlc-md border border-border bg-dlc-surface-low",
        props.className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Threads
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={async () => {
            const id = await createThread({
              memberUserKey: props.memberUserKey,
              organizationId: props.organizationId,
              subjectKind: props.subjectKind,
              title: `Thread ${(threads?.length ?? 0) + 1}`,
              pipelineFileId: props.pipelineFileId,
              taskId: props.taskId,
              lenderId: props.lenderId,
              libraryDocumentId: props.libraryDocumentId,
              internalNoteKey: props.internalNoteKey,
            });
            setActiveThreadId(id);
          }}
        >
          New
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {threads && threads.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {threads.map((t) => (
              <button
                key={t._id}
                type="button"
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  t._id === threadId
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-muted/20",
                )}
                onClick={() => setActiveThreadId(t._id)}
              >
                {t.title ?? "Thread"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-background/50 p-2 text-sm">
          {grouped.map((c) => (
            <div key={c._id} className="rounded-md bg-muted/15 px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">
                {c.authorUserKey}
              </div>
              <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
            </div>
          ))}
          {!grouped.length ? (
            <p className="text-center text-xs text-muted-foreground">
              No comments yet.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <textarea
            className="min-h-[4.5rem] w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Comment (use @userKey to mention)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const tid = await ensureThread();
                if (!tid || !draft.trim()) return;
                await addComment({
                  memberUserKey: props.memberUserKey,
                  organizationId: props.organizationId,
                  threadId: tid,
                  body: draft,
                  audience: "internal",
                });
                setDraft("");
              }}
            >
              Post
            </Button>
            {threadId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  resolveThr({
                    memberUserKey: props.memberUserKey,
                    threadId,
                  })
                }
              >
                Resolve
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
