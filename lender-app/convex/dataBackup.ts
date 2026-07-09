import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DATA_BACKUP_PAGES_PER_ACTION,
  DATA_BACKUP_PAGE_SIZE,
  DATA_BACKUP_RETENTION_COMPLETE,
  DATA_BACKUP_STALE_RUNNING_MS,
  DATA_BACKUP_TABLE_ORDER,
  DATA_BACKUP_TABLE_SET,
} from "./backupRegistry";

function assertBackupAdmin(secret: string) {
  const expected = process.env.DATA_BACKUP_ADMIN_SECRET?.trim();
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized.");
  }
}

async function cleanupSnapshotPartsAndManifest(
  ctx: MutationCtx,
  snapshotId: Id<"dataBackupSnapshots">,
) {
  const snap = await ctx.db.get(snapshotId);
  const parts = await ctx.db
    .query("dataBackupParts")
    .withIndex("by_snapshot_table_seq", (q) => q.eq("snapshotId", snapshotId))
    .collect();
  for (const p of parts) {
    try {
      await ctx.storage.delete(p.storageId);
    } catch {
      /* best-effort */
    }
    await ctx.db.delete(p._id);
  }
  if (snap?.manifestStorageId) {
    try {
      await ctx.storage.delete(snap.manifestStorageId);
    } catch {
      /* best-effort */
    }
  }
}

export const exportTablePage = internalQuery({
  args: {
    tableName: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { tableName, cursor }) => {
    if (!DATA_BACKUP_TABLE_SET.has(tableName)) {
      throw new Error(`Not a registered backup table: ${tableName}`);
    }
    const page = await (ctx.db as any).query(tableName).paginate({
      numItems: DATA_BACKUP_PAGE_SIZE,
      cursor: cursor === undefined ? null : cursor,
    });
    return {
      docs: page.page,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getSnapshot = internalQuery({
  args: { snapshotId: v.id("dataBackupSnapshots") },
  handler: async (ctx, { snapshotId }) => await ctx.db.get(snapshotId),
});

export const buildManifest = internalQuery({
  args: { snapshotId: v.id("dataBackupSnapshots") },
  handler: async (ctx, { snapshotId }) => {
    const parts = await ctx.db
      .query("dataBackupParts")
      .withIndex("by_snapshot_table_seq", (q) => q.eq("snapshotId", snapshotId))
      .collect();
    parts.sort((a, b) => {
      const oa = DATA_BACKUP_TABLE_ORDER.indexOf(
        a.tableName as (typeof DATA_BACKUP_TABLE_ORDER)[number],
      );
      const ob = DATA_BACKUP_TABLE_ORDER.indexOf(
        b.tableName as (typeof DATA_BACKUP_TABLE_ORDER)[number],
      );
      const ia = oa === -1 ? 9999 : oa;
      const ib = ob === -1 ? 9999 : ob;
      if (ia !== ib) return ia - ib;
      return a.sequence - b.sequence;
    });
    let estimatedTotalBytes = 0;
    const partEntries = parts.map((p) => {
      estimatedTotalBytes += p.byteSize ?? 0;
      return {
        tableName: p.tableName,
        sequence: p.sequence,
        storageId: p.storageId,
        docCount: p.docCount,
      };
    });
    return {
      version: 1 as const,
      snapshotId,
      schemaHint: "convex-ndjson-v1",
      importOrder: [...DATA_BACKUP_TABLE_ORDER],
      parts: partEntries,
      estimatedTotalBytes,
    };
  },
});

export const recordPart = internalMutation({
  args: {
    snapshotId: v.id("dataBackupSnapshots"),
    tableName: v.string(),
    storageId: v.id("_storage"),
    docCount: v.number(),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dataBackupParts")
      .withIndex("by_snapshot_table_seq", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("tableName", args.tableName),
      )
      .collect();
    let maxSeq = -1;
    for (const p of existing) maxSeq = Math.max(maxSeq, p.sequence);
    await ctx.db.insert("dataBackupParts", {
      snapshotId: args.snapshotId,
      tableName: args.tableName,
      sequence: maxSeq + 1,
      storageId: args.storageId,
      docCount: args.docCount,
      byteSize: args.byteSize,
    });
  },
});

export const saveProgress = internalMutation({
  args: {
    snapshotId: v.id("dataBackupSnapshots"),
    tableIndex: v.number(),
    progressCursor: v.optional(v.string()),
    clearCursor: v.optional(v.boolean()),
  },
  handler: async (ctx, { snapshotId, tableIndex, progressCursor, clearCursor }) => {
    await ctx.db.patch(snapshotId, {
      progressTableIndex: tableIndex,
      progressCursor: clearCursor ? undefined : progressCursor,
    });
  },
});

export const markComplete = internalMutation({
  args: {
    snapshotId: v.id("dataBackupSnapshots"),
    manifestStorageId: v.id("_storage"),
    totalBytes: v.number(),
    partCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.snapshotId, {
      status: "complete",
      completedAt: Date.now(),
      manifestStorageId: args.manifestStorageId,
      totalBytes: args.totalBytes,
      partCount: args.partCount,
      progressTableIndex: undefined,
      progressCursor: undefined,
      error: undefined,
    });
  },
});

export const markFailed = internalMutation({
  args: {
    snapshotId: v.id("dataBackupSnapshots"),
    error: v.string(),
  },
  handler: async (ctx, { snapshotId, error }) => {
    await cleanupSnapshotPartsAndManifest(ctx, snapshotId);
    await ctx.db.patch(snapshotId, {
      status: "failed",
      completedAt: Date.now(),
      error: error.slice(0, 2000),
      progressTableIndex: undefined,
      progressCursor: undefined,
      manifestStorageId: undefined,
      totalBytes: undefined,
      partCount: undefined,
    });
  },
});

export const pruneOldBackups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const complete = await ctx.db
      .query("dataBackupSnapshots")
      .withIndex("by_status_started", (q) => q.eq("status", "complete"))
      .order("desc")
      .collect();
    if (complete.length <= DATA_BACKUP_RETENTION_COMPLETE) return;

    const victims = complete.slice(DATA_BACKUP_RETENTION_COMPLETE);
    for (const snap of victims) {
      await cleanupSnapshotPartsAndManifest(ctx, snap._id);
      await ctx.db.delete(snap._id);
    }
  },
});

