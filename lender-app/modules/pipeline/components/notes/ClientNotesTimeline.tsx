"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import {
  NoteCard,
  type NoteCardActionHandlers,
} from "@/components/pipeline/notes/NoteThread";
import { useClientPipelineNotes } from "@/hooks/useClientPipelineNotes";
import { deletePipelineNoteConfirm } from "@/lib/ui/confirmDestructive";
import type { ClientPipelineFileNoteView } from "@/lib/pipeline/pipelineFileNotesTypes";

export type ClientNotesTimelineProps = {
  pipelineFileIds: Id<"pipeline">[];
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  enabled: boolean;
};

function formatSourceFileLabel(note: ClientPipelineFileNoteView): string {
  return note.fileTitle.trim() || note.fileName.trim() || "Untitled file";
}

export function ClientNotesTimeline({
  pipelineFileIds,
  organizationId,
  memberUserKey,
  enabled,
}: ClientNotesTimelineProps) {
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

  const { notes, isLoading } = useClientPipelineNotes({
    pipelineFileIds,
    organizationId,
    memberUserKey,
    enabled,
  });

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

  if (!enabled) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
        data-testid="pipeline-hub-client-notes-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        Loading client notes…
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <p
        className="py-3 text-sm text-muted-foreground"
        data-testid="pipeline-hub-client-notes-empty"
      >
        No notes across this client&apos;s files yet.
      </p>
    );
  }

  const handlers: NoteCardActionHandlers = {
    deletingId,
    pinningId,
    savingEditId,
    onDelete: (id) => void handleDelete(id),
    onPin: (id) => void handlePin(id),
    onUnpin: (id) => void handleUnpin(id),
    onSaveEdit: (id, content) => handleSaveEdit(id, content),
  };

  return (
    <ul
      className="space-y-4"
      data-testid="pipeline-hub-client-notes-timeline"
      data-note-count={notes.length}
    >
      {notes.map((note) => (
        <NoteCard
          key={note._id}
          note={note}
          sourceFileLabel={formatSourceFileLabel(note)}
          {...handlers}
        />
      ))}
    </ul>
  );
}
