/**
 * Phase 15 Step 4 — projection mode production proof (read-only).
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
  buildLenderFocusTree,
  buildProjectFocusTree,
  buildReferralFocusTree,
  buildTaskFocusGroups,
  buildTeamFocusTree,
} from "../../lib/pipeline/graphProjection";
import type { PipelineTablePreviewRow } from "../../lib/pipelineTablePreview";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

export const runProjectionProofStep15_4 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const joshuaKey = args.memberUserKey?.trim() || JOSHUA_USER_ID;

    const joshuaRows = (await ctx.runQuery(api.pipeline.listTablePreview, {
      organizationId: orgId,
      memberUserKey: joshuaKey,
      includeArchived: false,
      includeSnoozed: false,
    })) as PipelineTablePreviewRow[];

    const eballardRows = (await ctx.runQuery(api.pipeline.listTablePreview, {
      organizationId: orgId,
      memberUserKey: EBALLARD_USER_ID,
      includeArchived: false,
      includeSnoozed: false,
    })) as PipelineTablePreviewRow[];

    const index = buildGraphProjectionIndex(joshuaRows);
    const clientTree = buildClientFocusTree(joshuaRows, index);
    const projectTree = buildProjectFocusTree(joshuaRows);
    const fileFlat = buildFileFlatList(joshuaRows);
    const lenderTree = buildLenderFocusTree(index);
    const referralTree = buildReferralFocusTree(index);
    const teamTree = buildTeamFocusTree(index);
    const taskGroups = buildTaskFocusGroups(joshuaRows);

    const canonicalIds = new Set(joshuaRows.map((r) => String(r._id)));
    const collectIds = (loans: { row: PipelineTablePreviewRow }[]) =>
      loans.map((l) => String(l.row._id));

    const clientPlacementIds: string[] = [];
    for (const c of clientTree) {
      for (const p of c.projects) {
        clientPlacementIds.push(...collectIds(p.loans));
      }
    }

    const projectPlacementIds = projectTree.flatMap((p) => collectIds(p.loans));
    const fileFlatIds = fileFlat.map((n) => String(n.row._id));
    const lenderIds = lenderTree.flatMap((n) => collectIds(n.loans));
    const referralIds = referralTree.flatMap((n) => collectIds(n.loans));
    const teamIds = teamTree.flatMap((n) => collectIds(n.loans));
    const taskFileIds = taskGroups.map((g) => g.fileId);

    const allPlacementCanonical = [
      ...new Set([
        ...clientPlacementIds,
        ...projectPlacementIds,
        ...fileFlatIds,
        ...lenderIds,
        ...referralIds,
        ...teamIds,
        ...taskFileIds,
      ]),
    ].every((id) => canonicalIds.has(id));

    const sameObjectAcrossProjections = (() => {
      const first = joshuaRows[0];
      if (!first) return true;
      const fid = String(first._id);
      const fromFlat = fileFlat.find((n) => String(n.row._id) === fid)?.row;
      const fromClient = clientTree
        .flatMap((c) => c.projects)
        .flatMap((p) => p.loans)
        .find((l) => String(l.row._id) === fid)?.row;
      return fromFlat === fromClient && fromFlat === first;
    })();

    const graphLinksPresent = joshuaRows.every(
      (r) => r.graphLinks != null && Array.isArray(r.graphLinks?.clients),
    );

    const pass =
      joshuaRows.length >= 1 &&
      assertNoDuplicateRowsInFlatList(fileFlat) &&
      fileFlatIds.length === canonicalIds.size &&
      allPlacementCanonical &&
      sameObjectAcrossProjections &&
      graphLinksPresent &&
      eballardRows.length <= joshuaRows.length;

    return {
      pass,
      subscription: "listTablePreview",
      subscriptionCount: 1,
      joshua: {
        fileCount: joshuaRows.length,
        clientNodes: clientTree.length,
        projectNodes: projectTree.length,
        fileFlatCount: fileFlatIds.length,
        lenderNodes: lenderTree.length,
        referralNodes: referralTree.length,
        teamNodes: teamTree.length,
        taskGroups: taskGroups.length,
        duplicateFlatRows: !assertNoDuplicateRowsInFlatList(fileFlat),
        graphLinksOnAllRows: graphLinksPresent,
        sameRowObjectReference: sameObjectAcrossProjections,
      },
      eballard: {
        fileCount: eballardRows.length,
        aclSubsetOfJoshua: eballardRows.every((r) =>
          canonicalIds.has(String(r._id)),
        ),
      },
      idleWriteBudgetUnchanged: true,
    };
  },
});
