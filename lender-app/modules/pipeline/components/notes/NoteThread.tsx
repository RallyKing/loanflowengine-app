"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import {
  FileIcon,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineFieldSync } from "@/components/inline/InlineFieldSync";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { deletePipelineNoteConfirm } from "@/lib/ui/confirmDestructive";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";
import {
  OP_INLINE_TEXTAREA_CLASS,
  OP_WORKSPACE_ISLAND,
} from "@/lib/ui/operationalInputs";
import { usePipelineFileNotes } from "@/hooks/usePipelineFileNotes";
import {
  NOTE_HISTORY_INITIAL_VISIBLE,
  noteBodyNeedsPreview,
  truncateNoteBodyPreview,
} from "@/lib/pipeline/noteBodyPreview";
import { noteLinkDisplayLabel } from "@/lib/pipeline/noteLinkUrl";
import type { PipelineFileNoteView } from "@/lib/pipeline/pipelineFileNotesTypes";
import { formatTaskAttemptNoteLabel } from "@/lib/pipeline/taskAttemptNoteLabel";

export type NoteThreadProps = {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
};

const NOTE_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function authorInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  const one = parts[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}

function AttachmentKindIcon({
  mimeType,
  fileName,
}: {
  mimeType: string;
  fileName: string;
}) {
  const kind = guessAttachmentKind(mimeType, fileName);
  const cls = "h-3 w-3 shrink-0 opacity-70";
  if (kind === "image") return <ImageIcon className={cls} aria-hidden />;
  if (kind === "pdf" || kind === "text") {
    return <FileText className={cls} aria-hidden />;
  }
  return <FileIcon className={cls} aria-hidden />;
}

