"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePipelineFileOrgQueryArgs } from "@/lib/convex/useStableConvexArgs";
import { normalizePipelineFileNotes } from "@/lib/pipeline/normalizePipelineFileNotes";
import type { PipelineFileNoteView } from "@/lib/pipeline/pipelineFileNotesTypes";

export type UsePipelineFileNotesArgs = {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
};

export type UsePipelineFileNotesResult = {
  notes: PipelineFileNoteView[];
  pinnedNotes: PipelineFileNoteView[];
  unpinnedNotes: PipelineFileNoteView[];
  isLoading: boolean;
  /** Raw Convex payload (for DevTools / Phase 24.5.1 audits). */
  raw: ReturnType<typeof useQuery<typeof api.pipelineFileNotes.getNotesByFileId>>;
};

declare global {
  interface Window {
    __DLC_PIPELINE_FILE_NOTES_DEBUG__?: {
      pipelineFileId: string;
      organizationId: string;
      raw: unknown;
      normalized: PipelineFileNoteView[];
    };
  }
}

/**
 * Canonical subscription for file notes — includes pins + `pipelineFileNoteLinks`.
 */
export function usePipelineFileNotes({
  pipelineFileId,
  organizationId,
  memberUserKey,
}: UsePipelineFileNotesArgs): UsePipelineFileNotesResult {
  const queryArgs = usePipelineFileOrgQueryArgs({
    pipelineFileId,
    organizationId,
    memberUserKey,
  });
  const raw = useQuery(api.pipelineFileNotes.getNotesByFileId, queryArgs);

  const notes = useMemo(() => normalizePipelineFileNotes(raw), [raw]);

  const pinnedNotes = useMemo(
    () => notes.filter((n) => n.isPinned),
    [notes],
  );

  const unpinnedNotes = useMemo(
    () => notes.filter((n) => !n.isPinned),
    [notes],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (raw === undefined) return;
    window.__DLC_PIPELINE_FILE_NOTES_DEBUG__ = {
      pipelineFileId: String(pipelineFileId),
      organizationId: String(organizationId),
      raw,
      normalized: notes,
    };
  }, [raw, notes, organizationId, pipelineFileId]);

  return {
    notes,
    pinnedNotes,
    unpinnedNotes,
    isLoading: raw === undefined,
    raw,
  };
}
