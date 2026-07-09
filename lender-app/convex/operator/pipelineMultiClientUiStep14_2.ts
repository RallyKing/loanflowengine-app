/**
 * Phase 14 Step 2 — multi-client UI production proof (mutations + ACL smoke).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  removeResourceShare,
  resolvePipelineAccessLevel,
  resolveProjectAccessLevel,
  upsertResourceShare,
} from "../resourceAccess";
import { findLoanClientLink, findProjectClientLink } from "../pipelineMultiClientLinks";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

export const runMultiClientUiProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const project = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .first();
    if (!project) {
      return { pass: false, reason: "no_project" };
    }

    const file = await ctx.db
      .query("pipeline")
      .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
      .first();
    if (!file) {
      return { pass: false, reason: "no_file" };
    }

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const secondaryPool = clients.filter(
      (c) => String(c._id) !== String(project.clientId),
    );
    const addedProjectClients: string[] = [];
    const now = Date.now();
    for (let i = 0; i < Math.min(3, secondaryPool.length); i++) {
      const c = secondaryPool[i]!;
      const existing = await findProjectClientLink(ctx, project._id, c._id);
      if (existing) continue;
      await ctx.db.insert("projectClients", {
        organizationId: JOSHUA_ORG_ID,
        projectId: project._id,
        clientId: c._id,
        relationshipType: i === 0 ? "coborrower" : i === 1 ? "guarantor" : "entity",
        sortOrder: i + 1,
        createdAt: now,
        updatedAt: now,
      });
      addedProjectClients.push(String(c._id));
    }

    let promotedClientId: string | null = null;
    if (addedProjectClients.length > 0) {
      promotedClientId = addedProjectClients[0]!;
      const newPrimary = promotedClientId as Id<"clients">;
      await ctx.db.patch(project._id, { clientId: newPrimary, updatedAt: now });
      const link = await findProjectClientLink(ctx, project._id, newPrimary);
      if (link) {
        await ctx.db.patch(link._id, {
          relationshipType: "primary",
          sortOrder: 0,
          updatedAt: now,
        });
      }
    }

    const divergent = secondaryPool.find(
      (c) => !addedProjectClients.includes(String(c._id)),
    );
    let divergentLoanClientId: string | null = null;
    if (divergent && file.clientId) {
      divergentLoanClientId = String(divergent._id);
      const existing = await findLoanClientLink(ctx, file._id, divergent._id);
      if (!existing) {
        await ctx.db.insert("loanClients", {
          organizationId: JOSHUA_ORG_ID,
          pipelineId: file._id,
          clientId: divergent._id,
          relationshipType: "partner",
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const joshuaCanEditProject =
      (await resolveProjectAccessLevel(ctx, project, JOSHUA_USER_ID)) === "edit";
    const eballardViewBefore =
      (await resolvePipelineAccessLevel(ctx, file, EBALLARD_USER_ID)) === "view";

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: String(file._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });
    const eballardEdit =
      (await resolvePipelineAccessLevel(ctx, file, EBALLARD_USER_ID)) === "edit";

    await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: String(file._id),
      sharedUserId: EBALLARD_USER_ID,
    });
    const eballardAfterRevoke =
      (await resolvePipelineAccessLevel(ctx, file, EBALLARD_USER_ID)) === "none";

    const visibleJoshua = await filterPipelineRowsForMember(
      ctx,
      [file],
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );

    const projectLinks = await ctx.db
      .query("projectClients")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    const checks = {
      addedThreeOrMore: addedProjectClients.length >= 3 || secondaryPool.length < 3,
      promotedPrimary: promotedClientId != null,
      divergentLoanClient: divergentLoanClientId != null || secondaryPool.length < 2,
      joshuaCanEditProject,
      eballardHadViewOrEdit: eballardViewBefore || eballardEdit,
      eballardEditAfterShare: eballardEdit,
      eballardRevoked: eballardAfterRevoke,
      joshuaStillSeesFile: visibleJoshua.length === 1,
      projectLinkCountGtePrimary: projectLinks.length >= 1,
    };

    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      projectId: String(project._id),
      fileId: String(file._id),
      addedProjectClients,
      promotedClientId,
      divergentLoanClientId,
      projectLinkCount: projectLinks.length,
    };
  },
});