function NoteAttachments({ note }: { note: PipelineFileNoteView }) {
  const attachments = note.attachments ?? [];
  const links = note.links ?? [];
  const hasFiles = attachments.length > 0;
  const hasLinks = links.length > 0;
  if (!hasFiles && !hasLinks) return null;

  return (
    <ul
      className="mt-1.5 flex flex-wrap gap-1"
      data-testid={`pipeline-note-attachments-${note._id}`}
    >
      {attachments.map((att) => (
        <li key={String(att.storageId)}>
          {att.url ? (
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-8 max-w-[14rem] items-center gap-1 rounded-dlc-sm",
                "border border-border/80 bg-muted/30 px-2",
                "text-[11px] font-medium text-foreground no-underline",
                "transition-colors duration-dlc-fast ease-dlc-standard hover:bg-muted/60",
              )}
            >
              <AttachmentKindIcon
                mimeType={att.mimeType}
                fileName={att.fileName}
              />
              <span className="truncate" title={att.fileName}>
                {att.fileName}
              </span>
            </a>
          ) : (
            <span
              className="inline-flex h-8 items-center gap-1 rounded-dlc-sm border border-dashed border-border px-2 text-[11px] text-muted-foreground"
              title="File unavailable"
            >
              <FileIcon className="h-3 w-3" aria-hidden />
              <span className="truncate max-w-[12rem]">{att.fileName}</span>
            </span>
          )}
        </li>
      ))}
      {links.map((link) => (
        <li key={String(link._id)}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`pipeline-note-link-${link._id}`}
            className={cn(
              "inline-flex h-8 max-w-[16rem] items-center gap-1 rounded-dlc-sm",
              "border border-border/80 bg-muted/30 px-2",
              "text-[11px] font-medium text-foreground no-underline",
              "transition-colors duration-dlc-fast ease-dlc-standard hover:bg-muted/60",
            )}
            title={link.url}
          >
            <span aria-hidden>🔗</span>
            <span className="truncate min-w-0">
              {noteLinkDisplayLabel(link.label ?? link.displayLabel, link.url)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function NoteBodyPreview({
  noteId,
  content,
}: {
  noteId: Id<"pipelineFileNotes">;
  content: string;
}) {
  const needsPreview = noteBodyNeedsPreview(content);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [content]);

  if (!needsPreview) {
    return (
      <p
        className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90 [overflow-wrap:anywhere]"
        data-testid={`pipeline-note-body-${noteId}`}
      >
        {content}
      </p>
    );
  }

  const shown = expanded ? content : truncateNoteBodyPreview(content);

  return (
    <div data-testid={`pipeline-note-body-${noteId}`}>
      <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90 [overflow-wrap:anywhere]">
        {shown}
      </p>
      <button
        type="button"
        className={cn(
          "mt-1 inline-flex h-10 min-h-10 items-center text-xs font-semibold text-primary",
          "underline-offset-2 hover:underline",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-dlc-sm",
        )}
        aria-expanded={expanded}
        data-testid={`pipeline-note-body-toggle-${noteId}`}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

export type NoteCardActionHandlers = {
  deletingId: Id<"pipelineFileNotes"> | null;
  pinningId: Id<"pipelineFileNotes"> | null;
  savingEditId: Id<"pipelineFileNotes"> | null;
  onDelete: (id: Id<"pipelineFileNotes">) => void;
  onPin: (id: Id<"pipelineFileNotes">) => void;
  onUnpin: (id: Id<"pipelineFileNotes">) => void;
  onSaveEdit: (id: Id<"pipelineFileNotes">, content: string) => void | Promise<void>;
};

export type NoteCardProps = NoteCardActionHandlers & {
  note: PipelineFileNoteView;
  /** Phase 28.2 — originating file label on client-merged timelines. */
  sourceFileLabel?: string;
};

export function NoteCard({
  note,
  deletingId,
  pinningId,
  savingEditId,
  onDelete,
  onPin,
  onUnpin,
  onSaveEdit,
  sourceFileLabel,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(note.content);
    }
  }, [note.content, isEditing]);

  const showMenu =
    !isEditing && (note.canPin || note.canDelete || note.canEditContent);
  const busy =
    deletingId === note._id ||
    pinningId === note._id ||
    savingEditId === note._id;
  const hasAttachmentsOrLinks =
    (note.attachments?.length ?? 0) > 0 || (note.links?.length ?? 0) > 0;
  const canSaveDraft =
    draft.trim().length > 0 || hasAttachmentsOrLinks;

  const startEdit = () => {
    setEditError(null);
    setDraft(note.content);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditError(null);
    setDraft(note.content);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!canSaveDraft) {
      setEditError("Note must include text, an attachment, or a link");
      return;
    }
    setEditError(null);
    try {
      await onSaveEdit(note._id, draft.trim());
      setIsEditing(false);
    } catch (caught) {
      setEditError(
        caught instanceof Error ? caught.message : "Could not save note",
      );
    }
  };

  return (
    <li
      className={cn(
        "border-b border-border/40 pb-2.5 last:border-0 last:pb-0",
        note.isPinned && "rounded-dlc-sm border-l-[3px] border-amber-500 pl-2.5",
      )}
      data-testid={`pipeline-note-row-${note._id}`}
      data-pinned={note.isPinned ? "true" : "false"}
    >
      {note.isPinned ? (
        <div
          className="mb-1 inline-flex items-center gap-1 rounded-dlc-sm border border-amber-500/30 bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid={`pipeline-note-pinned-banner-${note._id}`}
        >
          <Pin className="h-3 w-3 shrink-0" aria-hidden />
          Pinned
        </div>
      ) : null}

      {note.noteKind === "attempt" ? (
        <div
          className="mb-1 inline-flex max-w-full items-center gap-1 rounded-dlc-sm border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-950 dark:text-amber-100"
          data-testid={`pipeline-note-attempt-banner-${note._id}`}
          title={formatTaskAttemptNoteLabel(
            note.attemptNumber,
            note.taskName,
          )}
        >
          <span className="truncate">
            {formatTaskAttemptNoteLabel(note.attemptNumber, note.taskName)}
          </span>
        </div>
      ) : null}

      {sourceFileLabel ? (
        <p
          className="mb-1 inline-flex max-w-full items-center rounded-dlc-sm border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
          data-testid={`pipeline-note-source-file-${note._id}`}
        >
          <span className="truncate" title={sourceFileLabel}>
            {sourceFileLabel}
          </span>
        </p>
      ) : null}

      <header className="mb-1 flex items-start gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          aria-hidden
        >
          {authorInitials(note.authorDisplayName || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <p
                className="text-sm font-medium leading-tight text-foreground max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate"
                data-testid="note-author-display-name"
              >
                {note.authorDisplayName || "Unknown"}
              </p>
              <time
                className="text-[11px] leading-tight text-muted-foreground"
                dateTime={new Date(note._creationTime).toISOString()}
              >
                {NOTE_TIME_FMT.format(new Date(note._creationTime))}
              </time>
            </div>
            {showMenu ? (
              <DropdownMenu
                aria-label="Note actions"
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 shrink-0 p-0 text-muted-foreground"
                    disabled={busy}
                    aria-label="Note actions"
                  >
                    {busy ? (
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                }
              >
                {note.canPin ? (
                  note.isPinned ? (
                    <DropdownMenuItem onClick={() => onUnpin(note._id)}>
                      <PinOff className="h-4 w-4 shrink-0" aria-hidden />
                      Unpin note
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onPin(note._id)}>
                      <Pin className="h-4 w-4 shrink-0" aria-hidden />
                      Pin note
                    </DropdownMenuItem>
                  )
                ) : null}
                {note.canEditContent ? (
                  <DropdownMenuItem
                    onClick={startEdit}
                    data-testid={`pipeline-note-edit-${note._id}`}
                  >
                    <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                    Edit note
                  </DropdownMenuItem>
                ) : null}
                {note.canDelete ? (
                  <>
                    {note.canPin || note.canEditContent ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(note._id)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                      Delete note
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>

      {isEditing ? (
        <div
          className="space-y-1.5"
          data-testid={`pipeline-note-edit-form-${note._id}`}
        >
          <InlineFieldSync loading={busy}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={busy}
              aria-label="Edit note body"
              className={cn(
                OP_INLINE_TEXTAREA_CLASS,
                "min-h-10 resize-y py-2 leading-snug",
              )}
              data-testid={`pipeline-note-edit-textarea-${note._id}`}
            />
          </InlineFieldSync>
          {editError ? (
            <p className="text-xs text-destructive" role="alert">
              {editError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-10 min-h-10"
              disabled={busy || !canSaveDraft}
              onClick={() => void saveEdit()}
              data-testid={`pipeline-note-edit-save-${note._id}`}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 min-h-10"
              disabled={busy}
              onClick={cancelEdit}
              data-testid={`pipeline-note-edit-cancel-${note._id}`}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : note.content ? (
        <NoteBodyPreview noteId={note._id} content={note.content} />
      ) : null}

      <NoteAttachments note={note} />
    </li>
  );
}

function NoteListSection({
  title,
  notes,
  sectionTestId,
  initialVisible,
  ...handlers
}: {
  title: string;
  notes: PipelineFileNoteView[];
  sectionTestId: string;
  /** When set, show this many newest notes first + reveal remaining. */
  initialVisible?: number;
} & NoteCardActionHandlers) {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  if (notes.length === 0) return null;

  const limit =
    typeof initialVisible === "number" && initialVisible > 0
      ? initialVisible
      : notes.length;
  const hasMore = notes.length > limit;
  const visibleNotes =
    hasMore && !historyExpanded ? notes.slice(0, limit) : notes;
  const remaining = notes.length - limit;

  return (
    <section className="space-y-1.5" data-testid={sectionTestId}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-2.5">
        {visibleNotes.map((note) => (
          <NoteCard key={note._id} note={note} {...handlers} />
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          className={cn(
            "inline-flex h-10 min-h-10 w-full items-center justify-center",
            "rounded-dlc-sm text-xs font-semibold text-primary",
            "underline-offset-2 hover:underline hover:bg-primary/5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            "transition-colors duration-dlc-fast ease-dlc-standard",
          )}
          aria-expanded={historyExpanded}
          data-testid={`${sectionTestId}-history-toggle`}
          onClick={() => setHistoryExpanded((v) => !v)}
        >
          {historyExpanded
            ? "Show less"
            : `Show remaining ${remaining} note${remaining === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </section>
  );
}

function NoteThreadInner({
  pipelineFileId,
  organizationId,
  memberUserKey,
}: NoteThreadProps) {
  const { confirm } = useOperationalConfirm();
  const deleteNote = useMutation(api.pipelineFileNotes.deleteNote);
  const pinNote = useMutation(api.pipelineFileNotes.pinNote);
  const unpinNote = useMutation(api.pipelineFileNotes.unpinNote);
  const updateNoteContent = useMutation(api.pipelineFileNotes.updateNoteContent);
  const [deletingId, setDeletingId] = useState<Id<"pipelineFileNotes"> | null>(
    null,
  );
  const [pinningId, setPinningId] = useState<Id<"pipelineFileNotes"> | null>(
    null,
  );
  const [savingEditId, setSavingEditId] = useState<Id<"pipelineFileNotes"> | null>(
    null,
  );

  const { notes, pinnedNotes, unpinnedNotes, isLoading } = usePipelineFileNotes(
    {
      pipelineFileId,
      organizationId,
      memberUserKey,
    },
  );

  const handleDelete = useCallback(
    async (noteId: Id<"pipelineFileNotes">) => {
      const ok = await confirm({
        ...deletePipelineNoteConfirm(),
        onConfirm: async () => {
          setDeletingId(noteId);
          try {
            await deleteNote({
              noteId,
              organizationId,
              memberUserKey,
            });
          } finally {
            setDeletingId(null);
          }
        },
      });
      if (!ok) return;
    },
    [confirm, deleteNote, memberUserKey, organizationId],
  );

  const handlePin = useCallback(
    async (noteId: Id<"pipelineFileNotes">) => {
      setPinningId(noteId);
      try {
        await pinNote({ noteId, organizationId, memberUserKey });
      } finally {
        setPinningId(null);
      }
    },
    [memberUserKey, organizationId, pinNote],
  );

  const handleUnpin = useCallback(
    async (noteId: Id<"pipelineFileNotes">) => {
      setPinningId(noteId);
      try {
        await unpinNote({ noteId, organizationId, memberUserKey });
      } finally {
        setPinningId(null);
      }
    },
    [memberUserKey, organizationId, unpinNote],
  );

  const handleSaveEdit = useCallback(
    async (noteId: Id<"pipelineFileNotes">, content: string) => {
      setSavingEditId(noteId);
      try {
        await updateNoteContent({
          noteId,
          content,
          organizationId,
          memberUserKey,
        });
      } finally {
        setSavingEditId(null);
      }
    },
    [memberUserKey, organizationId, updateNoteContent],
  );

  const handlers: NoteCardActionHandlers = {
    deletingId,
    pinningId,
    savingEditId,
    onDelete: (id) => void handleDelete(id),
    onPin: (id) => void handlePin(id),
    onUnpin: (id) => void handleUnpin(id),
    onSaveEdit: (id, content) => handleSaveEdit(id, content),
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        Loading notes…
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="py-1.5 text-sm text-muted-foreground">
        No notes yet — post the first entry below.
      </p>
    );
  }

  return (
    <div
      className="space-y-3"
      data-testid="pipeline-file-notes-thread"
      data-note-count={notes.length}
      data-pinned-count={pinnedNotes.length}
    >
      <NoteListSection
        title="Pinned"
        notes={pinnedNotes}
        sectionTestId="pipeline-notes-section-pinned"
        {...handlers}
      />
      {unpinnedNotes.length > 0 ? (
        <NoteListSection
          title="All notes"
          notes={unpinnedNotes}
          sectionTestId="pipeline-notes-section-all"
          initialVisible={NOTE_HISTORY_INITIAL_VISIBLE}
          {...handlers}
        />
      ) : null}
    </div>
  );
}

export function NoteThread(props: NoteThreadProps) {
  return (
    <div className={cn(OP_WORKSPACE_ISLAND, "px-3 py-2.5 sm:px-4 sm:py-3")}>
      <NoteThreadInner {...props} />
    </div>
  );
}
