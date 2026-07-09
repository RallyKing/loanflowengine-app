"use client";

import { PHASE_24_4N_VELOCITY_SCROLL_FIX } from "@/lib/debug/phase24-4N-velocity-scroll-fix";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineStageStyleMap } from "@/lib/pipelineStatus";
import type { InlineSelectOption } from "@/components/inline";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { PipelineTableRow } from "@/components/pipeline/PipelineTableRow";
import { PipelineHubMobileFileCard } from "@/components/pipeline/PipelineHubMobileFileCard";
import type { TableDensityMode } from "@/lib/userSettingsStorage";
import {
  densityRowHeightPx,
  getDefaultAppMainScrollElement,
  type PlatformDensity,
} from "@/lib/platform-framework";
import {
  EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  resolveTriageHighlight,
  type HubTriageHighlightMapView,
} from "@/lib/pipeline/hubTriageHighlight";

const COL_COUNT = 14;

function hubVirtualizationBlocked(): boolean {
  return PHASE_24_4N_VELOCITY_SCROLL_FIX.hubVirtualizationDisabled;
}

type PatchPipelineFn = Parameters<typeof PipelineTableRow>[0]["patchPipeline"];
type PatchDealFn = Parameters<typeof PipelineTableRow>[0]["patchDeal"];
type SetClientMomentumFn = NonNullable<
  Parameters<typeof PipelineTableRow>[0]["onSetClientMomentum"]
>;

/** Virtualized `<tbody>` rows — scroll owner remains `AppChrome` `<main>` (no nested scrollport). */
export function PipelineHubVirtualizedTableRows({
  rows,
  density,
  hubFocusFileId,
  bulkIds,
  toggleBulkOne,
  selectFile,
  selectFileNotes,
  organizationId,
  memberUserKey,
  runPatchPipeline,
  runPatchDeal,
  onSetClientMomentum,
  statusOptions,
  stageColors,
  globalUiIndicator,
}: {
  rows: PipelineTablePreviewRow[];
  density: TableDensityMode;
  hubFocusFileId: Id<"pipeline"> | null;
  bulkIds: Set<Id<"pipeline">>;
  toggleBulkOne: (id: Id<"pipeline">, checked: boolean) => void;
  selectFile: (id: Id<"pipeline">) => void;
  selectFileNotes: (id: Id<"pipeline">) => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  runPatchPipeline: PatchPipelineFn;
  runPatchDeal: PatchDealFn;
  onSetClientMomentum?: SetClientMomentumFn;
  statusOptions: InlineSelectOption[];
  stageColors: PipelineStageStyleMap;
  globalUiIndicator?: string | null;
}) {
  if (hubVirtualizationBlocked()) {
    throw new Error(
      "PipelineHubVirtualizedTableRows: hub virtualization disabled (Phase 24.4N — fixed estimateSize desyncs on momentum scroll).",
    );
  }
  const estimateRowPx = densityRowHeightPx(density as PlatformDensity);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: getDefaultAppMainScrollElement,
    estimateSize: () => estimateRowPx,
    overscan: 14,
  });

  const items = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom =
    items.length > 0 ? total - items[items.length - 1].end : 0;

  return (
    <>
      {paddingTop > 0 ? (
        <tr className="pointer-events-none" aria-hidden="true">
          <td
            colSpan={COL_COUNT}
            style={{
              height: paddingTop,
              padding: 0,
              border: 0,
              lineHeight: 0,
            }}
          />
        </tr>
      ) : null}
      {items.map((vi) => {
        const r = rows[vi.index];
        return (
          <PipelineTableRow
            key={r._id}
            row={r}
            selected={hubFocusFileId === r._id}
            bulkChecked={bulkIds.has(r._id)}
            onBulkCheckedChange={(checked) => toggleBulkOne(r._id, checked)}
            onOpen={() => selectFile(r._id)}
            onOpenNotes={() => selectFileNotes(r._id)}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            patchPipeline={runPatchPipeline}
            patchDeal={runPatchDeal}
            onSetClientMomentum={onSetClientMomentum}
            statusOptions={statusOptions}
            stageColors={stageColors}
            globalStageIndicator={globalUiIndicator}
          />
        );
      })}
      {paddingBottom > 0 ? (
        <tr className="pointer-events-none" aria-hidden="true">
          <td
            colSpan={COL_COUNT}
            style={{
              height: paddingBottom,
              padding: 0,
              border: 0,
              lineHeight: 0,
            }}
          />
        </tr>
      ) : null}
    </>
  );
}

const CARD_ESTIMATE = 148;

export function PipelineHubVirtualizedCardList({
  rows,
  hubFocusFileId,
  bulkIds,
  toggleBulkOne,
  selectFile,
  statusOptions,
  onChangeRowStatus,
  onSetClientMomentum,
  triageHighlights = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
}: {
  rows: PipelineTablePreviewRow[];
  hubFocusFileId: Id<"pipeline"> | null;
  bulkIds: Set<Id<"pipeline">>;
  toggleBulkOne: (id: Id<"pipeline">, checked: boolean) => void;
  selectFile: (id: Id<"pipeline">) => void;
  statusOptions: InlineSelectOption[];
  onChangeRowStatus: (id: Id<"pipeline">, next: string) => void;
  onSetClientMomentum?: (
    id: Id<"pipeline">,
    next: number | null,
  ) => void | Promise<void>;
  triageHighlights?: HubTriageHighlightMapView;
}) {
  if (hubVirtualizationBlocked()) {
    throw new Error(
      "PipelineHubVirtualizedCardList: hub virtualization disabled (Phase 24.4N — fixed estimateSize desyncs on momentum scroll).",
    );
  }
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: getDefaultAppMainScrollElement,
    estimateSize: () => CARD_ESTIMATE,
    overscan: 6,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {items.map((vi) => {
        const r = rows[vi.index];
        return (
          <div
            key={r._id}
            className="absolute left-0 top-0 w-full pb-2"
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            <PipelineHubMobileFileCard
              row={r}
              selected={hubFocusFileId === r._id}
              bulkChecked={bulkIds.has(r._id)}
              onBulkCheckedChange={(c) => toggleBulkOne(r._id, c)}
              onOpen={() => selectFile(r._id)}
              statusOptions={statusOptions}
              onChangeRowStatus={onChangeRowStatus}
              onSetClientMomentum={onSetClientMomentum}
              triageHighlights={triageHighlights}
            />
          </div>
        );
      })}
    </div>
  );
}
