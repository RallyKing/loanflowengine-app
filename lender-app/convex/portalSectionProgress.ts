/**
 * Custom portal status-bar step completion — reuses portalDefaults composition,
 * stores progress for automation-ready events (`portal.status_step.completed`).
 */

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./clientPortalCrypto";
import { normalizePortalToken } from "../lib/portalToken";
import { loadLinkByTokenHash } from "./clientPortalLinks";

const EVENT_TYPE = "portal.status_step.completed" as const;

async function resolveBundleFile(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<{
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations"> | undefined;
  actorKey: string;
} | null> {
  const trimmed = normalizePortalToken(token);
  if (!trimmed) return null;
  const tokenHash = await sha256Hex(trimmed);
  const link = await loadLinkByTokenHash(ctx, tokenHash);
  let pipelineFileId: Id<"pipeline"> | null = null;
  let actorKey = "portal_viewer";
  if (link?.bundleTokenId) {
    pipelineFileId = link.pipelineFileId;
    actorKey = link.emailKey?.trim() || `link:${String(link._id)}`;
  } else {
    const legacy = await ctx.db
      .query("documentVaultClientBundleTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!legacy) return null;
    pipelineFileId = legacy.pipelineFileId;
    actorKey = `bundle:${String(legacy._id)}`;
  }
  const pipeline = await ctx.db.get(pipelineFileId);
  if (!pipeline) return null;
  return {
    pipelineFileId,
    organizationId: pipeline.organizationId,
    actorKey,
  };
}

export const listCompletedStepsForBundle = query({
  args: {
    token: v.string(),
    sectionInstanceId: v.string(),
  },
  returns: v.array(
    v.object({
      stepId: v.string(),
      completedAt: v.number(),
      eventType: v.literal(EVENT_TYPE),
    }),
  ),
  handler: async (ctx, { token, sectionInstanceId }) => {
    const auth = await resolveBundleFile(ctx, token);
    if (!auth) return [];
    const rows = await ctx.db
      .query("portalSectionStepProgress")
      .withIndex("by_file_section", (q) =>
        q
          .eq("pipelineFileId", auth.pipelineFileId)
          .eq("sectionInstanceId", sectionInstanceId),
      )
      .collect();
    return rows.map((r) => ({
      stepId: r.stepId,
      completedAt: r.completedAt,
      eventType: r.eventType,
    }));
  },
});

export const completeStatusStepForBundle = mutation({
  args: {
    token: v.string(),
    sectionInstanceId: v.string(),
    stepId: v.string(),
    portalDefaultId: v.optional(v.id("portalDefaults")),
  },
  returns: v.object({
    ok: v.boolean(),
    eventType: v.literal(EVENT_TYPE),
    stepId: v.string(),
    completedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const auth = await resolveBundleFile(ctx, args.token);
    if (!auth?.organizationId) {
      throw new Error("This portal link is invalid.");
    }
    const stepId = args.stepId.trim().slice(0, 64);
    const sectionInstanceId = args.sectionInstanceId.trim().slice(0, 64);
    if (!stepId || !sectionInstanceId) {
      throw new Error("Missing status step.");
    }

    const existing = await ctx.db
      .query("portalSectionStepProgress")
      .withIndex("by_file_step", (q) =>
        q.eq("pipelineFileId", auth.pipelineFileId).eq("stepId", stepId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      return {
        ok: true,
        eventType: EVENT_TYPE,
        stepId,
        completedAt: existing.completedAt,
      };
    }

    await ctx.db.insert("portalSectionStepProgress", {
      organizationId: auth.organizationId,
      pipelineFileId: auth.pipelineFileId,
      portalDefaultId: args.portalDefaultId,
      sectionInstanceId,
      stepId,
      completedAt: now,
      completedByKey: auth.actorKey.slice(0, 200),
      eventType: EVENT_TYPE,
    });

    // Stable event payload for future automation subscribers (logged for observability).
    console.log(
      JSON.stringify({
        type: EVENT_TYPE,
        stepId,
        sectionInstanceId,
        pipelineFileId: auth.pipelineFileId,
        portalDefaultId: args.portalDefaultId,
        completedAt: now,
      }),
    );

    return {
      ok: true,
      eventType: EVENT_TYPE,
      stepId,
      completedAt: now,
    };
  },
});
