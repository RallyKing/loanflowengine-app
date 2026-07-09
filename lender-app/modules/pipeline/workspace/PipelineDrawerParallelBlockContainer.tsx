"use client";

import { memo, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeActivePipelineBlockIdsForRender } from "@/lib/pipelineActiveBlocks";
import { getPipelineBlock } from "@/lib/pipelineBlockRegistry";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import { cn } from "@/lib/cn";
import { pipelineWorkspaceNestedChipClass } from "@/lib/pipelineWorkspaceCard";

import { PipelineWorkspaceSection } from "@/components/PipelineWorkspaceSection";

const LOG_PREFIX = "[pipeline-parallel-blocks]";

function logDev(message: string, payload?: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  if (payload !== undefined) {
    console.info(LOG_PREFIX, message, payload);
  } else {
    console.info(LOG_PREFIX, message);
  }
}

type StubProps = {
  fileId: Id<"pipeline">;
  blockId: PipelineBlockId;
};

const ParallelBlockStub = memo(function ParallelBlockStub({
  fileId,
  blockId,
}: StubProps) {
  const def = useMemo(() => getPipelineBlock(blockId), [blockId]);

  useEffect(() => {
    logDev("block stub mounted", {
      fileId,
      blockId,
      name: def.name,
      componentReference: def.componentReference,
    });
    return () => {
      logDev("block stub unmounted", { fileId, blockId });
    };
  }, [fileId, blockId, def.name, def.componentReference]);

  return (
    <div
      className={cn(
        pipelineWorkspaceNestedChipClass,
        "border-dashed border-border/70 bg-muted/10 px-3 py-2.5 sm:px-4 sm:py-3",
      )}
      data-parallel-block-id={blockId}
    >
      <div className="text-xs font-medium text-foreground">{def.label}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{blockId}</div>
    </div>
  );
});

/**
 * Non-primary block strip: runs **below** the legacy drawer stack so we can
 * validate registry order + data without changing existing UX.
 */
export function PipelineDrawerParallelBlockContainer({
  fileId,
  activeBlockIds,
  memberUserKey,
}: {
  fileId: Id<"pipeline">;
  activeBlockIds: readonly PipelineBlockId[];
  memberUserKey?: string;
}) {
  const normalizedArgs = useMemo(
    () => ({
      fileId,
      memberUserKey: memberUserKey?.trim() || undefined,
    }),
    [fileId, memberUserKey],
  );
  const normalized = useQuery(api.fileSharedState.getNormalized, normalizedArgs);

  const safeBlockIds = useMemo(
    () => sanitizeActivePipelineBlockIdsForRender(activeBlockIds as readonly string[]),
    [activeBlockIds]
  );

  const signature = useMemo(() => safeBlockIds.join("\0"), [safeBlockIds]);

  useEffect(() => {
    logDev("active block list for file", {
      fileId,
      count: safeBlockIds.length,
      order: [...safeBlockIds],
      droppedFromInput:
        activeBlockIds.length !== safeBlockIds.length
          ? activeBlockIds.length - safeBlockIds.length
          : 0,
    });
  }, [fileId, signature, safeBlockIds, activeBlockIds.length]);

  useEffect(() => {
    if (normalized === undefined) {
      logDev("shared bus query loading", { fileId });
      return;
    }
    logDev("shared bus snapshot (normalized)", {
      fileId,
      normalized,
    });
  }, [fileId, normalized]);

  return (
    <PipelineWorkspaceSection
      sectionId="parallel-block-preview"
      sectionType="footer-strip"
      sectionLabel="Parallel block preview (non-primary)"
      className="mt-8 border-t border-border/60 pt-6"
      header={
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Block preview (parallel) — does not replace drawer sections
        </p>
      }
      contentClassName="min-w-0"
    >
      <div
        className="flex flex-col gap-2 md:flex-row md:flex-wrap"
        data-testid="pipeline-parallel-block-container"
      >
        {safeBlockIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active blocks for this file (layout hidden + global policy).
          </p>
        ) : (
          safeBlockIds.map((blockId) => (
            <ParallelBlockStub key={blockId} fileId={fileId} blockId={blockId} />
          ))
        )}
      </div>
    </PipelineWorkspaceSection>
  );
}
