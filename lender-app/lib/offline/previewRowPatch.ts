import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { parseClientMomentum } from "@/lib/clientMomentum";
import {
  fmtPipelineBoardLoanCompact,
  fmtPipelineCurrency0,
  fmtPipelineNet2,
} from "@/lib/pipeline/pipelineTableFormatting";
import type { Id } from "@/convex/_generated/dataModel";

/** Narrow shape of `api.pipeline.patch` args used for optimistic table updates. */
export type PipelinePatchFields = {
  id?: Id<"pipeline">;
  fileName?: string;
  status?: string;
  stageId?: Id<"organizationPipelineStages"> | null;
  subStageId?: Id<"organizationPipelineSubStages"> | null;
  fundingAmount?: number;
  rate?: number;
  term?: string;
  propertyAddress?: string | null;
  notes?: string | null;
  targetCloseDate?: number | null;
  assigneeId?: string | null;
  selectedLenderSentAt?: number | null;
  netToUser?: number | null;
  commission?: number;
  netRevenue?: number;
  expectedUpdatedAt?: number;
  preferencesAccountId?: string;
  clientMomentum?: number | null;
};

function fmtClose(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Apply a partial pipeline patch to a table preview row for offline / optimistic UI.
 * Display strings are updated only for columns we can derive locally.
 */
export function applyPipelinePatchToPreviewRow(
  row: PipelineTablePreviewRow,
  patch: PipelinePatchFields,
): PipelineTablePreviewRow {
  const next: PipelineTablePreviewRow = {
    ...row,
  };

  if (patch.fileName !== undefined) {
    next.fileName = patch.fileName.trim();
  }
  if (patch.status !== undefined) {
    next.status = patch.status.trim() || next.status;
  }
  if (patch.stageId !== undefined) {
    next.stageId = patch.stageId === null ? undefined : patch.stageId;
  }
  if (patch.subStageId !== undefined) {
    next.subStageId = patch.subStageId === null ? undefined : patch.subStageId;
  }
  if (patch.fundingAmount !== undefined) {
    next.fundingAmount = patch.fundingAmount;
    next.fundingAmountDisplay = fmtPipelineCurrency0(patch.fundingAmount);
  }
  if (patch.rate !== undefined) {
    next.rate = patch.rate;
  }
  if (patch.term !== undefined) {
    next.term = patch.term;
  }
  if (patch.propertyAddress !== undefined) {
    next.propertyAddress =
      patch.propertyAddress === null ? undefined : patch.propertyAddress.trim();
    next.subjectAddressDisplay =
      next.propertyAddress && next.propertyAddress.length > 0
        ? next.propertyAddress
        : "—";
  }
  if (patch.notes !== undefined) {
    const n = patch.notes === null ? "" : patch.notes.trim();
    next.notesDisplay = n.length > 0 ? n : "—";
  }
  if (patch.targetCloseDate !== undefined) {
    next.targetCloseDate =
      patch.targetCloseDate === null ? undefined : patch.targetCloseDate;
    next.targetCloseDisplay = fmtClose(next.targetCloseDate);
  }
  if (patch.assigneeId !== undefined) {
    next.assigneeId =
      patch.assigneeId === null ? undefined : patch.assigneeId.trim();
  }
  if (patch.selectedLenderSentAt !== undefined) {
    next.selectedLenderSentAt =
      patch.selectedLenderSentAt === null
        ? undefined
        : patch.selectedLenderSentAt;
    next.selectedLenderSentDisplay =
      next.selectedLenderSentAt != null
        ? new Date(next.selectedLenderSentAt).toLocaleDateString()
        : "—";
  }
  if (patch.netToUser !== undefined) {
    next.netToUser =
      patch.netToUser === null ? undefined : patch.netToUser;
    next.netToUserDisplay =
      next.netToUser != null && Number.isFinite(next.netToUser)
        ? fmtPipelineNet2(next.netToUser)
        : "—";
  }
  if (patch.commission !== undefined) {
    next.commission = patch.commission;
  }
  if (patch.netRevenue !== undefined) {
    next.netRevenue = patch.netRevenue;
  }
  if (patch.clientMomentum !== undefined) {
    if (patch.clientMomentum === null) {
      delete (next as { clientMomentum?: number }).clientMomentum;
    } else {
      const cm = parseClientMomentum(patch.clientMomentum);
      if (cm !== undefined) {
        next.clientMomentum = cm;
      } else {
        delete (next as { clientMomentum?: number }).clientMomentum;
      }
    }
  }

  return next;
}

export function patchPreviewRowInList(
  rows: PipelineTablePreviewRow[],
  fileId: Id<"pipeline">,
  patch: PipelinePatchFields,
): PipelineTablePreviewRow[] {
  let hit = false;
  const out = rows.map((r) => {
    if (r._id !== fileId) return r;
    hit = true;
    return applyPipelinePatchToPreviewRow(r, patch);
  });
  if (!hit) return rows;
  return out;
}

/** Recompute board total loan display from patched rows (footer). */
export function sumFundingForBoardHint(rows: PipelineTablePreviewRow[]): string {
  const t = rows.reduce((s, r) => s + (r.fundingAmount || 0), 0);
  return fmtPipelineBoardLoanCompact(t);
}
