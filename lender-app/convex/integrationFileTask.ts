import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID,
  formatNewLeadMakeContactTitle,
  parseCreateFileTaskPayload,
  titleStartsWithNewLeadMakeContact,
  type ParsedCreateFileTask,
} from "../lib/inboundFileTask";
import { createTaskRecord } from "./tasks";

const FILE_TASK_SCAN_CAP = 80;

export async function fileHasNewLeadMakeContactTask(
  ctx: MutationCtx,
  relatedFileId: Id<"pipeline">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", relatedFileId))
    .take(FILE_TASK_SCAN_CAP);
  return rows.some((t) => titleStartsWithNewLeadMakeContact(t.title));
}

export async function ensureConfirmInterestNewLeadTask(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    relatedFileId: Id<"pipeline">;
    actorUserKey: string;
    now: number;
  },
): Promise<{ created: boolean; skipped?: string; taskId?: Id<"tasks"> }> {
  if (await fileHasNewLeadMakeContactTask(ctx, args.relatedFileId)) {
    return { created: false, skipped: "new_lead_task_already_exists" };
  }
  const title = formatNewLeadMakeContactTitle(args.now);
  const created = await createTaskRecord(ctx, {
    organizationId: args.organizationId,
    actorUserKey: args.actorUserKey,
    now: args.now,
    title,
    type: "work",
    category: "call",
    quadrant: 2,
    status: "todo",
    priority: 2,
    relatedFileId: args.relatedFileId,
    triageLabelId: CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID as Id<"organizationTriageLabels">,
    skipInvalidTriageLabel: true,
  });
  if (created.skippedTriageReason) {
    console.warn(
      `ensureConfirmInterestNewLeadTask: created task without triage (${created.skippedTriageReason})`,
    );
  }
  return { created: true, taskId: created.id };
}

async function resolveTriageLabelId(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  parsed: ParsedCreateFileTask,
): Promise<Id<"organizationTriageLabels"> | undefined> {
  if (parsed.triageLabelId) {
    const row = await ctx.db.get(
      parsed.triageLabelId as Id<"organizationTriageLabels">,
    );
    if (row && row.organizationId === organizationId) return row._id;
    if (!parsed.triageLabelName) {
      throw new Error("triageLabelId is not valid for this organization");
    }
  }
  const name = parsed.triageLabelName?.trim().toLowerCase();
  if (!name) return undefined;
  // bounded: org triage labels are a small admin list, not a growth table
  const labels = await ctx.db
    .query("organizationTriageLabels")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(64);
  const match = labels.find((l) => l.label.trim().toLowerCase() === name);
  if (!match) {
    throw new Error("triageLabelName did not match an organization label");
  }
  return match._id;
}

export async function applyCreateFileTaskFromInbound(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    actorUserKey: string;
    now: number;
    payload: unknown;
    parsed?: ParsedCreateFileTask;
    requireAction?: boolean;
    skipInvalidTriageLabel?: boolean;
  },
): Promise<{
  taskId: Id<"tasks">;
  relatedFileId: Id<"pipeline">;
  skippedTriageReason?: string;
}> {
  const parsed =
    args.parsed ??
    parseCreateFileTaskPayload(args.payload, {
      requireAction: args.requireAction !== false,
    });
  if (!parsed) {
    throw new Error(
      "create_file_task requires relatedFileId (or pipelineFileId) and title",
    );
  }
  const file = await ctx.db.get(parsed.relatedFileId as Id<"pipeline">);
  if (!file || file.organizationId !== args.organizationId) {
    throw new Error("Related file belongs to a different organization.");
  }
  const triageLabelId = await resolveTriageLabelId(
    ctx,
    args.organizationId,
    parsed,
  );
  const created = await createTaskRecord(ctx, {
    organizationId: args.organizationId,
    actorUserKey: args.actorUserKey,
    now: args.now,
    title: parsed.title,
    description: parsed.description,
    type: "work",
    category: parsed.category,
    quadrant: 2,
    status: parsed.status,
    priority: 2,
    relatedFileId: file._id,
    triageLabelId,
    skipInvalidTriageLabel: args.skipInvalidTriageLabel === true,
  });
  return {
    taskId: created.id,
    relatedFileId: file._id,
    skippedTriageReason: created.skippedTriageReason,
  };
}
