/**
 * Post-migration referential integrity: scan, report, and quarantine-based repair.
 * - `scan` / `repairRepairable`: global admin (`memberUserKey`).
 * - `operatorScan` / `operatorRepairRepairable`: `DATA_MIGRATION_ADMIN_SECRET` (operator scripts).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { sessionKeyIsGlobalAdmin } from "./organizationAccess";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";

export type ReferentialIntegrityScanSummary = {
  validCounts: {
    contactFileLinks: number;
    contactLenderLinks: number;
    lenderAttachments: number;
    taskAttachments: number;
    libraryDocumentLinks: number;
    fileMessageAttachments: number;
  };
  repairable: Array<Record<string, unknown>>;
  irrecoverable: Array<Record<string, unknown>>;
};

function snapshotJson(row: unknown): string {
  try {
    return JSON.stringify(row);
  } catch {
    return "{\"error\":\"serialize_failed\"}";
  }
}

async function quarantineAndDelete(
  ctx: MutationCtx,
  sourceTable: string,
  row: { _id: string },
  reason: string,
) {
  await ctx.db.insert("referentialIntegrityQuarantine", {
    sourceTable,
    sourceId: String(row._id),
    snapshotJson: snapshotJson(row),
    reason,
    createdAt: Date.now(),
  });
  await ctx.db.delete(row._id as never);
}

async function buildScanSummary(ctx: QueryCtx): Promise<ReferentialIntegrityScanSummary> {
  const summary: ReferentialIntegrityScanSummary = {
    validCounts: {
      contactFileLinks: 0,
      contactLenderLinks: 0,
      lenderAttachments: 0,
      taskAttachments: 0,
      libraryDocumentLinks: 0,
      fileMessageAttachments: 0,
    },
    repairable: [],
    irrecoverable: [],
  };

  const cap = 500;
  const pushRep = (row: Record<string, unknown>) => {
    if (summary.repairable.length < cap) summary.repairable.push(row);
  };
  const pushIrr = (row: Record<string, unknown>) => {
    if (summary.irrecoverable.length < cap) summary.irrecoverable.push(row);
  };

  for (const link of await ctx.db.query("contactFileLinks").collect()) {
    const c = await ctx.db.get(link.contactId);
    const f = await ctx.db.get(link.fileId);
    if (!c && !f) {
      pushRep({
        table: "contactFileLinks",
        id: link._id,
        reason: "missing_contact_and_file",
      });
    } else if (!c) {
      pushRep({
        table: "contactFileLinks",
        id: link._id,
        reason: "missing_contact",
      });
    } else if (!f) {
      pushRep({
        table: "contactFileLinks",
        id: link._id,
        reason: "missing_pipeline_file",
      });
    } else if (
      c.organizationId &&
      f.organizationId &&
      c.organizationId !== f.organizationId
    ) {
      pushRep({
        table: "contactFileLinks",
        id: link._id,
        reason: "org_mismatch",
      });
    } else {
      summary.validCounts.contactFileLinks++;
    }
  }

  for (const link of await ctx.db.query("contactLenderLinks").collect()) {
    const c = await ctx.db.get(link.contactId);
    const lender = await ctx.db.get(link.lenderId);
    if (!c || !lender) {
      pushRep({
        table: "contactLenderLinks",
        id: link._id,
        reason: !c ? "missing_contact" : "missing_lender",
      });
    } else if (
      c.organizationId &&
      lender.organizationId &&
      c.organizationId !== lender.organizationId
    ) {
      pushRep({
        table: "contactLenderLinks",
        id: link._id,
        reason: "org_mismatch",
      });
    } else {
      summary.validCounts.contactLenderLinks++;
    }
  }

  for (const a of await ctx.db.query("lenderAttachments").collect()) {
    const lender = await ctx.db.get(a.lenderId);
    if (!lender) {
      pushRep({
        table: "lenderAttachments",
        id: a._id,
        reason: "missing_lender",
      });
      continue;
    }
    let meta: { size?: number } | null = null;
    try {
      meta = await ctx.storage.getMetadata(a.storageId);
    } catch {
      meta = null;
    }
    if (!meta) {
      pushIrr({
        table: "lenderAttachments",
        id: a._id,
        reason: "missing_storage_blob",
        note: "Row kept; URL will be null until blob restored or row removed manually.",
      });
    } else {
      summary.validCounts.lenderAttachments++;
    }
  }

  for (const a of await ctx.db.query("taskAttachments").collect()) {
    const task = await ctx.db.get(a.taskId);
    if (!task) {
      pushRep({ table: "taskAttachments", id: a._id, reason: "missing_task" });
    } else {
      summary.validCounts.taskAttachments++;
    }
  }

  for (const link of await ctx.db.query("libraryDocumentLinks").collect()) {
    const doc = await ctx.db.get(link.documentId);
    if (!doc) {
      pushRep({
        table: "libraryDocumentLinks",
        id: link._id,
        reason: "missing_document",
      });
      continue;
    }
    const pf = link.pipelineFileId
      ? await ctx.db.get(link.pipelineFileId)
      : null;
    const c = link.contactId ? await ctx.db.get(link.contactId) : null;
    const t = link.taskId ? await ctx.db.get(link.taskId) : null;
    const targets = [pf, c, t].filter(Boolean).length;
    if (
      link.pipelineFileId === undefined &&
      link.contactId === undefined &&
      link.taskId === undefined
    ) {
      pushRep({
        table: "libraryDocumentLinks",
        id: link._id,
        reason: "empty_link_targets",
      });
    } else if (targets === 0) {
      pushRep({
        table: "libraryDocumentLinks",
        id: link._id,
        reason: "all_targets_missing",
      });
    } else {
      summary.validCounts.libraryDocumentLinks++;
    }
  }

  for (const a of await ctx.db.query("fileMessageAttachments").collect()) {
    const msg = await ctx.db.get(a.messageId);
    if (!msg) {
      pushRep({
        table: "fileMessageAttachments",
        id: a._id,
        reason: "missing_message",
      });
    } else {
      summary.validCounts.fileMessageAttachments++;
    }
  }

  for (const p of await ctx.db.query("payments").collect()) {
    const ledger = await ctx.db.get(p.ledgerId);
    const file = await ctx.db.get(p.fileId);
    if (!ledger) {
      pushIrr({
        table: "payments",
        id: p._id,
        reason: "missing_ledger",
        note: "Financial row — not auto-deleted; reconcile manually.",
      });
    } else if (!file) {
      pushIrr({
        table: "payments",
        id: p._id,
        reason: "missing_pipeline_file",
        note: "Historical payment; file deleted — row kept intentionally.",
      });
    }
  }

  return summary;
}

export const scan = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, { memberUserKey }) => {
    if (!(await sessionKeyIsGlobalAdmin(ctx, memberUserKey))) {
      throw new Error("referentialIntegrity.scan requires global admin.");
    }
    return await buildScanSummary(ctx);
  },
});

/** Same as `scan`, for CI / operator hosts that have `DATA_MIGRATION_ADMIN_SECRET`. */
export const operatorScan = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    return await buildScanSummary(ctx);
  },
});

