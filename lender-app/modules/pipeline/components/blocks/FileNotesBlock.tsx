"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import { NoteComposer } from "@/components/pipeline/notes/NoteComposer";
import { NoteThread } from "@/components/pipeline/notes/NoteThread";

export type FileNotesBlockProps = {
  /**
   * Resolved per-instance settings (`fileDrawerLayout.settings.fileNotes`),
   * merged with registry defaults.
   */
  blockSettings?: Readonly<Record<string, unknown>>;
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
};

/**
 * Canonical pipeline file notes UI.
 * Pins, URL links, and file attachments via `pipelineFileNotes` + `pipelineFileNoteLinks`.
 * Scrolls with pipeline file `[data-pipeline-workspace-scroll]` — no nested route scrollport.
 */
export function FileNotesBlock({
  blockSettings,
  pipelineFileId,
  organizationId,
  memberUserKey,
}: FileNotesBlockProps) {
  const rowsFromSettings =
    typeof blockSettings?.rows === "number" &&
    Number.isFinite(blockSettings.rows) &&
    blockSettings.rows >= 1
      ? Math.min(24, Math.floor(blockSettings.rows))
      : 2;

  return (
    <div
      data-testid="pipeline-file-notes-block"
      data-phase="24.7"
      className="space-y-2.5"
    >
      <div className="space-y-1">
        <FieldLabel>New note</FieldLabel>
        <NoteComposer
          pipelineFileId={pipelineFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          rows={rowsFromSettings}
        />
      </div>

      <div className="space-y-1">
        <FieldLabel>History</FieldLabel>
        <NoteThread
          pipelineFileId={pipelineFileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
        />
      </div>
    </div>
  );
}
