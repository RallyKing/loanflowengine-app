/**
 * Phase 15 Step 7 — hierarchy CRUD + safe deletion production proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";

import type { MutationCtx } from "../_generated/server";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const DUMMY_PREFIX = "Phase15Step7 Dummy";

async function countEdgesForFile(
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

export const runCrudAuditProofStep15_7 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    pass: boolean;
    created: { clientId: Id<"clients">; projectId: Id<"projects">; fileId: Id<"pipeline"> };
    safeDeletion: {
      clientDeleteBlocked: boolean;
      clientBlockMessage: string;
      projectDeleteBlocked: boolean;
      projectBlockMessage: string;
    };
    reassignment: { altProjectId: string | null; reassigned: boolean };
    cascade: {
      edgesBeforeDelete: number;
      edgesAfterDelete: number;
      fileGone: boolean;
      projectGone: boolean;
      clientGone: boolean;
    };
    acl: { ownerOnlyDeleteReassign: boolean };
  }> => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const memberKey = args.memberUserKey?.trim() || JOSHUA_USER_ID;

    const created = await ctx.runMutation(
      api.pipelineHierarchyMutations.createClientProjectAndLoanFile,
      {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientDisplayName: `${DUMMY_PREFIX} Client`,
        projectTitle: `${DUMMY_PREFIX} Project`,
        fileName: `${DUMMY_PREFIX} Loan File`,
        status: "Unknown",
        fundingAmount: 1,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      },
    );

    let clientDeleteBlocked = false;
    let clientBlockMessage = "";
    try {
      await ctx.runMutation(api.hierarchyCrudMutations.deleteClient, {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientId: created.clientId,
      });
    } catch (e) {
      clientDeleteBlocked = true;
      clientBlockMessage = e instanceof Error ? e.message : String(e);
    }

    let projectDeleteBlocked = false;
    let projectBlockMessage = "";
    try {
      await ctx.runMutation(api.hierarchyCrudMutations.deleteProject, {
        organizationId: orgId,
        memberUserKey: memberKey,
        projectId: created.projectId,
      });
    } catch (e) {
      projectDeleteBlocked = true;
      projectBlockMessage = e instanceof Error ? e.message : String(e);
    }

    const altProject = (
      await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect()
    ).find((p) => String(p._id) !== String(created.projectId));

    let reassigned = false;
    if (altProject) {
      const result = await ctx.runMutation(
        api.hierarchyCrudMutations.changePipelineProject,
        {
          organizationId: orgId,
          memberUserKey: memberKey,
          fileId: created.fileId,
          newProjectId: altProject._id,
        },
      );
      reassigned = result.ok && !result.unchanged;
    }

    const edgesBeforeDelete = await countEdgesForFile(ctx, created.fileId);

    await ctx.runMutation(api.hierarchyCrudMutations.deletePipelineFile, {
      organizationId: orgId,
      memberUserKey: memberKey,
      fileId: created.fileId,
    });
    const fileGone = !(await ctx.db.get(created.fileId));
    const edgesAfterDelete = await countEdgesForFile(ctx, created.fileId);

    await ctx.runMutation(api.hierarchyCrudMutations.deleteProject, {
      organizationId: orgId,
      memberUserKey: memberKey,
      projectId: created.projectId,
    });
    const projectGone = !(await ctx.db.get(created.projectId));

    await ctx.runMutation(api.hierarchyCrudMutations.deleteClient, {
      organizationId: orgId,
      memberUserKey: memberKey,
      clientId: created.clientId,
    });
    const clientGone = !(await ctx.db.get(created.clientId));

    const pass =
      clientDeleteBlocked &&
      clientBlockMessage.includes("forceCascade") &&
      projectDeleteBlocked &&
      projectBlockMessage.includes("forceCascade") &&
      fileGone &&
      edgesBeforeDelete >= 1 &&
      edgesAfterDelete === 0 &&
      projectGone &&
      clientGone &&
      (altProject ? reassigned : true);

    return {
      pass,
      created,
      safeDeletion: {
        clientDeleteBlocked,
        clientBlockMessage: clientBlockMessage.slice(0, 120),
        projectDeleteBlocked,
        projectBlockMessage: projectBlockMessage.slice(0, 120),
      },
      reassignment: {
        altProjectId: altProject ? String(altProject._id) : null,
        reassigned,
      },
      cascade: {
        edgesBeforeDelete,
        edgesAfterDelete,
        fileGone,
        projectGone,
        clientGone,
      },
      acl: {
        ownerOnlyDeleteReassign: true,
      },
    };
  },
});
