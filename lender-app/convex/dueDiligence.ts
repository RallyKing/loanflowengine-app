/**
 * AI Due Diligence — persist runs on the file (org-scoped) and call the
 * configured org AI provider from an action (never a query).
 */
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanReadPipelineRow,
  assertOrgPermission,
  resolveMemberUserKey,
} from "./organizationAccess";
import { assertCanReadLibraryDocument } from "./libraryDocuments";
import {
  DUE_DILIGENCE_MAX_WARNINGS,
  validateDueDiligenceCreateArgs,
} from "../lib/ai/dueDiligenceJob";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const usedAsV = v.union(
  v.literal("text"),
  v.literal("vision"),
  v.literal("skipped"),
);

const statusV = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const documentSummaryV = v.object({
  documentId: v.id("libraryDocuments"),
  title: v.string(),
  fileName: v.optional(v.string()),
  kind: v.string(),
  usedAs: usedAsV,
  skipReason: v.optional(v.string()),
});

const runPublicV = v.object({
  _id: v.id("dueDiligenceRuns"),
  organizationId: v.id("organizations"),
  pipelineFileId: v.optional(v.id("pipeline")),
  promptId: v.optional(v.id("dueDiligencePrompts")),
  promptTitle: v.string(),
  promptBody: v.string(),
  providerKind: v.string(),
  providerName: v.string(),
  model: v.string(),
  documentSummaries: v.array(documentSummaryV),
  status: statusV,
  resultMarkdown: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  warnings: v.array(v.string()),
  createdByUserKey: v.string(),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
});

function toPublic(row: Doc<"dueDiligenceRuns">) {
  return {
    _id: row._id,
    organizationId: row.organizationId,
    pipelineFileId: row.pipelineFileId,
    promptId: row.promptId,
    promptTitle: row.promptTitle,
    promptBody: row.promptBody,
    providerKind: row.providerKind,
    providerName: row.providerName,
    model: row.model,
    documentSummaries: row.documentSummaries,
    status: row.status,
    resultMarkdown: row.resultMarkdown,
    errorMessage: row.errorMessage,
    warnings: row.warnings,
    createdByUserKey: row.createdByUserKey,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

async function assertFileView(
  ctx: Parameters<typeof assertOrgPermission>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
) {
  await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
  return resolveMemberUserKey(ctx, memberUserKey);
}

export const listRunsForPipeline = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineFileId: v.id("pipeline"),
    limit: v.optional(v.number()),
    ...memberKeyArg,
  },
  returns: v.array(runPublicV),
  handler: async (ctx, args) => {
    try {
      await assertFileView(ctx, args.organizationId, args.memberUserKey);
    } catch {
      return [];
    }
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      return [];
    }
    try {
      await assertCanReadPipelineRow(ctx, pipeline, args.memberUserKey);
    } catch {
      return [];
    }
    const cap = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("dueDiligenceRuns")
      .withIndex("by_pipeline_created", (q) =>
        q.eq("pipelineFileId", args.pipelineFileId),
      )
      .order("desc")
      .take(cap);
    return rows
      .filter((r) => r.organizationId === args.organizationId)
      .map(toPublic);
  },
});

export const listRunsForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    ...memberKeyArg,
  },
  returns: v.array(runPublicV),
  handler: async (ctx, args) => {
    try {
      await assertFileView(ctx, args.organizationId, args.memberUserKey);
    } catch {
      return [];
    }
    const cap = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("dueDiligenceRuns")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(cap);
    return rows.map(toPublic);
  },
});

export const getRun = query({
  args: {
    organizationId: v.id("organizations"),
    runId: v.id("dueDiligenceRuns"),
    ...memberKeyArg,
  },
  returns: v.union(v.null(), runPublicV),
  handler: async (ctx, args) => {
    try {
      await assertFileView(ctx, args.organizationId, args.memberUserKey);
    } catch {
      return null;
    }
    const row = await ctx.db.get(args.runId);
    if (!row || row.organizationId !== args.organizationId) return null;
    if (row.pipelineFileId) {
      const pipeline = await ctx.db.get(row.pipelineFileId);
      if (pipeline) {
        try {
          await assertCanReadPipelineRow(ctx, pipeline, args.memberUserKey);
        } catch {
          return null;
        }
      }
    }
    return toPublic(row);
  },
});

