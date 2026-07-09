import type { Doc, Id } from "@/convex/_generated/dataModel";
import { embeddedDealPayloadIsSubstantive } from "@/lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "@/lib/pipeline/pickIntakeShapedPreviewPayload";
import { isDealBackedPipelineRow } from "@/lib/pipeline/dealBackedRow";
import { buildSubjectAddressDisplay } from "@/lib/pipeline/subjectAddressDisplay";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

/**
 * Minimal pipeline context for file-first commits (drawer + table).
 * Either a preview row or `buildDealCommitRow(pipeline, linkedIntake)`.
 */
export type DealCommitRow = {
  _id: Id<"pipeline">;
  propertyAddress?: string | null;
  subjectAddressDisplay?: string;
  intakeSheetId?: Id<"intakeSheets">;
  hasEmbeddedDealData?: boolean;
  dealData?: unknown;
};

export function buildDealCommitRow(
  pipeline: Doc<"pipeline">,
  linkedIntake: Doc<"intakeSheets"> | null | undefined,
): DealCommitRow {
  const embedded = embeddedDealPayloadIsSubstantive(pipeline.dealData)
    ? (pipeline.dealData as Doc<"intakeSheets">)
    : null;
  const intakeForAddr = pickIntakeShapedPreviewPayload(
    embedded,
    linkedIntake ?? null,
    pipeline.updatedAt,
  );
  return {
    _id: pipeline._id,
    dealData: pipeline.dealData,
    intakeSheetId: pipeline.intakeSheetId,
    propertyAddress: pipeline.propertyAddress,
    hasEmbeddedDealData: embeddedDealPayloadIsSubstantive(pipeline.dealData),
    subjectAddressDisplay: buildSubjectAddressDisplay(intakeForAddr, pipeline),
  };
}

type PatchPipeline = (args: {
  id: Id<"pipeline">;
  fileName?: string;
  status?: string;
  stageId?: Id<"organizationPipelineStages"> | null;
  subStageId?: Id<"organizationPipelineSubStages"> | null;
  fundingAmount?: number;
  targetCloseDate?: number | null;
  selectedLenderSentAt?: number | null;
  netToUser?: number | null;
  notes?: string | null;
  propertyAddress?: string | null;
}) => Promise<unknown>;

/** Match `fmtTableDate` in Convex preview so coversheet `estCOE` stays aligned. */
function coverEstCoeFromMs(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

type PatchDeal = (args: {
  fileId: Id<"pipeline">;
  changes: Record<string, unknown>;
}) => Promise<unknown>;

/** Commit file name: deal payload + pipeline row when deal-backed. */
export async function commitPipelineFileName(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchPipeline: PatchPipeline,
  patchDeal: PatchDeal,
  trimmed: string,
): Promise<void> {
  if (!trimmed) return;
  if (isDealBackedPipelineRow(row)) {
    await patchDeal({ fileId: row._id, changes: { fileName: trimmed } });
  } else {
    await patchPipeline({ id: row._id, fileName: trimmed });
  }
}

/** Lead origin (`sourceType`) on the deal — deal-backed files only. */
export async function commitPipelineLeadOrigin(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchDeal: PatchDeal,
  raw: string,
): Promise<void> {
  if (!isDealBackedPipelineRow(row)) return;
  await patchDeal({
    fileId: row._id,
    changes: { sourceType: raw.trim() },
  });
}

const FUNDING_TYPE_MAX = 120;

/** Deal root `fundingType` — deal-backed files only (same field as File → Overview). */
export async function commitPipelineFundingType(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchDeal: PatchDeal,
  raw: string,
): Promise<void> {
  if (!isDealBackedPipelineRow(row)) return;
  const trimmed = raw.trim().slice(0, FUNDING_TYPE_MAX);
  await patchDeal({
    fileId: row._id,
    changes: { fundingType: trimmed },
  });
}

/** Inline subject address — syncs coversheet line + structured property on the deal when backed. */
export async function commitPipelineSubjectAddress(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchPipeline: PatchPipeline,
  patchDeal: PatchDeal,
  trimmed: string,
): Promise<void> {
  if (isDealBackedPipelineRow(row)) {
    const cleared = trimmed === "";
    await patchDeal({
      fileId: row._id,
      changes: cleared
        ? {
            cover: { subjectProperty: "" },
            subjectProperty: {
              address: "",
              city: "",
              state: "",
              zip: "",
            },
          }
        : {
            cover: { subjectProperty: trimmed },
            subjectProperty: { address: trimmed },
          },
    });
    return;
  }
  await patchPipeline({
    id: row._id,
    propertyAddress: trimmed === "" ? null : trimmed,
  });
}

/** Primary funding amount — deal-backed rows patch `cover.fundingAmount`. */
export async function commitPipelineFundingAmount(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchPipeline: PatchPipeline,
  patchDeal: PatchDeal,
  amount: number,
): Promise<void> {
  if (amount < 0) return;
  if (isDealBackedPipelineRow(row)) {
    await patchDeal({
      fileId: row._id,
      changes: {
        cover: { fundingAmount: amount === 0 ? "" : String(amount) },
      },
    });
  } else {
    await patchPipeline({ id: row._id, fundingAmount: amount });
  }
}

/** Value shown in the subject-address inline editor (matches server preview semantics). */
export function subjectAddressEditorValue(
  row: DealCommitRow | PipelineTablePreviewRow,
): string {
  if (isDealBackedPipelineRow(row)) {
    return row.subjectAddressDisplay ?? "";
  }
  return row.propertyAddress ?? row.subjectAddressDisplay ?? "";
}

/**
 * Target close: `pipeline.targetCloseDate` (canonical ms for the table control)
 * plus **`cover.estCOE`** on the deal when deal-backed so the File coversheet
 * stays in sync and `listTablePreview`’s `targetCloseDisplay` updates from one edit.
 */
export async function commitPipelineTargetClose(
  row: DealCommitRow | PipelineTablePreviewRow,
  patchPipeline: PatchPipeline,
  patchDeal: PatchDeal,
  nextMs: number | null,
): Promise<void> {
  await patchPipeline({
    id: row._id,
    targetCloseDate: nextMs === null ? null : nextMs,
  });
  if (!isDealBackedPipelineRow(row)) return;
  if (nextMs == null || !Number.isFinite(nextMs)) {
    await patchDeal({
      fileId: row._id,
      changes: { cover: { estCOE: "" } },
    });
    return;
  }
  const est = coverEstCoeFromMs(nextMs);
  if (est) {
    await patchDeal({
      fileId: row._id,
      changes: { cover: { estCOE: est } },
    });
  }
}
