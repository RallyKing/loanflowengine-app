"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, MessageSquare } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  OP_INLINE_SYNC_SPINNER,
  OP_INLINE_SYNC_TEXT,
} from "@/lib/ui/operationalFeedback";
import { InlineFieldSync } from "@/components/inline/InlineFieldSync";

export type PipelineTableNotesCellProps = {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  fileName: string;
  noteCount: number;
  canEdit: boolean;
  onOpenNotes: () => void;
};

export function PipelineTableNotesCell({
  pipelineFileId,
  organizationId,
  memberUserKey,
  fileName,
  noteCount,
  canEdit,
  onOpenNotes,
}: PipelineTableNotesCellProps) {
  const createNote = useMutation(api.pipelineFileNotes.createNote);
  const [quickDraft, setQuickDraft] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const label =
    noteCount === 0
      ? "Add note"
      : noteCount === 1
        ? "1 note"
        : `${noteCount} notes`;

  const submitQuickNote = useCallback(async () => {
    const text = quickDraft.trim();
    if (!text || quickBusy || !canEdit) return;
    setQuickError(null);
    setQuickBusy(true);
    try {
      await createNote({
        pipelineFileId,
        organizationId,
        memberUserKey,
        content: text,
        attachments: [],
      });
      setQuickDraft("");
    } catch (caught) {
      setQuickError(
        caught instanceof Error ? caught.message : "Could not save note",
      );
    } finally {
      setQuickBusy(false);
    }
  }, [
    canEdit,
    createNote,
    memberUserKey,
    organizationId,
    pipelineFileId,
    quickBusy,
    quickDraft,
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-full min-w-0 justify-start gap-1.5 px-2 text-left font-normal",
          "text-muted-foreground hover:text-foreground",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onOpenNotes();
        }}
        aria-label={`${label} for ${fileName}. Opens file notes.`}
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{label}</span>
      </Button>

      {canEdit ? (
        <InlineFieldSync loading={quickBusy}>
          <input
            type="text"
            value={quickDraft}
            disabled={quickBusy}
            placeholder="Quick note…"
            aria-label={`Quick note for ${fileName}`}
            className={cn(
              "h-8 w-full min-w-0 rounded-dlc-sm border border-border/40 bg-background px-2 text-xs",
              "placeholder:text-muted-foreground/55",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQuickDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitQuickNote();
              }
            }}
          />
          {quickBusy ? (
            <span className="mt-0.5 flex items-center gap-1">
              <Loader2 className={OP_INLINE_SYNC_SPINNER} aria-hidden />
              <span className={OP_INLINE_SYNC_TEXT}>Saving…</span>
            </span>
          ) : null}
        </InlineFieldSync>
      ) : null}

      {quickError ? (
        <p className="text-[10px] text-destructive" role="alert">
          {quickError}
        </p>
      ) : null}
    </div>
  );
}
