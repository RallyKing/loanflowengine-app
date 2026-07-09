 "use client";

import Link from "next/link";
import { Archive, BellOff, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { cn } from "@/lib/cn";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import {
  InlineDate,
  InlineNumber,
  InlineSelect,
  type InlineSelectOption,
  InlineText,
} from "@/components/inline";
import { PipelineTableNotesCell } from "@/components/pipeline/notes/PipelineTableNotesCell";
import { ResourceOwnershipLine } from "@/components/ownership/ResourceOwnershipLine";
import {
  getPipelineStatusBadgeStyle,
  getPipelineStatusInfo,
  type PipelineStageStyleMap,
} from "@/lib/pipelineStatus";
import {
  formatPipelineStageCompactLabel,
  useOrganizationPipelineStages,
} from "@/hooks/useOrganizationPipelineStages";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import {
  commitPipelineFileName,
  commitPipelineFundingAmount,
  commitPipelineFundingType,
  commitPipelineLeadOrigin,
  commitPipelineSubjectAddress,
  commitPipelineTargetClose,
  subjectAddressEditorValue,
} from "@/lib/pipeline/pipelineTableCommits";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import { isDealBackedPipelineRow } from "@/lib/pipeline/dealBackedRow";
import { snoozedUntilToMs } from "@/lib/pipelineSnooze";
import {
  fmtPipelineCurrency0,
  fmtPipelineNet2,
  fmtPipelineRelativeUpdated,
} from "@/lib/pipeline/pipelineTableFormatting";
import { PipelineFileRowHierarchyStack } from "@/components/pipeline/PipelineFileRowHierarchyStack";

type PatchPipelineFn = (args: {
  id: Id<"pipeline">;
  fileName?: string;
  status?: string;
  stageId?: Id<"organizationPipelineStages"> | null;
  subStageId?: Id<"organizationPipelineSubStages"> | null;
  fundingAmount?: number;
  targetCloseDate?: number | null;
  selectedLenderSentAt?: number | null;
  netToUser?: number | null;
  propertyAddress?: string | null;
}) => Promise<unknown>;

type PatchDealFn = (args: {
  fileId: Id<"pipeline">;
  changes: Record<string, unknown>;
}) => Promise<unknown>;

type SetClientMomentumFn = (
  id: Id<"pipeline">,
  next: number | null,
) => void | Promise<void>;

export function PipelineTableRow({
  row: r,
  selected,
  bulkChecked,
  onBulkCheckedChange,
  onOpen,
  onOpenNotes,
  organizationId,
  memberUserKey,
  patchPipeline,
  patchDeal,
  onSetClientMomentum,
  statusOptions,
  stageColors,
  globalStageIndicator,
}: {
  row: PipelineTablePreviewRow;
  selected: boolean;
  bulkChecked: boolean;
  onBulkCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
  onOpenNotes: () => void;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  patchPipeline: PatchPipelineFn;
  patchDeal: PatchDealFn;
  onSetClientMomentum?: SetClientMomentumFn;
  statusOptions: InlineSelectOption[];
  stageColors: PipelineStageStyleMap;
  /** Account display tint for stage pill borders / dots (see `UserPreferences.displaySettings`). */
  globalStageIndicator?: string | null;
}) {
  const { stageById, subById } = useOrganizationPipelineStages();
  const archived = r.archivedAt != null;
  const editable = !archived;
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <tr
      data-pipeline-row={r._id}
      onClick={onOpen}
      className={cn(
        "cursor-pointer border-b border-border/50 last:border-0 transition-colors",
        "hover:bg-muted/40",
        selected && "bg-muted/50",
        archived && "opacity-65"
      )}
    >
      <td
        className="w-10 px-2 py-2.5 align-middle"
        onClick={stop}
      >
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-border text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          checked={bulkChecked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onBulkCheckedChange(e.target.checked);
          }}
          aria-label={`Select ${r.fileName} for bulk actions`}
        />
      </td>
      <td
        className="min-w-0 max-w-[min(22rem,42vw)] px-3 py-2.5 align-top"
        onClick={editable ? stop : undefined}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-nowrap items-start gap-1.5">
            <Link
              href={pipelineDealEditorHref(r._id)}
              className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-dlc-short1 ease-dlc-standard hover:bg-muted hover:text-foreground"
              aria-label={`Open file ${r.fileName}`}
              title="Open file"
              onClick={stop}
              prefetch={false}
            >
              <FileText className="h-4 w-4" aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <PipelineFileRowHierarchyStack
                row={r}
                fileTitleSlot={
                  editable ? (
                    <InlineText
                      value={r.fileName}
                      validate={(t) =>
                        !t.trim() ? "File name is required" : null
                      }
                      onCommit={async (next) => {
                        const t = next.trim();
                        if (!t) return;
                        await commitPipelineFileName(
                          r,
                          patchPipeline,
                          patchDeal,
                          t,
                        );
                      }}
                      ariaLabel={`File name for ${r.fileName}`}
                      className="inline min-w-0 max-w-full shrink text-sm font-medium text-slate-900 dark:text-slate-100"
                      displayClassName="truncate text-left text-sm font-medium text-slate-900 dark:text-slate-100"
                    />
                  ) : undefined
                }
              />
              {(archived || (r.isSnoozed && snoozedUntilToMs(r.snoozedUntil) != null)) ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {archived ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                    >
                      <Archive className="h-2.5 w-2.5" aria-hidden />
                      Archived
                    </span>
                  ) : null}
                  {r.isSnoozed && snoozedUntilToMs(r.snoozedUntil) != null ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
                    >
                      <BellOff className="h-2.5 w-2.5" aria-hidden />
                      Until{" "}
                      {new Date(
                        snoozedUntilToMs(r.snoozedUntil)!,
                      ).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div
            className="flex min-w-0 flex-nowrap pl-8"
            onClick={stop}
            onPointerDown={stop}
          >
            <ClientMomentumStars
              className="shrink-0"
              value={r.clientMomentum}
              readOnly={!editable || !r.canEditFile || !onSetClientMomentum}
              disabled={!editable}
              onCommit={
                onSetClientMomentum && editable && r.canEditFile
                  ? (n) => onSetClientMomentum(r._id, n)
                  : undefined
              }
            />
          </div>
          {r.ownership?.ownershipLine ? (
            <ResourceOwnershipLine
              ownershipLine={r.ownership.ownershipLine}
              badge={r.ownership.badge}
              compact
              className="pl-8"
            />
          ) : null}
          <p className="text-[10px] text-muted-foreground">
            Updated {fmtPipelineRelativeUpdated(r.updatedAt)}
          </p>
        </div>
      </td>

      <td className="min-w-[8.5rem] px-3 py-2.5 align-top" onClick={editable ? stop : undefined}>
        {editable && r.canEditFile ? (
          <PipelineStageSelector
            stageId={r.stageId}
            subStageId={r.subStageId}
            compact
            onCommit={(next) =>
              patchPipeline({
                id: r._id,
                stageId: next.stageId,
                subStageId: next.subStageId ?? null,
              })
            }
            ariaLabel={`Stage for ${r.fileName}`}
          />
        ) : (
          <span
            className="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={
              r.stageId && stageById.get(r.stageId)
                ? {
                    backgroundColor: `${stageById.get(r.stageId)!.color}22`,
                    borderColor: stageById.get(r.stageId)!.color,
                  }
                : getPipelineStatusBadgeStyle(r.status, stageColors, {
                    globalIndicator: globalStageIndicator,
                  })
            }
          >
            {r.stageId
              ? formatPipelineStageCompactLabel(
                  stageById.get(r.stageId),
                  r.subStageId ? subById.get(r.subStageId) : undefined,
                )
              : getPipelineStatusInfo(r.status).label}
          </span>
        )}
      </td>

      <td
        className="max-w-[10rem] px-3 py-2.5 align-top"
        onClick={
          editable && isDealBackedPipelineRow(r) ? stop : undefined
        }
      >
        {editable && isDealBackedPipelineRow(r) ? (
          <span className="block min-w-0" title={r.sourceLabel || undefined}>
            <InlineText
              value={r.dealSourceType ?? ""}
              allowEmpty
              placeholder="Lead source"
              onCommit={async (next) => {
                await commitPipelineLeadOrigin(r, patchDeal, next);
              }}
              ariaLabel={`Lead source for ${r.fileName}`}
              displayClassName="line-clamp-3 text-left text-muted-foreground"
            />
          </span>
        ) : (
          <span
            className="line-clamp-3 text-muted-foreground"
            title={r.sourceLabel || undefined}
          >
            {r.sourceLabel || "—"}
          </span>
        )}
      </td>

      <td
        className="max-w-[12rem] px-3 py-2.5 align-top"
        onClick={editable ? stop : undefined}
      >
        {editable ? (
          <InlineText
            value={subjectAddressEditorValue(r)}
            allowEmpty
            onCommit={async (next) => {
              await commitPipelineSubjectAddress(
                r,
                patchPipeline,
                patchDeal,
                next.trim(),
              );
            }}
            ariaLabel={`Subject address for ${r.fileName}`}
            displayClassName="line-clamp-3 text-left text-muted-foreground"
            placeholder="—"
          />
        ) : (
          <span
            className="line-clamp-3 text-muted-foreground"
            title={r.subjectAddressDisplay || undefined}
          >
            {r.subjectAddressDisplay || "—"}
          </span>
        )}
      </td>

      <td
        className="max-w-[8rem] px-3 py-2.5 align-top"
        onClick={
          editable && isDealBackedPipelineRow(r) ? stop : undefined
        }
      >
        {editable && isDealBackedPipelineRow(r) ? (
          <span className="block min-w-0" title={r.fundingTypeDisplay || undefined}>
            <InlineText
              value={r.fundingTypeDisplay ?? ""}
              allowEmpty
              placeholder="Funding type"
              onCommit={async (next) => {
                await commitPipelineFundingType(r, patchDeal, next);
              }}
              validate={(s) =>
                s.trim().length > 120
                  ? "Funding type must be at most 120 characters"
                  : null
              }
              ariaLabel={`Funding type for ${r.fileName}`}
              displayClassName="line-clamp-2 text-left text-muted-foreground"
            />
          </span>
        ) : (
          <span className="line-clamp-2" title={r.fundingTypeDisplay || undefined}>
            {r.fundingTypeDisplay || "—"}
          </span>
        )}
      </td>
      <td className="max-w-[10rem] px-3 py-2.5 align-top">
        <span
          className="line-clamp-3 text-muted-foreground"
          title={r.fundingProgramDisplay || undefined}
        >
          {r.fundingProgramDisplay || "—"}
        </span>
      </td>
      <td className="max-w-[7rem] px-3 py-2.5 align-top">
        <span className="line-clamp-2" title={r.purchaseRefiDisplay || undefined}>
          {r.purchaseRefiDisplay || "—"}
        </span>
      </td>

      <td
        className="px-3 py-2.5 text-right align-top tabular-nums font-medium"
        onClick={editable ? stop : undefined}
      >
        {editable ? (
          <div className="flex justify-end">
            <InlineNumber
              value={r.fundingAmount}
              format={fmtPipelineCurrency0}
              clearable={false}
              validate={(n) =>
                n < 0 ? "Funding amount must be 0 or more" : null
              }
              onCommit={async (next) => {
                const n = next === null ? 0 : next;
                if (n < 0) return;
                await commitPipelineFundingAmount(
                  r,
                  patchPipeline,
                  patchDeal,
                  n,
                );
              }}
              ariaLabel={`Funding amount for ${r.fileName}`}
              className="max-w-[10rem]"
              displayClassName="justify-end text-right font-medium"
            />
          </div>
        ) : (
          <span>{r.fundingAmountDisplay || "—"}</span>
        )}
      </td>

      <td className="max-w-[9rem] px-3 py-2.5 align-top">
        <span className="line-clamp-2 font-medium" title={r.selectedLenderDisplay || undefined}>
          {r.selectedLenderDisplay || "—"}
        </span>
      </td>
      <td
        className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground"
        onClick={editable ? stop : undefined}
      >
        {editable ? (
          <InlineDate
            value={r.selectedLenderSentAt}
            onCommit={async (next) => {
              await patchPipeline({
                id: r._id,
                selectedLenderSentAt: next === null ? null : next,
              });
            }}
            ariaLabel={`Lender sent date for ${r.fileName}`}
            placeholder="Set date"
            className="w-full min-w-0"
          />
        ) : (
          <span>{r.selectedLenderSentDisplay || "—"}</span>
        )}
      </td>

      <td
        className="min-w-[7.5rem] px-3 py-2.5 align-top text-xs text-muted-foreground"
        onClick={editable ? stop : undefined}
      >
        {editable ? (
          <div className="flex flex-col gap-0.5">
            <InlineDate
              value={r.targetCloseDate}
              onCommit={async (next) => {
                await commitPipelineTargetClose(
                  r,
                  patchPipeline,
                  patchDeal,
                  next === null ? null : next,
                );
              }}
              ariaLabel={`Target close for ${r.fileName}`}
              placeholder="Set date"
              className="w-full min-w-0"
            />
            {r.targetCloseDate == null &&
            (r.targetCloseDisplay ?? "").trim() !== "" ? (
              <span className="text-[10px] text-muted-foreground/90" title="Also shown from deal coversheet until you set a file date">
                Deal: {r.targetCloseDisplay}
              </span>
            ) : null}
          </div>
        ) : (
          <span>{r.targetCloseDisplay || "—"}</span>
        )}
      </td>

      <td
        className="px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground"
        onClick={editable ? stop : undefined}
      >
        {editable ? (
          <div className="flex justify-end">
            <InlineNumber
              value={r.netToUser ?? null}
              format={fmtPipelineNet2}
              clearable
              validate={(n) =>
                n < 0 ? "Net to you must be 0 or more" : null
              }
              onCommit={async (next) => {
                await patchPipeline({
                  id: r._id,
                  netToUser: next === null ? null : next,
                });
              }}
              ariaLabel={`Net to you for ${r.fileName}`}
              className="max-w-[9rem]"
              displayClassName="justify-end text-right"
            />
          </div>
        ) : (
          <span>{r.netToUserDisplay || "—"}</span>
        )}
      </td>

      <td
        className="max-w-[14rem] px-3 py-2.5 align-top"
        onClick={stop}
      >
        {organizationId ? (
          <PipelineTableNotesCell
            pipelineFileId={r._id}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            fileName={r.fileName}
            noteCount={r.fileNotesCount ?? 0}
            canEdit={editable && r.canEditFile}
            onOpenNotes={onOpenNotes}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 justify-start px-2 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNotes();
            }}
          >
            {(r.fileNotesCount ?? 0) > 0
              ? `${r.fileNotesCount} note${r.fileNotesCount === 1 ? "" : "s"}`
              : "Notes"}
          </Button>
        )}
      </td>
    </tr>
  );
}
