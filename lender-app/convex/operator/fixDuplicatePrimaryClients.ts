/**
 * Phase 15 Step 8 — production cleanup: duplicate primary client edges on files.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { findFileClientEdge, upsertFileClientEdge } from "../indexedGraphEdgeSync";

type RepairLog = {
  fileId: string;
  fkPrimaryClientId: string | null;
  actions: string[];
};

export const runFixDuplicatePrimaryClients = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    pass: boolean;
    scannedFiles: number;
    repairedFiles: number;
    demotedLoanLinks: number;
    demotedFileEdges: number;
    deletedDuplicatePrimaryRows: number;
    logs: RepairLog[];
  }> => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun !== false;
    const limit = args.limit ?? 10_000;

    const files = await ctx.db.query("pipeline").collect();
    const scoped = args.organizationId
      ? files.filter((f) => String(f.organizationId) === String(args.organizationId))
      : files.filter((f) => f.organizationId != null);

    let demotedLoanLinks = 0;
    let demotedFileEdges = 0;
    let deletedDuplicatePrimaryRows = 0;
    const logs: RepairLog[] = [];

    const now = Date.now();
    for (const file of scoped.slice(0, limit)) {
      const fkPrimary = file.clientId ? String(file.clientId) : null;
      const actions: string[] = [];

      const loanLinks = await ctx.db
        .query("loanClients")
        .withIndex("by_pipeline", (q) => q.eq("pipelineId", file._id))
        .collect();
      const fileEdges = await ctx.db
        .query("fileClients")
        .withIndex("by_file", (q) => q.eq("fileId", file._id))
        .collect();

      const loanPrimaries = loanLinks.filter((l) => l.relationshipType === "primary");
      const filePrimaries = fileEdges.filter((e) => e.relationshipType === "primary");

      const fkLoan = fkPrimary
        ? loanPrimaries.filter((l) => String(l.clientId) === fkPrimary)
        : [];
      const fkFile = fkPrimary
        ? filePrimaries.filter((e) => String(e.clientId) === fkPrimary)
        : [];

      // Delete duplicate "primary" rows for the FK primary (keep one).
      for (const list of [fkLoan, fkFile] as const) {
        if (list.length <= 1) continue;
        const dupes = list.slice(1);
        actions.push(`delete_duplicate_primary:${dupes.length}`);
        if (!dryRun) {
          for (const d of dupes) {
            await ctx.db.delete(d._id);
            deletedDuplicatePrimaryRows += 1;
          }
        } else {
          deletedDuplicatePrimaryRows += dupes.length;
        }
      }

      // Demote any non-FK primary to secondary (coborrower).
      for (const l of loanPrimaries) {
        if (fkPrimary && String(l.clientId) === fkPrimary) continue;
        actions.push(`demote_loan_primary:${String(l.clientId)}`);
        demotedLoanLinks += 1;
        if (!dryRun) {
          await ctx.db.patch(l._id, {
            relationshipType: "coborrower",
            sortOrder: Math.max(1, l.sortOrder),
            updatedAt: now,
          });
        }
      }
      for (const e of filePrimaries) {
        if (fkPrimary && String(e.clientId) === fkPrimary) continue;
        actions.push(`demote_file_edge_primary:${String(e.clientId)}`);
        demotedFileEdges += 1;
        if (!dryRun) {
          await ctx.db.patch(e._id, {
            relationshipType: "coborrower",
            sortOrder: Math.max(1, e.sortOrder),
            updatedAt: now,
          });
        }
      }

      // Ensure FK primary edge exists (fileClients + loanClients) if FK exists.
      if (file.clientId && file.organizationId) {
        const fkId = file.clientId;
        const existingLoan = await ctx.db
          .query("loanClients")
          .withIndex("by_pipeline_client", (q) =>
            q.eq("pipelineId", file._id).eq("clientId", fkId),
          )
          .first();
        if (!existingLoan) {
          actions.push("insert_missing_fk_primary_loan");
          if (!dryRun) {
            await ctx.db.insert("loanClients", {
              organizationId: file.organizationId,
              pipelineId: file._id,
              clientId: fkId,
              relationshipType: "primary",
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
        } else if (
          existingLoan.relationshipType !== "primary" ||
          existingLoan.sortOrder !== 0
        ) {
          actions.push("patch_fk_primary_loan");
          if (!dryRun) {
            await ctx.db.patch(existingLoan._id, {
              relationshipType: "primary",
              sortOrder: 0,
              updatedAt: now,
            });
          }
        }

        const existingFile = await findFileClientEdge(ctx, file._id, fkId);
        if (!existingFile) {
          actions.push("insert_missing_fk_primary_file_edge");
          if (!dryRun) {
            await upsertFileClientEdge(ctx, {
              organizationId: file.organizationId,
              fileId: file._id,
              clientId: fkId,
              relationshipType: "primary",
              sortOrder: 0,
              actor: "__fix_dupe_primary__",
            });
          }
        } else if (
          existingFile.relationshipType !== "primary" ||
          existingFile.sortOrder !== 0
        ) {
          actions.push("patch_fk_primary_file_edge");
          if (!dryRun) {
            await ctx.db.patch(existingFile._id, {
              relationshipType: "primary",
              sortOrder: 0,
              updatedAt: now,
            });
          }
        }
      }

      const repaired = actions.length > 0;
      if (repaired) {
        logs.push({
          fileId: String(file._id),
          fkPrimaryClientId: fkPrimary,
          actions,
        });
      }
    }

    const repairedFiles = logs.length;
    const pass = repairedFiles >= 0;

    return {
      pass,
      scannedFiles: Math.min(scoped.length, limit),
      repairedFiles,
      demotedLoanLinks,
      demotedFileEdges,
      deletedDuplicatePrimaryRows,
      logs: logs.slice(0, 200),
    };
  },
});