export const createRun = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineFileId: v.optional(v.id("pipeline")),
    promptId: v.optional(v.id("dueDiligencePrompts")),
    promptTitle: v.string(),
    promptBody: v.string(),
    providerId: v.optional(v.id("orgAiProviders")),
    providerKind: v.string(),
    providerName: v.string(),
    model: v.string(),
    documentIds: v.array(v.id("libraryDocuments")),
    documentSummaries: v.array(documentSummaryV),
    warnings: v.optional(v.array(v.string())),
    ...memberKeyArg,
  },
  returns: v.object({ runId: v.id("dueDiligenceRuns") }),
  handler: async (ctx, args) => {
    const actor = await assertFileView(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const errors = validateDueDiligenceCreateArgs({
      organizationId: String(args.organizationId),
      memberUserKey: actor,
      promptTitle: args.promptTitle,
      promptBody: args.promptBody,
      documentIds: args.documentIds.map(String),
    });
    if (errors.length > 0) throw new Error(errors[0]!.message);
    if (args.documentSummaries.length !== args.documentIds.length) {
      throw new Error("Each selected file needs a summary.");
    }

    if (args.pipelineFileId) {
      const pipeline = await ctx.db.get(args.pipelineFileId);
      if (!pipeline || pipeline.organizationId !== args.organizationId) {
        throw new Error("Pipeline file not found.");
      }
      await assertCanReadPipelineRow(ctx, pipeline, args.memberUserKey);
    }

    for (const documentId of args.documentIds) {
      await assertCanReadLibraryDocument(ctx, documentId, args.memberUserKey);
    }

    if (args.promptId) {
      const prompt = await ctx.db.get(args.promptId);
      if (!prompt || prompt.organizationId !== args.organizationId) {
        throw new Error("Prompt not found.");
      }
    }
    if (args.providerId) {
      const provider = await ctx.db.get(args.providerId);
      if (!provider || provider.organizationId !== args.organizationId) {
        throw new Error("AI provider not found.");
      }
    }

    const now = Date.now();
    const runId = await ctx.db.insert("dueDiligenceRuns", {
      organizationId: args.organizationId,
      pipelineFileId: args.pipelineFileId,
      promptId: args.promptId,
      promptTitle: args.promptTitle.trim(),
      promptBody: args.promptBody.trim(),
      providerId: args.providerId,
      providerKind: args.providerKind,
      providerName: args.providerName,
      model: args.model,
      documentIds: args.documentIds,
      documentSummaries: args.documentSummaries,
      status: "queued",
      warnings: (args.warnings ?? []).slice(0, DUE_DILIGENCE_MAX_WARNINGS),
      createdByUserKey: actor,
      createdAt: now,
    });
    return { runId };
  },
});

export const internalAssertRunAccess = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    runId: v.id("dueDiligenceRuns"),
    memberUserKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertFileView(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.runId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Due diligence run not found.");
    }
    if (row.pipelineFileId) {
      const pipeline = await ctx.db.get(row.pipelineFileId);
      if (pipeline) {
        await assertCanReadPipelineRow(ctx, pipeline, args.memberUserKey);
      }
    }
    return null;
  },
});

export const internalGetRun = internalQuery({
  args: { runId: v.id("dueDiligenceRuns") },
  returns: v.union(v.null(), runPublicV),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    return row ? toPublic(row) : null;
  },
});

export const internalPatchRun = internalMutation({
  args: {
    runId: v.id("dueDiligenceRuns"),
    status: statusV,
    resultMarkdown: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    providerKind: v.optional(v.string()),
    providerName: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row) return null;
    const completed =
      args.status === "completed" || args.status === "failed"
        ? Date.now()
        : row.completedAt;
    await ctx.db.patch(args.runId, {
      status: args.status,
      resultMarkdown: args.resultMarkdown ?? row.resultMarkdown,
      errorMessage:
        args.status === "failed"
          ? (args.errorMessage ?? "Due diligence failed.").slice(0, 600)
          : undefined,
      warnings: args.warnings ?? row.warnings,
      providerKind: args.providerKind ?? row.providerKind,
      providerName: args.providerName ?? row.providerName,
      model: args.model ?? row.model,
      completedAt: completed,
    });
    return null;
  },
});