async function runRepairCore(
  ctx: MutationCtx,
  dryRun: boolean | undefined,
): Promise<{ dryRun: boolean; repaired: string[]; wouldRepair: string[] }> {
  const repaired: string[] = [];
  const wouldRepair: string[] = [];

  const maybeQ = async (
    table: string,
    row: { _id: string },
    reason: string,
  ) => {
    if (dryRun) {
      wouldRepair.push(`${table}:${String(row._id)}:${reason}`);
      return;
    }
    await quarantineAndDelete(ctx, table, row, reason);
    repaired.push(`${table}:${String(row._id)}`);
  };

  for (const link of await ctx.db.query("contactFileLinks").collect()) {
    const c = await ctx.db.get(link.contactId);
    const f = await ctx.db.get(link.fileId);
    if (!c && !f) {
      await maybeQ("contactFileLinks", link, "missing_contact_and_file");
    } else if (!c) {
      await maybeQ("contactFileLinks", link, "missing_contact");
    } else if (!f) {
      await maybeQ("contactFileLinks", link, "missing_pipeline_file");
    } else if (
      c.organizationId &&
      f.organizationId &&
      c.organizationId !== f.organizationId
    ) {
      await maybeQ("contactFileLinks", link, "org_mismatch");
    }
  }

  for (const link of await ctx.db.query("contactLenderLinks").collect()) {
    const c = await ctx.db.get(link.contactId);
    const lender = await ctx.db.get(link.lenderId);
    if (!c || !lender) {
      await maybeQ(
        "contactLenderLinks",
        link,
        !c ? "missing_contact" : "missing_lender",
      );
    } else if (
      c.organizationId &&
      lender.organizationId &&
      c.organizationId !== lender.organizationId
    ) {
      await maybeQ("contactLenderLinks", link, "org_mismatch");
    }
  }

  for (const a of await ctx.db.query("lenderAttachments").collect()) {
    const lender = await ctx.db.get(a.lenderId);
    if (!lender) {
      if (dryRun) {
        wouldRepair.push(`lenderAttachments:${String(a._id)}:missing_lender`);
      } else {
        await quarantineAndDelete(ctx, "lenderAttachments", a, "missing_lender");
        try {
          await ctx.storage.delete(a.storageId);
        } catch {
          /* best-effort */
        }
        repaired.push(`lenderAttachments:${String(a._id)}`);
      }
    }
  }

  for (const a of await ctx.db.query("taskAttachments").collect()) {
    const task = await ctx.db.get(a.taskId);
    if (!task) {
      if (dryRun) {
        wouldRepair.push(`taskAttachments:${String(a._id)}:missing_task`);
      } else {
        await quarantineAndDelete(ctx, "taskAttachments", a, "missing_task");
        try {
          await ctx.storage.delete(a.storageId);
        } catch {
          /* best-effort */
        }
        repaired.push(`taskAttachments:${String(a._id)}`);
      }
    }
  }

  for (const link of await ctx.db.query("libraryDocumentLinks").collect()) {
    const doc = await ctx.db.get(link.documentId);
    if (!doc) {
      await maybeQ("libraryDocumentLinks", link, "missing_document");
      continue;
    }
    const pf = link.pipelineFileId
      ? await ctx.db.get(link.pipelineFileId)
      : null;
    const c = link.contactId ? await ctx.db.get(link.contactId) : null;
    const t = link.taskId ? await ctx.db.get(link.taskId) : null;
    const targets = [pf, c, t].filter(Boolean).length;
    if (
      link.pipelineFileId === undefined &&
      link.contactId === undefined &&
      link.taskId === undefined
    ) {
      await maybeQ("libraryDocumentLinks", link, "empty_link_targets");
    } else if (targets === 0) {
      await maybeQ("libraryDocumentLinks", link, "all_targets_missing");
    }
  }

  for (const a of await ctx.db.query("fileMessageAttachments").collect()) {
    const msg = await ctx.db.get(a.messageId);
    if (!msg) {
      if (dryRun) {
        wouldRepair.push(
          `fileMessageAttachments:${String(a._id)}:missing_message`,
        );
      } else {
        await quarantineAndDelete(
          ctx,
          "fileMessageAttachments",
          a,
          "missing_message",
        );
        try {
          await ctx.storage.delete(a.storageId);
        } catch {
          /* best-effort */
        }
        repaired.push(`fileMessageAttachments:${String(a._id)}`);
      }
    }
  }

  return { dryRun: Boolean(dryRun), repaired, wouldRepair };
}

export const repairRepairable = mutation({
  args: {
    memberUserKey: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { memberUserKey, dryRun }) => {
    if (!(await sessionKeyIsGlobalAdmin(ctx, memberUserKey))) {
      throw new Error("referentialIntegrity.repairRepairable requires global admin.");
    }
    return await runRepairCore(ctx, dryRun);
  },
});

export const operatorRepairRepairable = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    return await runRepairCore(ctx, dryRun);
  },
});
