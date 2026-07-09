/**
 * Phase 15 Step 10 — cascade delete + secondary unlink proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { api } from "../_generated/api";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const DUMMY_PREFIX = "Phase15Step10 Cascade Dummy";

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

export const runCascadeDeletionProofStep15_10 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    pass: boolean;
    projectCascade: {
      createdProjectId: string;
      createdFileId: string;
      requiresForceWithoutFlag: boolean;
      projectGone: boolean;
      fileGone: boolean;
      edgesAfter: number;
    };
    clientCascade: {
      createdClientId: string;
      requiresForceWithoutFlag: boolean;
      clientGone: boolean;
      projectGone: boolean;
      fileGone: boolean;
    };
    secondaryUnlink: { removedSecondary: boolean };
  }> => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const memberKey = args.memberUserKey?.trim() || JOSHUA_USER_ID;

    const projectBundle = await ctx.runMutation(
      api.pipelineHierarchyMutations.createClientProjectAndLoanFile,
      {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientDisplayName: `${DUMMY_PREFIX} Client A`,
        projectTitle: `${DUMMY_PREFIX} Project Cascade`,
        fileName: `${DUMMY_PREFIX} File Cascade`,
        status: "Unknown",
        fundingAmount: 1,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      },
    );

    let projectRequiresForce = false;
    try {
      await ctx.runMutation(api.hierarchyCrudMutations.deleteProject, {
        organizationId: orgId,
        memberUserKey: memberKey,
        projectId: projectBundle.projectId,
      });
    } catch {
      projectRequiresForce = true;
    }

    await ctx.runMutation(api.hierarchyCrudMutations.deleteProject, {
      organizationId: orgId,
      memberUserKey: memberKey,
      projectId: projectBundle.projectId,
      forceCascade: true,
    });

    const projectGone = !(await ctx.db.get(projectBundle.projectId));
    const fileGoneAfterProject = !(await ctx.db.get(projectBundle.fileId));
    const edgesAfterProject = await countEdgesForFile(ctx, projectBundle.fileId);

    const clientBundle = await ctx.runMutation(
      api.pipelineHierarchyMutations.createClientProjectAndLoanFile,
      {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientDisplayName: `${DUMMY_PREFIX} Client B`,
        projectTitle: `${DUMMY_PREFIX} Project Nested`,
        fileName: `${DUMMY_PREFIX} File Nested`,
        status: "Unknown",
        fundingAmount: 1,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      },
    );

    const secondaryClient = await ctx.runMutation(
      api.pipelineMultiClientMutations.createOrgClient,
      {
        organizationId: orgId,
        memberUserKey: memberKey,
        displayName: `${DUMMY_PREFIX} Secondary`,
      },
    );

    await ctx.runMutation(api.pipelineMultiClientMutations.addLoanClientLink, {
      organizationId: orgId,
      fileId: clientBundle.fileId,
      clientId: secondaryClient.clientId,
      memberUserKey: memberKey,
      relationshipType: "coborrower",
    });

    await ctx.runMutation(api.pipelineMultiClientMutations.removeLoanClientLink, {
      organizationId: orgId,
      fileId: clientBundle.fileId,
      clientId: secondaryClient.clientId,
      memberUserKey: memberKey,
    });

    const loanLinks = await ctx.db
      .query("loanClients")
      .withIndex("by_pipeline_client", (q) =>
        q.eq("pipelineId", clientBundle.fileId).eq("clientId", secondaryClient.clientId),
      )
      .collect();
    const fileEdges = await ctx.db
      .query("fileClients")
      .withIndex("by_file", (q) => q.eq("fileId", clientBundle.fileId))
      .collect();
    const secondaryGone =
      loanLinks.length === 0 &&
      !fileEdges.some((e) => String(e.clientId) === String(secondaryClient.clientId));

    let clientRequiresForce = false;
    try {
      await ctx.runMutation(api.hierarchyCrudMutations.deleteClient, {
        organizationId: orgId,
        memberUserKey: memberKey,
        clientId: clientBundle.clientId,
      });
    } catch {
      clientRequiresForce = true;
    }

    await ctx.runMutation(api.hierarchyCrudMutations.deleteClient, {
      organizationId: orgId,
      memberUserKey: memberKey,
      clientId: clientBundle.clientId,
      forceCascade: true,
    });

    const clientGone = !(await ctx.db.get(clientBundle.clientId));
    const nestedProjectGone = !(await ctx.db.get(clientBundle.projectId));
    const nestedFileGone = !(await ctx.db.get(clientBundle.fileId));

    const pass =
      projectRequiresForce &&
      projectGone &&
      fileGoneAfterProject &&
      edgesAfterProject === 0 &&
      clientRequiresForce &&
      clientGone &&
      nestedProjectGone &&
      nestedFileGone &&
      secondaryGone;

    return {
      pass,
      projectCascade: {
        createdProjectId: String(projectBundle.projectId),
        createdFileId: String(projectBundle.fileId),
        requiresForceWithoutFlag: projectRequiresForce,
        projectGone,
        fileGone: fileGoneAfterProject,
        edgesAfter: edgesAfterProject,
      },
      clientCascade: {
        createdClientId: String(clientBundle.clientId),
        requiresForceWithoutFlag: clientRequiresForce,
        clientGone,
        projectGone: nestedProjectGone,
        fileGone: nestedFileGone,
      },
      secondaryUnlink: { removedSecondary: secondaryGone },
    };
  },
});
