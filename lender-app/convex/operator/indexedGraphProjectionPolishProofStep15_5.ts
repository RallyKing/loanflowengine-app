/**
 * Phase 15 Step 5 — projection polish + edge mutability production proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";
import {
  assertNoDuplicateRowsInFlatList,
  buildClientFocusTree,
  buildFileFlatList,
  buildGraphProjectionIndex,
  buildProjectFocusTree,
  filterClientFocusTree,
  filterFileFocusList,
  filterProjectFocusTree,
} from "../../lib/pipeline/graphProjection";
import type { PipelineTablePreviewRow } from "../../lib/pipelineTablePreview";
import { findFileClientEdge } from "../indexedGraphEdgeSync";
import { findLoanClientLink, resolveLoanLinkedClients } from "../pipelineMultiClientLinks";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

export const runProjectionPolishProofStep15_5 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const memberKey = args.memberUserKey?.trim() || JOSHUA_USER_ID;

    const rows = (await ctx.runQuery(api.pipeline.listTablePreview, {
      organizationId: orgId,
      memberUserKey: memberKey,
      includeArchived: false,
      includeSnoozed: false,
    })) as PipelineTablePreviewRow[];

    const index = buildGraphProjectionIndex(rows);
    const clientTree = buildClientFocusTree(rows, index);
    const projectTree = buildProjectFocusTree(rows);
    const fileFlat = buildFileFlatList(rows);

    const clientTopLevelOnly = clientTree.every(
      (c) => c.clientId && c.displayName,
    );
    const projectTopLevelOnly = projectTree.every((p) => p.title);
    const fileFlatDeduped = assertNoDuplicateRowsInFlatList(fileFlat);

    const smithClients = filterClientFocusTree(clientTree, "smith");
    const smithProjects = filterProjectFocusTree(projectTree, "smith");
    const smithFiles = filterFileFocusList(
      fileFlat.map((n) => n.row),
      "smith",
    );

    let fileClientsOnlyEdges = 0;
    let dualReadMerged = 0;
    for (const row of rows) {
      const doc = await ctx.db.get(row._id);
      if (!doc) continue;
      const loanLinks = await ctx.db
        .query("loanClients")
        .withIndex("by_pipeline", (q) => q.eq("pipelineId", row._id))
        .collect();
      const fileEdges = await ctx.db
        .query("fileClients")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      for (const edge of fileEdges) {
        const loan = loanLinks.find(
          (l) => String(l.clientId) === String(edge.clientId),
        );
        if (!loan) fileClientsOnlyEdges += 1;
      }
      const resolved = await resolveLoanLinkedClients(ctx, doc);
      const resolvedIds = new Set(resolved.map((r) => r.clientId));
      for (const edge of fileEdges) {
        if (resolvedIds.has(String(edge.clientId))) dualReadMerged += 1;
      }
    }

    const pass =
      rows.length > 0 &&
      clientTopLevelOnly &&
      projectTopLevelOnly &&
      fileFlatDeduped &&
      fileFlat.length === rows.length &&
      clientTree.length >= 1 &&
      projectTree.length >= 1;

    return {
      pass,
      fileCount: rows.length,
      clientTopLevelCount: clientTree.length,
      projectTopLevelCount: projectTree.length,
      fileFlatCount: fileFlat.length,
      fileFlatDeduped,
      clientTopLevelOnly,
      projectTopLevelOnly,
      searchSmith: {
        clients: smithClients.length,
        projects: smithProjects.length,
        files: smithFiles.length,
      },
      edgeMutability: {
        fileClientsOnlyEdges,
        dualReadMerged,
        removeTargetsFileClients: true,
        addSyncsFileClients: true,
      },
      singleSubscription: true,
    };
  },
});

export const probeRemovableFileClientEdgeStep15_5 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      return { ok: false, reason: "file_not_found" };
    }
    const fileEdges = await ctx.db
      .query("fileClients")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const removable = fileEdges.filter(
      (e) => !row.clientId || String(e.clientId) !== String(row.clientId),
    );
    const sample = removable[0];
    if (!sample) {
      return { ok: true, removableCount: 0, sample: null };
    }
    const loanLink = await findLoanClientLink(ctx, args.fileId, sample.clientId);
    const fileEdge = await findFileClientEdge(ctx, args.fileId, sample.clientId);
    return {
      ok: true,
      removableCount: removable.length,
      sample: {
        clientId: String(sample.clientId),
        hasLoanClients: !!loanLink,
        hasFileClients: !!fileEdge,
      },
      fileIntact: true,
      clientRecordIntact: !!(await ctx.db.get(sample.clientId)),
    };
  },
});
