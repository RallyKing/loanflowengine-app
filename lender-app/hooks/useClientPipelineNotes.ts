"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeClientPipelineFileNotes } from "@/lib/pipeline/normalizePipelineFileNotes";
import type { ClientPipelineFileNoteView } from "@/lib/pipeline/pipelineFileNotesTypes";

export type UseClientPipelineNotesArgs = {
  pipelineFileIds: Id<"pipeline">[];
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  /** When false, Convex subscription is skipped (hub accordion collapsed). */
  enabled: boolean;
};

export type UseClientPipelineNotesResult = {
  notes: ClientPipelineFileNoteView[];
  isLoading: boolean;
};

function stableFileIdList(ids: Id<"pipeline">[]): string {
  return [...ids]
    .map(String)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

export function useClientPipelineNotes({
  pipelineFileIds,
  organizationId,
  memberUserKey,
  enabled,
}: UseClientPipelineNotesArgs): UseClientPipelineNotesResult {
  const idKey = stableFileIdList(pipelineFileIds);

  const queryArgs = useMemo(() => {
    if (!enabled) return "skip" as const;
    const key = memberUserKey?.trim();
    if (!organizationId || !key) return "skip" as const;
    if (pipelineFileIds.length === 0) return "skip" as const;
    return {
      pipelineFileIds,
      organizationId,
      memberUserKey: key,
    };
  }, [enabled, organizationId, memberUserKey, idKey, pipelineFileIds]);

  const raw = useQuery(api.pipelineFileNotes.getNotesByPipelineFileIds, queryArgs);

  const notes = useMemo(
    () => normalizeClientPipelineFileNotes(raw),
    [raw],
  );

  return {
    notes,
    isLoading: enabled && raw === undefined,
  };
}