/** Scheduled + default manual backup (respects `DATA_BACKUP_ENABLED`). */
export const enqueueFullBackup = internalMutation({
  args: { ignoreDisabled: v.optional(v.boolean()) },
  handler: async (ctx, { ignoreDisabled }) => {
    if (!ignoreDisabled) {
      const env = process.env.DATA_BACKUP_ENABLED?.trim().toLowerCase();
      if (env === "0" || env === "false" || env === "off") return;
    }

    const running = await ctx.db
      .query("dataBackupSnapshots")
      .withIndex("by_status_started", (q) => q.eq("status", "running"))
      .first();
    if (running) {
      if (Date.now() - running.startedAt < DATA_BACKUP_STALE_RUNNING_MS) {
        return;
      }
      await cleanupSnapshotPartsAndManifest(ctx, running._id);
      await ctx.db.patch(running._id, {
        status: "failed",
        completedAt: Date.now(),
        error: "abandoned_stale_run",
        progressTableIndex: undefined,
        progressCursor: undefined,
        manifestStorageId: undefined,
        totalBytes: undefined,
        partCount: undefined,
      });
    }

    const snapshotId = await ctx.db.insert("dataBackupSnapshots", {
      startedAt: Date.now(),
      status: "running",
      progressTableIndex: 0,
    });
    await ctx.scheduler.runAfter(0, internal.dataBackup.executeBackupPass, {
      snapshotId,
    });
  },
});

export const runScheduledBackup = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.dataBackup.enqueueFullBackup, {});
  },
});

