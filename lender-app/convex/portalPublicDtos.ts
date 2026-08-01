/**
 * Strict public DTOs for client/borrower portal surfaces (token or session scoped).
 */
import type { Doc, Id } from "./_generated/dataModel";
import { extractDealSnapshotSlice } from "./clientPortalBlockHydration";
import {
  isAtomicPortalBlockId,
  type AtomicPortalBlockId,
} from "../lib/atomicPortalBlockRegistry";
import { prefillValuesForPortalBlock } from "../lib/documentVaultClientBlocks";
import { pickIntakeShapedPreviewPayload } from "../lib/pipeline/pickIntakeShapedPreviewPayload";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";

/** Minimal pipeline summary for external portal users. */
export function portalPublicFileSummary(row: Doc<"pipeline">) {
  return {
    fileName: row.fileName?.trim() || "Loan file",
    status: row.status,
    propertyAddress: row.propertyAddress?.trim() || undefined,
    updatedAt: row.updatedAt,
  };
}

export function portalPublicTaskRow(
  task: Doc<"documentVaultFileTasks">,
  assignedBlockEntries: { blockId: string; sortOrder: number }[],
  assignedBlocks: string[],
  blockSettings: Record<string, unknown>,
  blockPrefill: Record<string, Record<string, string>>,
) {
  return {
    fileTaskId: task._id,
    title: task.title,
    isRequired: task.isRequired,
    status: task.status,
    taskType: task.taskType ?? "document_upload",
    clientInstructionText: task.clientInstructionText?.trim() || undefined,
    instructionUrl: task.instructionUrl?.trim() || undefined,
    rejectionNote: task.rejectionNote?.trim() || undefined,
    assignedBlockEntries,
    assignedBlocks,
    blockSettings,
    blockPrefill,
  };
}

/** Block prefill limited to assigned editable blocks — never full dealData. */
export function portalBlockPrefillForTask(
  assignedBlockIds: string[],
  dealPayload: Record<string, unknown>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const blockId of assignedBlockIds) {
    if (!isAtomicPortalBlockId(blockId)) continue;
    out[blockId] = prefillValuesForPortalBlock(blockId, dealPayload);
  }
  return out;
}

export function portalDealSheetDto(args: {
  pipeline: Doc<"pipeline">;
  assignedBlockIds: string[];
  constructionBudgetLines: Doc<"constructionBudgetLines">[];
  blockEditable: Record<string, boolean>;
  readOnlyPreview: boolean;
  brokerAgentCapable: boolean;
}) {
  const linked =
    args.pipeline.intakeSheetId != null
      ? null // caller passes linked separately when loaded
      : null;
  void linked;
  const embedded = embeddedDealPayloadIsSubstantive(args.pipeline.dealData)
    ? (args.pipeline.dealData as Record<string, unknown>)
    : null;
  const linkedRow = args.pipeline.intakeSheetId
    ? null
    : null;

  const base = pickIntakeShapedPreviewPayload(
    embedded as Doc<"intakeSheets"> | null,
    linkedRow,
    args.pipeline.updatedAt,
  );
  const dealRecord = (base ?? {}) as Record<string, unknown>;
  const sheet: Record<string, unknown> = {};
  if (base?._id) sheet._id = base._id;
  if (base?.updatedAt != null) sheet.updatedAt = base.updatedAt;

  for (const blockId of args.assignedBlockIds) {
    if (!isAtomicPortalBlockId(blockId)) continue;
    Object.assign(
      sheet,
      extractDealSnapshotSlice(dealRecord, blockId as AtomicPortalBlockId),
    );
  }

  const needsConstruction = args.assignedBlockIds.includes("construction_budget");
  return {
    readOnlyPreview: args.readOnlyPreview,
    brokerAgentCapable: args.brokerAgentCapable,
    pipelineUpdatedAt: args.pipeline.updatedAt,
    sheet,
    assignedBlockIds: args.assignedBlockIds,
    blockEditable: args.blockEditable,
    constructionBudgetLines: needsConstruction
      ? args.constructionBudgetLines.map((line) => ({
          _id: line._id,
          sortOrder: line.sortOrder,
          category: line.category,
          description: line.description,
          budgetAmount: line.budgetAmount,
          spentAmount: line.spentAmount,
          drawNumber: line.drawNumber,
          status: line.status,
        }))
      : [],
  };
}

/** Build deal sheet DTO when linked intake row is already loaded. */
export function portalDealSheetDtoFromSources(args: {
  pipeline: Doc<"pipeline">;
  linkedIntake: Doc<"intakeSheets"> | null;
  assignedBlockIds: string[];
  constructionBudgetLines: Doc<"constructionBudgetLines">[];
  blockEditable: Record<string, boolean>;
  readOnlyPreview: boolean;
  brokerAgentCapable: boolean;
}) {
  const embedded = embeddedDealPayloadIsSubstantive(args.pipeline.dealData)
    ? (args.pipeline.dealData as Doc<"intakeSheets">)
    : null;
  const base = pickIntakeShapedPreviewPayload(
    embedded,
    args.linkedIntake,
    args.pipeline.updatedAt,
  );
  const dealRecord = (base ?? {}) as Record<string, unknown>;
  const sheet: Record<string, unknown> = {};
  if (base?._id) sheet._id = base._id;
  if (base?.updatedAt != null) sheet.updatedAt = base.updatedAt;
  for (const blockId of args.assignedBlockIds) {
    if (!isAtomicPortalBlockId(blockId)) continue;
    Object.assign(
      sheet,
      extractDealSnapshotSlice(dealRecord, blockId as AtomicPortalBlockId),
    );
  }
  const needsConstruction = args.assignedBlockIds.includes("construction_budget");
  return {
    readOnlyPreview: args.readOnlyPreview,
    brokerAgentCapable: args.brokerAgentCapable,
    pipelineUpdatedAt: args.pipeline.updatedAt,
    sheet,
    assignedBlockIds: args.assignedBlockIds,
    blockEditable: args.blockEditable,
    constructionBudgetLines: needsConstruction
      ? args.constructionBudgetLines.map((line) => ({
          _id: line._id,
          sortOrder: line.sortOrder,
          category: line.category,
          description: line.description,
          budgetAmount: line.budgetAmount,
          spentAmount: line.spentAmount,
          drawNumber: line.drawNumber,
          status: line.status,
        }))
      : [],
    /** Bundle+task gated — editor plumbing only; never returned from `getBundleByToken`. */
    portalEditorFileId: args.pipeline._id,
  };
}

export function portalSharedDocumentDto(
  doc: Doc<"libraryDocuments">,
  linkId: Id<"libraryDocumentLinks">,
) {
  return {
    linkId,
    title: doc.title,
    fileName: doc.latestFileName,
    contentType: doc.latestContentType,
    uploadedAt: doc.latestUploadedAt,
  };
}

export function portalUploadDto(row: Doc<"clientPortalUploads">) {
  return {
    _id: row._id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt,
    fulfilledRequestId: row.fulfilledRequestId,
  };
}

export function portalRequestDto(
  row: Doc<"clientPortalRequests">,
  description: string | undefined,
  clientCompletedNote: string | undefined,
  folderPath?: string,
  folderGroupHeading?: string,
) {
  return {
    _id: row._id,
    title: row.title,
    description,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    clientCompletedNote,
    folderPath,
    folderGroupHeading,
  };
}
