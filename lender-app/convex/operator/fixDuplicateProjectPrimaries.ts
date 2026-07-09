/**
 * Phase 15 Step 14 — demote duplicate projectClients "primary" edges.
 * Canonical primary: `projects.clientId` FK.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { ensurePrimaryProjectClientLink } from "../pipelineMultiClientLinks";

const PRIMARY_SORT = 0;

type RepairLog = {
  projectId: string;
  fkPrimaryClientId: string | null;
  actions: string[];
};

export const runFixDuplicateProjectPrimaries = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    pass: boolean;
    scannedProjects: number;
    repairedProjects: number;
    demotedProjectLinks: number;
    deletedDuplicatePrimaryRows: number;
    ensuredFkPrimaryLinks: number;
    logs: RepairLog[];
  }> => {
    assertDataMigrationAdmin(args.adminSecret);
    const dryRun = args.dryRun !== false;
    const limit = args.limit ?? 10_000;

    const projects = await ctx.db.query("projects").collect();
    const scoped = args.organizationId
      ? projects.filter((p) => String(p.organizationId) === String(args.organizationId))
      : projects.filter((p) => p.organizationId != null);

    let demotedProjectLinks = 0;
    let deletedDuplicatePrimaryRows = 0;
    let ensuredFkPrimaryLinks = 0;
    const logs: RepairLog[] = [];
    const now = Date.now();

    for (const project of scoped.slice(0, limit)) {
      const fkPrimary = project.clientId ? String(project.clientId) : null;
      const actions: string[] = [];

      const links = await ctx.db
        .query("projectClients")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      const primaries = links.filter((l) => l.relationshipType === "primary");
      const fkPrimaries = fkPrimary
        ? primaries.filter((l) => String(l.clientId) === fkPrimary)
        : [];

      for (const list of [fkPrimaries] as const) {
        if (list.length <= 1) continue;
        const dupes = list.slice(1);
        actions.push(`delete_duplicate_fk_primary:${dupes.length}`);
        if (!dryRun) {
          for (const d of dupes) {
            await ctx.db.delete(d._id);
            deletedDuplicatePrimaryRows += 1;
          }
        } else {
          deletedDuplicatePrimaryRows += dupes.length;
        }
      }

      for (const link of primaries) {
        if (fkPrimary && String(link.clientId) === fkPrimary) continue;
        actions.push(`demote_project_primary:${String(link.clientId)}`);
        demotedProjectLinks += 1;
        if (!dryRun) {
          await ctx.db.patch(link._id, {
            relationshipType: "coborrower",
            sortOrder: Math.max(1, link.sortOrder),
            updatedAt: now,
          });
        }
      }

      if (project.clientId && project.organizationId) {
        const fkId = project.clientId;
        const existing = await ctx.db
          .query("projectClients")
          .withIndex("by_project_client", (q) =>
            q.eq("projectId", project._id).eq("clientId", fkId),
          )
          .first();
        if (!existing) {
          actions.push("insert_missing_fk_primary");
          ensuredFkPrimaryLinks += 1;
          if (!dryRun) {
            await ctx.db.insert("projectClients", {
              organizationId: project.organizationId,
              projectId: project._id,
              clientId: fkId,
              relationshipType: "primary",
              sortOrder: PRIMARY_SORT,
              createdAt: now,
              updatedAt: now,
            });
          }
        } else if (
          existing.relationshipType !== "primary" ||
          existing.sortOrder !== PRIMARY_SORT
        ) {
          actions.push("promote_fk_primary");
          ensuredFkPrimaryLinks += 1;
          if (!dryRun) {
            await ctx.db.patch(existing._id, {
              relationshipType: "primary",
              sortOrder: PRIMARY_SORT,
              updatedAt: now,
            });
          }
        } else if (!dryRun) {
          const sync = await ensurePrimaryProjectClientLink(ctx, project);
          if (sync === "inserted") {
            actions.push("ensure_primary_link_inserted");
            ensuredFkPrimaryLinks += 1;
          }
        }
      }

      if (actions.length > 0) {
        logs.push({
          projectId: String(project._id),
          fkPrimaryClientId: fkPrimary,
          actions,
        });
      }
    }

    const repairedProjects = logs.length;
    return {
      pass: true,
      scannedProjects: Math.min(scoped.length, limit),
      repairedProjects,
      demotedProjectLinks,
      deletedDuplicatePrimaryRows,
      ensuredFkPrimaryLinks,
      logs: logs.slice(0, 200),
    };
  },
});
