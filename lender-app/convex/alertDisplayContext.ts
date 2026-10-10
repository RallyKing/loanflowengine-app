/**
 * Denormalized Reminders row fields — resolved at fire time (bounded gets).
 * listForUser returns stored fields only; no N+1 joins on read.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { derivePrimaryFundingAmountFromDealPayload } from "./dealDataMerge";
import {
  isPrimaryBorrowerFileLink,
  personNameFromBorrowerRow,
} from "../lib/contacts/borrowerIdentityFromDeal";

export type AlertDisplayContext = {
  taskName?: string;
  contactName?: string;
  fileName?: string;
  lenderName?: string;
  /** USD loan / funding amount when known. */
  loanAmount?: number;
};

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

const STR_MAX = 200;
/** bounded: primary-borrower scan on a single file */
const CONTACT_LINKS_TAKE = 20;

function clampStr(value: string | undefined | null, max = STR_MAX): string | undefined {
  const t = (value ?? "").trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  return t.slice(0, max);
}

function positiveAmount(n: number | undefined | null): number | undefined {
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function dealPayloadFromPipeline(
  pipeline: Doc<"pipeline">,
  intake: Doc<"intakeSheets"> | null,
): Record<string, unknown> | null {
  const deal = pipeline.dealData;
  if (deal != null && typeof deal === "object" && !Array.isArray(deal)) {
    return deal as Record<string, unknown>;
  }
  if (intake) {
    const { _id, _creationTime, ...rest } = intake;
    void _id;
    void _creationTime;
    return rest as Record<string, unknown>;
  }
  return null;
}

async function resolvePipelineDisplayContext(
  ctx: DbCtx,
  pipelineId: Id<"pipeline">,
): Promise<AlertDisplayContext> {
  const pipeline = await ctx.db.get(pipelineId);
  if (!pipeline) return {};

  let intake: Doc<"intakeSheets"> | null = null;
  if (pipeline.intakeSheetId && !pipeline.dealData) {
    intake = await ctx.db.get(pipeline.intakeSheetId);
  }
  const deal = dealPayloadFromPipeline(pipeline, intake);

  const fileName = clampStr(pipeline.fileName);

  let loanAmount = positiveAmount(pipeline.fundingAmount);
  if (loanAmount == null && deal) {
    loanAmount = positiveAmount(
      derivePrimaryFundingAmountFromDealPayload(deal),
    );
  }

  const lenderId =
    pipeline.primaryLenderId ??
    pipeline.selectedLenderId ??
    undefined;
  let lenderName: string | undefined;
  if (lenderId) {
    const lender = await ctx.db.get(lenderId);
    lenderName =
      clampStr(lender?.company) || clampStr(lender?.contactName);
  }

  let contactName: string | undefined;
  // bounded: one file's recent contact links
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", pipelineId))
    .order("desc")
    .take(CONTACT_LINKS_TAKE);
  const primary = links.find(isPrimaryBorrowerFileLink) ?? links[0];
  if (primary) {
    const contact = await ctx.db.get(primary.contactId);
    contactName = clampStr(contact?.name);
  }
  if (!contactName && deal) {
    const clientName = clampStr(
      typeof deal.clientName === "string" ? deal.clientName : undefined,
    );
    if (clientName) contactName = clientName;
    else if (Array.isArray(deal.borrowers)) {
      for (const row of deal.borrowers) {
        const name = clampStr(personNameFromBorrowerRow(row));
        if (name) {
          contactName = name;
          break;
        }
      }
    }
  }
  if (!contactName && pipeline.clientId) {
    const client = await ctx.db.get(pipeline.clientId);
    contactName =
      clampStr(client?.primaryContactName) ||
      clampStr(client?.displayName);
  }

  return {
    ...(fileName ? { fileName } : {}),
    ...(contactName ? { contactName } : {}),
    ...(lenderName ? { lenderName } : {}),
    ...(loanAmount != null ? { loanAmount } : {}),
  };
}

async function resolveHubTaskPipelineId(
  ctx: DbCtx,
  taskId: Id<"tasks">,
): Promise<Id<"pipeline"> | null> {
  const row = await ctx.db.get(taskId);
  if (!row) return null;
  if (row.relatedFileId) return row.relatedFileId;
  // bounded: at most one edge lookup
  const edge = await ctx.db
    .query("fileTasks")
    .withIndex("by_entity", (q) => q.eq("taskId", taskId))
    .first();
  return edge?.fileId ?? null;
}

/**
 * Resolve slim display fields for an alert entity. All reads are indexed /
 * single-get; never scans unbounded tables.
 */
export async function resolveAlertDisplayContext(
  ctx: DbCtx,
  args: {
    entityType: "pipeline" | "task" | "documentVaultFileTask";
    entityId: string;
  },
): Promise<AlertDisplayContext> {
  const entityId = args.entityId.trim();
  if (!entityId || entityId.startsWith("self_test")) return {};

  if (args.entityType === "pipeline") {
    try {
      return await resolvePipelineDisplayContext(
        ctx,
        entityId as Id<"pipeline">,
      );
    } catch {
      return {};
    }
  }

  if (args.entityType === "documentVaultFileTask") {
    try {
      const fileTask = await ctx.db.get(
        entityId as Id<"documentVaultFileTasks">,
      );
      if (!fileTask) return {};
      const taskName = clampStr(fileTask.title);
      const fileCtx = await resolvePipelineDisplayContext(
        ctx,
        fileTask.pipelineFileId,
      );
      return {
        ...(taskName ? { taskName } : {}),
        ...fileCtx,
      };
    } catch {
      return {};
    }
  }

  // hub task
  try {
    const task = await ctx.db.get(entityId as Id<"tasks">);
    if (!task) return {};
    const taskName = clampStr(task.title);
    let contactName: string | undefined;
    if (task.relatedContactId) {
      const contact = await ctx.db.get(task.relatedContactId);
      contactName = clampStr(contact?.name);
    }
    const pipelineId = await resolveHubTaskPipelineId(ctx, task._id);
    const fileCtx = pipelineId
      ? await resolvePipelineDisplayContext(ctx, pipelineId)
      : {};
    return {
      ...(taskName ? { taskName } : {}),
      ...(contactName || fileCtx.contactName
        ? { contactName: contactName ?? fileCtx.contactName }
        : {}),
      ...(fileCtx.fileName ? { fileName: fileCtx.fileName } : {}),
      ...(fileCtx.lenderName ? { lenderName: fileCtx.lenderName } : {}),
      ...(fileCtx.loanAmount != null ? { loanAmount: fileCtx.loanAmount } : {}),
    };
  } catch {
    return {};
  }
}

/** True when a stored alert still needs fire-time display context. */
export function alertNeedsDisplayContext(row: Doc<"alerts">): boolean {
  if (row.entityId.startsWith("self_test")) return false;
  return (
    row.taskName == null &&
    row.contactName == null &&
    row.fileName == null &&
    row.lenderName == null &&
    row.loanAmount == null
  );
}
