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
      className="mt-2 flex flex-wrap gap-1.5"
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
                "inline-flex max-w-[16rem] items-center gap-1 rounded-full",
                "border border-border/80 bg-muted/30 px-2.5 py-1",
                "text-[11px] font-medium text-foreground no-underline",
                "transition-colors hover:bg-muted/60",
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
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground"
              title="File unavailable"
            >
              <FileIcon className="h-3 w-3" aria-hidden />
              {att.fileName}
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
              "inline-flex max-w-[18rem] items-center gap-1 rounded-full",
              "border border-border/80 bg-muted/30 px-2.5 py-1",
              "text-[11px] font-medium text-foreground no-underline",
              "transition-colors hover:bg-muted/60",
            )}
            title={link.url}
          >
            <span aria-hidden>🔗</span>
            <span className="truncate">{link.displayLabel}</span>
          </a>
        </li>
      ))}
    </ul>
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
        "border-b border-border/50 pb-4 last:border-0 last:pb-0",
        note.isPinned && "rounded-dlc-md border-l-4 border-amber-500 pl-3",
      )}
      data-testid={`pipeline-note-row-${note._id}`}
      data-pinned={note.isPinned ? "true" : "false"}
    >
      {note.isPinned ? (
        <div
          className="mb-2 rounded-dlc-sm border border-amber-500/30 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid={`pipeline-note-pinned-banner-${note._id}`}
        >
          Pinned note
        </div>
      ) : null}

      {note.noteKind === "attempt" ? (
        <div
          className="mb-2 inline-flex max-w-full items-center gap-1 rounded-dlc-sm border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-950 dark:text-amber-100"
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
          className="mb-2 inline-flex max-w-full items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
          data-testid={`pipeline-note-source-file-${note._id}`}
        >
          <span className="truncate" title={sourceFileLabel}>
            {sourceFileLabel}
          </span>
        </p>
      ) : null}

      <header className="mb-1.5 flex items-start gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          aria-hidden
        >
          {authorInitials(note.authorDisplayName || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className="text-sm font-medium text-foreground max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate"
                data-testid="note-author-display-name"
              >
                {note.authorDisplayName || "Unknown"}
              </p>
              <time
                className="text-[11px] text-muted-foreground"
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
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
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
          className="space-y-2"
          data-testid={`pipeline-note-edit-form-${note._id}`}
        >
          <InlineFieldSync loading={busy}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={busy}
              aria-label="Edit note body"
              className={cn(OP_INLINE_TEXTAREA_CLASS, "resize-y")}
              data-testid={`pipeline-note-edit-textarea-${note._id}`}
            />
          </InlineFieldSync>
          {editError ? (
            <p className="text-xs text-destructive" role="alert">
              {editError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
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
              disabled={busy}
              onClick={cancelEdit}
              data-testid={`pipeline-note-edit-cancel-${note._id}`}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : note.content ? (
        <p className="whitespace-pre-wrap text-sm text-foreground/90">
          {note.content}
        </p>
      ) : null}

      <NoteAttachments note={note} />
    </li>
  );
}

function NoteListSection({
  title,
  notes,
  sectionTestId,
  ...handlers
}: {
  title: string;
  notes: PipelineFileNoteView[];
  sectionTestId: string;
} & NoteCardActionHandlers) {
  if (notes.length === 0) return null;

  return (
    <section className="space-y-3" data-testid={sectionTestId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-4">
        {notes.map((note) => (
          <NoteCard key={note._id} note={note} {...handlers} />
        ))}
      </ul>
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
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        Loading notes…
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No notes yet. Post the first entry with optional attachments or links.
      </p>
    );
  }

  return (
    <div
      className="space-y-6"
      data-testid="pipeline-file-notes-thread"
      data-note-count={notes.length}
      data-pinned-count={pinnedNotes.length}
    >
      <NoteListSection
        title="Pinned Notes"
        notes={pinnedNotes}
        sectionTestId="pipeline-notes-section-pinned"
        {...handlers}
      />
      {unpinnedNotes.length > 0 ? (
        <NoteListSection
          title="All Notes"
          notes={unpinnedNotes}
          sectionTestId="pipeline-notes-section-all"
          {...handlers}
        />
      ) : null}
    </div>
  );
}

export function NoteThread(props: NoteThreadProps) {
  return (
    <div className={OP_WORKSPACE_ISLAND}>
      <NoteThreadInner {...props} />
    </div>
  );
}
