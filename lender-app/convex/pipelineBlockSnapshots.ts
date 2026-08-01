import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

async function loadPipeline(
  ctx: { db: { get: (id: Id<"pipeline">) => Promise<Doc<"pipeline"> | null> } },
  pipelineFileId: Id<"pipeline">,
) {
  const row = await ctx.db.get(pipelineFileId);
  if (!row) throw new Error("Pipeline file not found.");
  return row;
}

export const listForBlock = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    blockId: v.string(),
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, blockId, fileTaskId, memberUserKey }) => {
    const pipeline = await loadPipeline(ctx, pipelineFileId);
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);

    let rows = await ctx.db
      .query("pipelineBlockSnapshots")
      .withIndex("by_pipeline_block", (q) =>
        q.eq("pipelineFileId", pipelineFileId).eq("blockId", blockId.trim()),
      )
      .collect();

    if (fileTaskId) {
      rows = rows.filter(
        (r) => !r.fileTaskId || String(r.fileTaskId) === String(fileTaskId),
      );
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map((r) => ({
      _id: r._id,
      blockId: r.blockId,
      fileTaskId: r.fileTaskId,
      source: r.source,
      label: r.label,
      createdAt: r.createdAt,
      createdByUserKey: r.createdByUserKey,
    }));
  },
});

export const restoreSnapshot = mutation({
  args: {
    snapshotId: v.id("pipelineBlockSnapshots"),
    ...memberKeyArg,
  },
  handler: async (ctx, { snapshotId, memberUserKey }) => {
    const snap = await ctx.db.get(snapshotId);
    if (!snap) throw new Error("Snapshot not found.");
    const pipeline = await loadPipeline(ctx, snap.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const layout = pipeline.fileDrawerLayout ?? {
      v: 1 as const,
      order: [],
      hidden: [],
    };
    const settings = { ...(layout.settings ?? {}) };
    settings[snap.blockId] = snap.snapshotData;

    await ctx.db.patch(snap.pipelineFileId, {
      fileDrawerLayout: {
        ...layout,
        settings,
      },
      updatedAt: Date.now(),
    });

    await ctx.db.insert("pipelineBlockSnapshots", {
      pipelineFileId: snap.pipelineFileId,
      blockId: snap.blockId,
      fileTaskId: snap.fileTaskId,
      snapshotData: settings[snap.blockId],
      source: "broker_restore",
      label: `Restored from ${new Date(snap.createdAt).toLocaleString()}`,
      createdByUserKey: memberUserKey?.trim() || "__system__",
      createdAt: Date.now(),
    });

    return { ok: true as const, blockId: snap.blockId };
  },
});

export async function snapshotBlockSettings(
  ctx: {
    db: {
      insert: (
        table: "pipelineBlockSnapshots",
        value: Omit<Doc<"pipelineBlockSnapshots">, "_id" | "_creationTime">,
      ) => Promise<Id<"pipelineBlockSnapshots">>;
    };
  },
  args: {
    pipelineFileId: Id<"pipeline">;
    blockId: string;
    fileTaskId?: Id<"documentVaultFileTasks">;
    snapshotData: unknown;
    source: Doc<"pipelineBlockSnapshots">["source"];
    createdByUserKey: string;
    label?: string;
  },
) {
  return await ctx.db.insert("pipelineBlockSnapshots", {
    pipelineFileId: args.pipelineFileId,
    blockId: args.blockId,
    fileTaskId: args.fileTaskId,
    snapshotData: args.snapshotData,
    source: args.source,
    label: args.label,
    createdByUserKey: args.createdByUserKey,
    createdAt: Date.now(),
  });
}
