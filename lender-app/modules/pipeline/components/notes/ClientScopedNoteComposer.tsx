"use client";

import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ClientHubFileOption } from "@/lib/pipeline/collectClientHubFileOptions";
import { NoteComposer } from "@/components/pipeline/notes/NoteComposer";

export type ClientScopedNoteComposerProps = {
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  fileOptions: ClientHubFileOption[];
};

export function ClientScopedNoteComposer({
  organizationId,
  memberUserKey,
  fileOptions,
}: ClientScopedNoteComposerProps) {
  const [selectedFileId, setSelectedFileId] = useState<string>("");

  const selectedOption = useMemo(
    () => fileOptions.find((o) => String(o.fileId) === selectedFileId),
    [fileOptions, selectedFileId],
  );

  if (fileOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No loan files under this client yet. Add a file before posting notes.
      </p>
    );
  }

  return (
    <div
      className="space-y-3"
      data-testid="pipeline-hub-client-notes-composer"
    >
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Destination file
        </span>
        <select
          className="h-10 w-full rounded-dlc-md border border-border bg-background px-2 text-sm"
          value={selectedFileId}
          onChange={(e) => setSelectedFileId(e.target.value)}
          aria-label="Select file for new note"
          data-testid="pipeline-hub-client-notes-file-select"
        >
          <option value="">Select a file…</option>
          {fileOptions.map((opt) => (
            <option key={String(opt.fileId)} value={String(opt.fileId)}>
              {opt.fileTitle} — {opt.projectTitle}
            </option>
          ))}
        </select>
      </label>

      {selectedOption ? (
        <NoteComposer
          pipelineFileId={selectedOption.fileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          rows={3}
        />
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          Choose a destination file to compose a note.
        </p>
      )}
    </div>
  );
}
