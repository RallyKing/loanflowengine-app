/**
 * Phase 14 Step 3 — capital stack CRUD (project edit permission only).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgMember } from "./organizationAccess";
import { resolveProjectAccessLevel } from "./resourceAccess";
import {
  buildProjectCapitalRollup,
  listAllocationsForProject,
  listRequirementsForProject,
  listSourcesForProject,
  loadProjectCapitalStackEditor,
  syncCapitalSourcesFromProjectLoans,
} from "./projectCapitalStack";
import { safeMoney } from "../lib/projectCapitalStack";

const memberUserKeyArg = { memberUserKey: v.string() };

const requirementTypeArg = v.union(
  v.literal("acquisition"),
  v.literal("rehab"),
  v.literal("refinance"),
  v.literal("working_capital"),
  v.literal("bridge"),
  v.literal("LOC"),
  v.literal("term"),
  v.literal("equity"),
  v.literal("other"),
);

const sourceTypeArg = v.union(
  v.literal("loan"),
  v.literal("LOC"),
  v.literal("term_loan"),
  v.literal("equity"),
  v.literal("cash"),
  v.literal("mezzanine"),
  v.literal("bridge"),
  v.literal("other"),
);

const sourceStatusArg = v.union(
  v.literal("planned"),
  v.literal("sourcing"),
  v.literal("approved"),
  v.literal("funded"),
  v.literal("failed"),
);

async function assertProjectEdit(
  ctx: MutationCtx,
  project: Doc<"projects">,
  memberUserKey: string,
) {
  const level = await resolveProjectAccessLevel(ctx, project, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this project's capital stack.");
  }
}

function nextSort(requirements: Array<{ sortOrder?: number; priorityOrder?: number }>): number {
  if (requirements.length === 0) return 0;
  return (
    Math.max(
      ...requirements.map((r) =>
        "priorityOrder" in r && r.priorityOrder != null
          ? r.priorityOrder
          : (r.sortOrder ?? 0),
      ),
    ) + 1
  );
}

export const getProjectCapitalStack = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      return null;
    }
    const accessLevel = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (accessLevel === "none") return null;
    const stack = await loadProjectCapitalStackEditor(ctx, project);
    return {
      ...stack,
      accessLevel,
      canEdit: accessLevel === "edit",
    };
  },
});

export const addCapitalRequirement = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    capitalType: requirementTypeArg,
    requiredAmount: v.float64(),
    notes: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const existing = await listRequirementsForProject(ctx, project._id);
    const now = Date.now();
    const id = await ctx.db.insert("projectCapitalRequirements", {
      organizationId: args.organizationId,
      projectId: project._id,
      capitalType: args.capitalType,
      requiredAmount: safeMoney(args.requiredAmount),
      priorityOrder: nextSort(existing),
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { id, rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const updateCapitalRequirement = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    requirementId: v.id("projectCapitalRequirements"),
    capitalType: v.optional(requirementTypeArg),
    requiredAmount: v.optional(v.float64()),
    notes: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const row = await ctx.db.get(args.requirementId);
    if (!row || row.projectId !== project._id) throw new Error("Requirement not found.");
    const patch: Partial<Doc<"projectCapitalRequirements">> = {
      updatedAt: Date.now(),
    };
    if (args.capitalType != null) patch.capitalType = args.capitalType;
    if (args.requiredAmount != null) patch.requiredAmount = safeMoney(args.requiredAmount);
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    await ctx.db.patch(row._id, patch);
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const removeCapitalRequirement = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    requirementId: v.id("projectCapitalRequirements"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const row = await ctx.db.get(args.requirementId);
    if (!row || row.projectId !== project._id) throw new Error("Requirement not found.");
    const allocations = await listAllocationsForProject(ctx, project._id);
    for (const a of allocations) {
      if (a.requirementId === row._id) await ctx.db.delete(a._id);
    }
    await ctx.db.delete(row._id);
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const reorderCapitalRequirements = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    orderedRequirementIds: v.array(v.id("projectCapitalRequirements")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const now = Date.now();
    let order = 0;
    for (const id of args.orderedRequirementIds) {
      const row = await ctx.db.get(id);
      if (!row || row.projectId !== project._id) continue;
      await ctx.db.patch(row._id, { priorityOrder: order++, updatedAt: now });
    }
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const addCapitalSource = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sourceType: sourceTypeArg,
    pipelineId: v.optional(v.id("pipeline")),
    committedAmount: v.optional(v.float64()),
    approvedAmount: v.optional(v.float64()),
    fundedAmount: v.optional(v.float64()),
    status: v.optional(sourceStatusArg),
    notes: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    if (args.pipelineId) {
      const loan = await ctx.db.get(args.pipelineId);
      if (!loan || loan.projectId !== project._id) {
        throw new Error("Loan file must belong to this project.");
      }
    }
    const existing = await listSourcesForProject(ctx, project._id);
    const now = Date.now();
    const id = await ctx.db.insert("projectCapitalSources", {
      organizationId: args.organizationId,
      projectId: project._id,
      pipelineId: args.pipelineId,
      sourceType: args.sourceType,
      committedAmount: safeMoney(args.committedAmount ?? 0),
      approvedAmount: safeMoney(args.approvedAmount ?? 0),
      fundedAmount: safeMoney(args.fundedAmount ?? 0),
      status: args.status ?? "planned",
      sortOrder: nextSort(existing),
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    if (args.pipelineId) {
      await syncCapitalSourcesFromProjectLoans(ctx, project._id);
    }
    return { id, rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const updateCapitalSource = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sourceId: v.id("projectCapitalSources"),
    sourceType: v.optional(sourceTypeArg),
    pipelineId: v.optional(v.union(v.id("pipeline"), v.null())),
    committedAmount: v.optional(v.float64()),
    approvedAmount: v.optional(v.float64()),
    fundedAmount: v.optional(v.float64()),
    status: v.optional(sourceStatusArg),
    notes: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const row = await ctx.db.get(args.sourceId);
    if (!row || row.projectId !== project._id) throw new Error("Source not found.");
    const patch: Partial<Doc<"projectCapitalSources">> = { updatedAt: Date.now() };
    if (args.sourceType != null) patch.sourceType = args.sourceType;
    if (args.pipelineId !== undefined) {
      if (args.pipelineId === null) {
        patch.pipelineId = undefined;
      } else {
        const loan = await ctx.db.get(args.pipelineId);
        if (!loan || loan.projectId !== project._id) {
          throw new Error("Loan file must belong to this project.");
        }
        patch.pipelineId = args.pipelineId;
      }
    }
    if (args.committedAmount != null) patch.committedAmount = safeMoney(args.committedAmount);
    if (args.approvedAmount != null) patch.approvedAmount = safeMoney(args.approvedAmount);
    if (args.fundedAmount != null) patch.fundedAmount = safeMoney(args.fundedAmount);
    if (args.status != null) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    await ctx.db.patch(row._id, patch);
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const removeCapitalSource = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sourceId: v.id("projectCapitalSources"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const row = await ctx.db.get(args.sourceId);
    if (!row || row.projectId !== project._id) throw new Error("Source not found.");
    const allocations = await listAllocationsForProject(ctx, project._id);
    for (const a of allocations) {
      if (a.sourceId === row._id) await ctx.db.delete(a._id);
    }
    await ctx.db.delete(row._id);
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const reorderCapitalSources = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    orderedSourceIds: v.array(v.id("projectCapitalSources")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const now = Date.now();
    let order = 0;
    for (const id of args.orderedSourceIds) {
      const row = await ctx.db.get(id);
      if (!row || row.projectId !== project._id) continue;
      await ctx.db.patch(row._id, { sortOrder: order++, updatedAt: now });
    }
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const setCapitalAllocation = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sourceId: v.id("projectCapitalSources"),
    requirementId: v.id("projectCapitalRequirements"),
    allocatedAmount: v.float64(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const source = await ctx.db.get(args.sourceId);
    const requirement = await ctx.db.get(args.requirementId);
    if (!source || source.projectId !== project._id) throw new Error("Source not found.");
    if (!requirement || requirement.projectId !== project._id) {
      throw new Error("Requirement not found.");
    }
    const amount = safeMoney(args.allocatedAmount);
    const existing = await ctx.db
      .query("projectCapitalAllocations")
      .withIndex("by_source_requirement", (q) =>
        q.eq("sourceId", args.sourceId).eq("requirementId", args.requirementId),
      )
      .first();
    const now = Date.now();
    if (amount <= 0) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { allocatedAmount: amount, updatedAt: now });
    } else {
      await ctx.db.insert("projectCapitalAllocations", {
        organizationId: args.organizationId,
        projectId: project._id,
        sourceId: args.sourceId,
        requirementId: args.requirementId,
        allocatedAmount: amount,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});

export const syncProjectCapitalFromLoans = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const updated = await syncCapitalSourcesFromProjectLoans(ctx, project._id);
    return { updated, rollup: await buildProjectCapitalRollup(ctx, project._id) };
  },
});
