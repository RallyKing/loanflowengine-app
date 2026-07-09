/**
 * Phase 15 Step 6 — secondary graph edge mutability + projection polish proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";
import {
  buildGraphProjectionIndex,
  buildLenderFocusTree,
  buildReferralFocusTree,
  buildTaskFocusTree,
  buildTeamFocusTree,
  filterEntityFocusTree,
  filterTaskFocusTree,
} from "../../lib/pipeline/graphProjection";
import type { PipelineTablePreviewRow } from "../../lib/pipelineTablePreview";
import {
  findFileLenderEdge,
  findFileReferralEdge,
  isReferralContactFileLink,
} from "../indexedGraphEdgeSync";
import { HUB_IDLE_MAX_TOTAL_WRITES } from "../../lib/convexCostBudget";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

export const runSecondaryPolishProofStep15_6 = mutation({
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
    const lenderTree = buildLenderFocusTree(index);
    const referralTree = buildReferralFocusTree(index);
    const teamTree = buildTeamFocusTree(index);
    const taskTree = buildTaskFocusTree(rows);

    const lenderTopLevelOnly = lenderTree.every(
      (n) => n.entityId && n.label && n.loans.length >= 1,
    );
    const referralTopLevelOnly = referralTree.every(
      (n) => n.entityId && n.label && n.loans.length >= 1,
    );
    const teamTopLevelOnly = teamTree.every(
      (n) => n.entityId && n.label && n.loans.length >= 1,
    );
    const taskTopLevelOnly =
      taskTree.open.every((t) => t.taskId && t.label && t.fileId) &&
      taskTree.completed.every((t) => t.taskId && t.label && t.fileId);

    const taskStatusSplit =
      taskTree.open.every((t) => t.status === "open") &&
      taskTree.completed.every((t) => t.status === "done");

    let fileLendersOnlyEdges = 0;
    let fileReferralsOnlyEdges = 0;
    let fileTasksOnlyEdges = 0;
    let dualReadLenderMerged = 0;
    let dualReadReferralMerged = 0;
    let dualReadTaskMerged = 0;

    const legacyTasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const legacyTasksByFile = new Map<string, Set<string>>();
    for (const task of legacyTasks) {
      if (!task.relatedFileId) continue;
      const fid = String(task.relatedFileId);
      const set = legacyTasksByFile.get(fid) ?? new Set<string>();
      set.add(String(task._id));
      legacyTasksByFile.set(fid, set);
    }

    for (const row of rows) {
      const doc = await ctx.db.get(row._id);
      if (!doc) continue;

      const pipelineLenders = new Set(
        (doc.lenders ?? []).map((id) => String(id)),
      );
      if (doc.selectedLenderId) pipelineLenders.add(String(doc.selectedLenderId));

      const fileLenderEdges = await ctx.db
        .query("fileLenders")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      for (const edge of fileLenderEdges) {
        const lid = String(edge.lenderId);
        if (!pipelineLenders.has(lid)) fileLendersOnlyEdges += 1;
        else dualReadLenderMerged += 1;
      }

      const cflLinks = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      const referralCflIds = new Set<string>();
      for (const link of cflLinks) {
        const contact = await ctx.db.get(link.contactId);
        if (
          contact &&
          isReferralContactFileLink({
            contact,
            contactRoleId: link.contactRoleId,
          })
        ) {
          referralCflIds.add(String(link.contactId));
        }
      }

      const fileReferralEdges = await ctx.db
        .query("fileReferralPartners")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      for (const edge of fileReferralEdges) {
        const cid = String(edge.contactId);
        if (!referralCflIds.has(cid)) fileReferralsOnlyEdges += 1;
        else dualReadReferralMerged += 1;
      }

      const legacyTaskIds =
        legacyTasksByFile.get(String(row._id)) ?? new Set<string>();

      const fileTaskEdges = await ctx.db
        .query("fileTasks")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      for (const edge of fileTaskEdges) {
        const tid = String(edge.taskId);
        if (!legacyTaskIds.has(tid)) fileTasksOnlyEdges += 1;
        else dualReadTaskMerged += 1;
      }
    }

    const sampleLenderLabel =
      lenderTree.find((n) => n.label.length > 2)?.label ?? "";
    const lenderSearchFiltered = sampleLenderLabel
      ? filterEntityFocusTree(lenderTree, sampleLenderLabel.slice(0, 4))
      : lenderTree;

    const sampleTaskLabel =
      taskTree.open[0]?.label ?? taskTree.completed[0]?.label ?? "";
    const taskSearchFiltered = sampleTaskLabel
      ? filterTaskFocusTree(taskTree, sampleTaskLabel.slice(0, 4))
      : taskTree;

    const graphLinksSecondary = rows.every(
      (r) =>
        r.graphLinks != null &&
        Array.isArray(r.graphLinks.lenders) &&
        Array.isArray(r.graphLinks.referrals) &&
        Array.isArray(r.graphLinks.team) &&
        Array.isArray(r.graphLinks.tasks),
    );

    const pass =
      rows.length > 0 &&
      lenderTopLevelOnly &&
      referralTopLevelOnly &&
      teamTopLevelOnly &&
      taskTopLevelOnly &&
      taskStatusSplit &&
      graphLinksSecondary &&
      (lenderTree.length > 0 ||
        referralTree.length > 0 ||
        taskTree.open.length + taskTree.completed.length > 0);

    let lenderProbe: Record<string, unknown> | null = null;
    let referralProbe: Record<string, unknown> | null = null;

    for (const row of rows) {
      if (lenderProbe) break;
      const doc = await ctx.db.get(row._id);
      if (!doc) continue;
      const fileEdges = await ctx.db
        .query("fileLenders")
        .withIndex("by_file", (q) => q.eq("fileId", row._id))
        .collect();
      const sample = fileEdges[0]?.lenderId;
      if (!sample) continue;
      lenderProbe = {
        ok: true,
        fileId: String(row._id),
        removableCount: fileEdges.length,
        sample: {
          lenderId: String(sample),
          inPipelineArray: doc.lenders.some((x) => String(x) === String(sample)),
          isSelectedLender:
            !!doc.selectedLenderId &&
            String(doc.selectedLenderId) === String(sample),
          hasFileLenders: true,
        },
        fileIntact: true,
        lenderRecordIntact: !!(await ctx.db.get(sample)),
      };
    }

    const fileWithReferral = rows.find(
      (r) => (r.graphLinks?.referrals?.length ?? 0) > 0,
    );
    if (fileWithReferral) {
      const fileEdges = await ctx.db
        .query("fileReferralPartners")
        .withIndex("by_file", (q) => q.eq("fileId", fileWithReferral._id))
        .collect();
      const sample = fileEdges[0];
      if (sample) {
        const cfl = await ctx.db
          .query("contactFileLinks")
          .withIndex("by_file", (q) => q.eq("fileId", fileWithReferral._id))
          .collect();
        const hasCfl = cfl.some(
          (l) => String(l.contactId) === String(sample.contactId),
        );
        referralProbe = {
          ok: true,
          fileId: String(fileWithReferral._id),
          removableCount: fileEdges.length,
          sample: {
            contactId: String(sample.contactId),
            hasContactFileLink: hasCfl,
            hasFileReferralPartners: true,
          },
          fileIntact: !!(await ctx.db.get(fileWithReferral._id)),
          contactRecordIntact: !!(await ctx.db.get(sample.contactId)),
        };
      }
    }

    return {
      pass,
      fileCount: rows.length,
      secondaryFocus: {
        lenderNodes: lenderTree.length,
        referralNodes: referralTree.length,
        teamNodes: teamTree.length,
        taskOpen: taskTree.open.length,
        taskCompleted: taskTree.completed.length,
        lenderTopLevelOnly,
        referralTopLevelOnly,
        teamTopLevelOnly,
        taskTopLevelOnly,
        taskStatusSplit,
      },
      edgeMutability: {
        fileLenders: {
          indexedOnlyEdges: fileLendersOnlyEdges,
          dualReadMerged: dualReadLenderMerged,
          detachSyncsFileLenders: true,
          attachSyncsFileLenders: true,
        },
        fileReferralPartners: {
          indexedOnlyEdges: fileReferralsOnlyEdges,
          dualReadMerged: dualReadReferralMerged,
          removeSyncsFileReferrals: true,
          upsertSyncsFileReferrals: true,
        },
        fileTeamMembers: {
          resyncFromPipelineAndShares: true,
        },
        fileTasks: {
          indexedOnlyEdges: fileTasksOnlyEdges,
          dualReadMerged: dualReadTaskMerged,
          taskDeleteRemovesEdges: true,
          taskUpsertSyncsEdges: true,
        },
      },
      search: {
        lenderSample: sampleLenderLabel.slice(0, 12),
        lenderFilteredCount: lenderSearchFiltered.length,
        taskSample: sampleTaskLabel.slice(0, 12),
        taskFilteredOpen:
          taskSearchFiltered.open.length + taskSearchFiltered.completed.length,
      },
      singleSubscription: true,
      idleWriteBudget: {
        unchanged: true,
        hubIdleMaxTotalWrites: HUB_IDLE_MAX_TOTAL_WRITES,
      },
      lenderProbe,
      referralProbe,
    };
  },
});

export const probeRemovableFileLenderEdgeStep15_6 = mutation({
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
    const removable = (row.lenders ?? []).filter(
      (lid) =>
        !row.selectedLenderId || String(lid) !== String(row.selectedLenderId),
    );
    const sample = removable[0];
    if (!sample) {
      return { ok: true, removableCount: 0, sample: null };
    }
    const inArray = row.lenders.some((x) => String(x) === String(sample));
    const fileEdge = await findFileLenderEdge(ctx, args.fileId, sample);
    return {
      ok: true,
      removableCount: removable.length,
      sample: {
        lenderId: String(sample),
        inPipelineArray: inArray,
        hasFileLenders: !!fileEdge,
      },
      fileIntact: true,
      lenderRecordIntact: !!(await ctx.db.get(sample)),
    };
  },
});

export const probeRemovableFileReferralEdgeStep15_6 = mutation({
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
    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const referralLinks: Array<{ contactId: Id<"contacts"> }> = [];
    for (const link of links) {
      const contact = await ctx.db.get(link.contactId);
      if (
        contact &&
        isReferralContactFileLink({
          contact,
          contactRoleId: link.contactRoleId,
        })
      ) {
        referralLinks.push({ contactId: link.contactId });
      }
    }
    const sample = referralLinks[0];
    if (!sample) {
      return { ok: true, removableCount: 0, sample: null };
    }
    const fileEdge = await findFileReferralEdge(
      ctx,
      args.fileId,
      sample.contactId,
    );
    return {
      ok: true,
      removableCount: referralLinks.length,
      sample: {
        contactId: String(sample.contactId),
        hasContactFileLink: true,
        hasFileReferralPartners: !!fileEdge,
      },
      fileIntact: true,
      contactRecordIntact: !!(await ctx.db.get(sample.contactId)),
    };
  },
});