export const executeBackupPass = internalAction({
  args: { snapshotId: v.id("dataBackupSnapshots") },
  handler: async (ctx, { snapshotId }) => {
    try {
      const snap: Doc<"dataBackupSnapshots"> | null = await ctx.runQuery(
        internal.dataBackup.getSnapshot,
        { snapshotId },
      );
      if (!snap || snap.status !== "running") return;

      let tableIndex = snap.progressTableIndex ?? 0;
      let cursor: string | undefined = snap.progressCursor ?? undefined;
      let pagesProcessed = 0;

      while (
        pagesProcessed < DATA_BACKUP_PAGES_PER_ACTION &&
        tableIndex < DATA_BACKUP_TABLE_ORDER.length
      ) {
        const tableName = DATA_BACKUP_TABLE_ORDER[tableIndex]!;
        const page = await ctx.runQuery(internal.dataBackup.exportTablePage, {
          tableName,
          cursor,
        });

        if (page.docs.length > 0) {
          const lines =
            page.docs.map((d: unknown) => JSON.stringify(d)).join("\n") + "\n";
          const blob = new Blob([lines], { type: "application/x-ndjson" });
          const storageId = await ctx.storage.store(blob);
          await ctx.runMutation(internal.dataBackup.recordPart, {
            snapshotId,
            tableName,
            storageId,
            docCount: page.docs.length,
            byteSize: lines.length,
          });
          pagesProcessed++;
        }

        if (page.isDone) {
          tableIndex += 1;
          cursor = undefined;
          await ctx.runMutation(internal.dataBackup.saveProgress, {
            snapshotId,
            tableIndex,
            clearCursor: true,
          });
        } else {
          cursor = page.continueCursor;
          await ctx.runMutation(internal.dataBackup.saveProgress, {
            snapshotId,
            tableIndex,
            progressCursor: cursor,
          });
          if (pagesProcessed >= DATA_BACKUP_PAGES_PER_ACTION) break;
        }
      }

      if (tableIndex >= DATA_BACKUP_TABLE_ORDER.length) {
        const manifest = await ctx.runQuery(internal.dataBackup.buildManifest, {
          snapshotId,
        });
        const manifestJson = JSON.stringify(manifest);
        const manifestStorageId = await ctx.storage.store(
          new Blob([manifestJson], { type: "application/json" }),
        );
        await ctx.runMutation(internal.dataBackup.markComplete, {
          snapshotId,
          manifestStorageId,
          totalBytes: manifest.estimatedTotalBytes + manifestJson.length,
          partCount: manifest.parts.length,
        });
        await ctx.runMutation(internal.dataBackup.pruneOldBackups, {});
        return;
      }

      await ctx.scheduler.runAfter(0, internal.dataBackup.executeBackupPass, {
        snapshotId,
      });
    } catch (e) {
      await ctx.runMutation(internal.dataBackup.markFailed, {
        snapshotId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

export const requestManualBackup = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertBackupAdmin(adminSecret);
    await ctx.runMutation(internal.dataBackup.enqueueFullBackup, {
      ignoreDisabled: true,
    });
    return { ok: true as const };
  },
});

export const listDataBackups = query({
  args: { adminSecret: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { adminSecret, limit }) => {
    assertBackupAdmin(adminSecret);
    const cap = Math.min(80, Math.max(5, limit ?? 40));
    const rows = await ctx.db.query("dataBackupSnapshots").collect();
    rows.sort((a, b) => b.startedAt - a.startedAt);
    return rows.slice(0, cap);
  },
});

/** Ordered restore plan with signed URLs for each NDJSON chunk (short-lived). */
export const getRestorePlanJson = query({
  args: { adminSecret: v.string(), snapshotId: v.id("dataBackupSnapshots") },
  handler: async (ctx, { adminSecret, snapshotId }) => {
    assertBackupAdmin(adminSecret);
    const snap = await ctx.db.get(snapshotId);
    if (!snap || snap.status !== "complete") {
      throw new Error("Snapshot not found or not complete.");
    }
    const parts = await ctx.db
      .query("dataBackupParts")
      .withIndex("by_snapshot_table_seq", (q) => q.eq("snapshotId", snapshotId))
      .collect();
    parts.sort((a, b) => {
      const oa = DATA_BACKUP_TABLE_ORDER.indexOf(
        a.tableName as (typeof DATA_BACKUP_TABLE_ORDER)[number],
      );
      const ob = DATA_BACKUP_TABLE_ORDER.indexOf(
        b.tableName as (typeof DATA_BACKUP_TABLE_ORDER)[number],
      );
      const ia = oa === -1 ? 9999 : oa;
      const ib = ob === -1 ? 9999 : ob;
      if (ia !== ib) return ia - ib;
      return a.sequence - b.sequence;
    });
    const items: Array<{
      tableName: string;
      sequence: number;
      docCount: number;
      url: string;
    }> = [];
    for (const p of parts) {
      const url = await ctx.storage.getUrl(p.storageId);
      if (url) {
        items.push({
          tableName: p.tableName,
          sequence: p.sequence,
          docCount: p.docCount,
          url,
        });
      }
    }
    return {
      snapshotId,
      manifestStorageId: snap.manifestStorageId,
      importOrder: [...DATA_BACKUP_TABLE_ORDER],
      parts: items,
    };
  },
});

export const getManifestDownloadUrl = query({
  args: { adminSecret: v.string(), snapshotId: v.id("dataBackupSnapshots") },
  handler: async (ctx, { adminSecret, snapshotId }) => {
    assertBackupAdmin(adminSecret);
    const snap = await ctx.db.get(snapshotId);
    if (!snap?.manifestStorageId) {
      throw new Error("Manifest not available.");
    }
    const url = await ctx.storage.getUrl(snap.manifestStorageId);
    if (!url) throw new Error("Could not create download URL.");
    return { url };
  },
});
