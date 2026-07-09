/**
 * Phase 15 Step 13 — create empty loan file, delete via graph cleanup, verify gone.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";
import { deletePipelineGraph } from "../graphCleanup";
import { assertCanDeletePipelineRow } from "../organizationAccess";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const DUMMY_PREFIX = "Phase15Step13 Empty File Delete";

async function countFileEdges(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<number> {
  let n = 0;
  for (const table of [
    "fileClients",
    "fileProjects",
    "fileLenders",
    "fileReferralPartners",
    "fileTeamMembers",
    "fileTasks",
    "loanClients",
  ] as const) {
    const rows =
      table === "loanClients"
        ? await ctx.db
            .query("loanClients")
            .withIndex("by_pipeline", (q) => q.eq("pipelineId", fileId))
            .collect()
        : await ctx.db
            .query(table)
            .withIndex("by_file", (q) => q.eq("fileId", fileId))
            .collect();
    n += rows.length;
  }
  return n;
}

export const runEmptyFileDeletionProofStep15_13 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const memberKey = args.memberUserKey?.trim() || JOSHUA_USER_ID;

    const created = (await ctx.runMutation(
      api.pipelineHierarchyMutations.createClientProjectAndLoanFile,
      {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientDisplayName: `${DUMMY_PREFIX} Client`,
        projectTitle: `${DUMMY_PREFIX} Project`,
        fileName: `${DUMMY_PREFIX} ${Date.now()}`,
        status: "Unknown",
        fundingAmount: 0,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      },
    )) as { fileId: Id<"pipeline"> };

    const fileId: Id<"pipeline"> = created.fileId;
    const before = (await ctx.db.get(fileId)) as Doc<"pipeline"> | null;
    if (!before) throw new Error("File missing after create.");

    const edgesBefore = await countFileEdges(ctx, fileId);
    await assertCanDeletePipelineRow(ctx, before, memberKey);
    await deletePipelineGraph(ctx, fileId);

    const after = (await ctx.db.get(fileId)) as Doc<"pipeline"> | null;
    const edgesAfter = await countFileEdges(ctx, fileId);

    return {
      pass: after === null && edgesAfter === 0,
      fileId: String(fileId),
      ownerUserKey: before.ownerUserKey ?? null,
      ownerUserId: before.ownerUserId ?? null,
      edgesBefore,
      edgesAfter,
      fileGone: after === null,
    };
  },
});
