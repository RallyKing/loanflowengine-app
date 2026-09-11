/**
 * Org-scoped internal workflow checklist templates.
 * Applied to `dealData.workflow` on pipeline files (Portals & Progress).
 */

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgMemberKey,
} from "./authUtils";

const memberUserKeyArg = { memberUserKey: v.optional(v.string()) };

const MAX_NAME_LEN = 120;
const MAX_DESC_LEN = 400;
const MAX_STEPS = 40;
const MAX_LABEL_LEN = 160;
const MAX_STEP_ID_LEN = 64;

const stepV = v.object({
  id: v.string(),
  label: v.string(),
});

const publicRowV = v.object({
  _id: v.id("internalWorkflowTemplates"),
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  steps: v.array(stepV),
  archivedAt: v.optional(v.number()),
  createdByUserKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  stepCount: v.number(),
});

async function requireOrgReader(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "internalWorkflowTemplates.requireOrgReader",
  );
}

async function requireOrgFileEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgMemberKey(ctx, organizationId, memberUserKey, {
    permission: "files.edit",
    stage: "internalWorkflowTemplates.requireOrgFileEditor",
  });
}

function sanitizeSteps(
  raw: readonly { id: string; label: string }[],
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, MAX_STEPS)) {
    const label = row.label?.trim().slice(0, MAX_LABEL_LEN) ?? "";
    if (!label) continue;
    let id = row.id?.trim().slice(0, MAX_STEP_ID_LEN) ?? "";
    if (!id || seen.has(id)) {
      id = `iwf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

function publicRow(row: {
  _id: Id<"internalWorkflowTemplates">;
  organizationId: Id<"organizations">;
  name: string;
  description?: string;
  steps: Array<{ id: string; label: string }>;
  archivedAt?: number;
  createdByUserKey: string;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    _id: row._id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    steps: row.steps,
    archivedAt: row.archivedAt,
    createdByUserKey: row.createdByUserKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stepCount: row.steps.length,
  };
}

export const listForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    includeArchived: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  returns: v.array(publicRowV),
  handler: async (ctx, { organizationId, memberUserKey, includeArchived }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const rows = await ctx.db
      .query("internalWorkflowTemplates")
      .withIndex("by_organization_updated", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(80);
    const filtered = includeArchived
      ? rows
      : rows.filter((r) => r.archivedAt == null);
    return filtered.map(publicRow);
  },
});

export const get = query({
  args: {
    id: v.id("internalWorkflowTemplates"),
    ...memberUserKeyArg,
  },
  returns: v.union(publicRowV, v.null()),
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await requireOrgReader(ctx, row.organizationId, memberUserKey);
    return publicRow(row);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(stepV),
    ...memberUserKeyArg,
  },
  returns: v.object({ templateId: v.id("internalWorkflowTemplates") }),
  handler: async (ctx, args) => {
    const key = await requireOrgFileEditor(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const name = args.name.trim().slice(0, MAX_NAME_LEN);
    if (!name) throw new Error("Template name is required.");
    const steps = sanitizeSteps(args.steps);
    if (steps.length === 0) {
      throw new Error("Add at least one checklist step.");
    }
    const description = args.description?.trim().slice(0, MAX_DESC_LEN);
    const now = Date.now();
    const templateId = await ctx.db.insert("internalWorkflowTemplates", {
      organizationId: args.organizationId,
      name,
      description: description || undefined,
      steps,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });
    return { templateId };
  },
});

export const update = mutation({
  args: {
    id: v.id("internalWorkflowTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    steps: v.optional(v.array(stepV)),
    ...memberUserKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Template not found.");
    await requireOrgFileEditor(ctx, row.organizationId, args.memberUserKey);
    const patch: {
      name?: string;
      description?: string;
      steps?: Array<{ id: string; label: string }>;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, MAX_NAME_LEN);
      if (!name) throw new Error("Template name is required.");
      patch.name = name;
    }
    if (args.description !== undefined) {
      const description = args.description.trim().slice(0, MAX_DESC_LEN);
      patch.description = description || undefined;
    }
    if (args.steps !== undefined) {
      const steps = sanitizeSteps(args.steps);
      if (steps.length === 0) {
        throw new Error("Add at least one checklist step.");
      }
      patch.steps = steps;
    }
    await ctx.db.patch(args.id, patch);
    return { ok: true as const };
  },
});

export const archive = mutation({
  args: {
    id: v.id("internalWorkflowTemplates"),
    ...memberUserKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Template not found.");
    await requireOrgFileEditor(ctx, row.organizationId, args.memberUserKey);
    await ctx.db.patch(args.id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const restore = mutation({
  args: {
    id: v.id("internalWorkflowTemplates"),
    ...memberUserKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Template not found.");
    await requireOrgFileEditor(ctx, row.organizationId, args.memberUserKey);
    await ctx.db.patch(args.id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
