import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Single row from `pipelineFileNotes.getNotesByFileId` (Convex-inferred). */
export type PipelineFileNoteQueryRow = FunctionReturnType<
  typeof api.pipelineFileNotes.getNotesByFileId
>[number];

/** Single row from `pipelineFileNotes.getNotesByPipelineFileIds` (Convex-inferred). */
export type ClientPipelineFileNoteQueryRow = FunctionReturnType<
  typeof api.pipelineFileNotes.getNotesByPipelineFileIds
>[number];

export type PipelineFileNoteLinkView = {
  _id: Id<"pipelineFileNoteLinks">;
  url: string;
  /** Stored as `title` in Convex; exposed as `label` for UI/API clarity. */
  label?: string;
  displayLabel: string;
};

export type PipelineFileNoteAttachmentView = {
  storageId: Id<"_storage">;
  fileName: string;
  mimeType: string;
  size: number;
  url: string | null;
};

/** Normalized note row for UI — always has `links` and boolean `isPinned`. */
export type PipelineFileNoteView = {
  _id: Id<"pipelineFileNotes">;
  _creationTime: number;
  content: string;
  authorUserKey: string;
  authorDisplayName: string;
  attachments: PipelineFileNoteAttachmentView[];
  links: PipelineFileNoteLinkView[];
  isPinned: boolean;
  pinnedAt?: number;
  canDelete: boolean;
  canPin: boolean;
  /** Phase 30.2 — org owner/admin may edit note body text. */
  canEditContent: boolean;
  noteKind: "standard" | "attempt";
  linkedTaskId?: Id<"tasks">;
  /** Task title at attempt time (attempt notes only). */
  taskName?: string;
  attemptNumber?: number;
};

/** Merged client-hub note row — includes originating file metadata (Phase 28.2). */
export type ClientPipelineFileNoteView = PipelineFileNoteView & {
  pipelineFileId: Id<"pipeline">;
  fileName: string;
  fileTitle: string;
};

export type PipelineFileNoteLinkInput = {
  url: string;
  title?: string;
};
