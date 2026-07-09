/**
 * One-shot bootstrap: assign legacy un-stamped rows to a single organization + owner.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npx convex run legacyAssignToOwner:run \
 *     '{"organizationId":"<optional Convex organizations id>","ownerUserKey":"user_...","orgName":"..."}'
 *
 * When `organizationId` is omitted, finds by name or creates the organization.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { pickCanonicalOrgMember } from "./orgMembership";
import {
  seedSystemRolesForOrganization,
  syncSystemRolePermissions,
} from "./organizationRbac";

const STAMP_TABLES = [
  "lenders",
  "pipeline",
  "tasks",
  "contacts",
  "lenderAttachments",
  "taskAttachments",
] as const;

type StampTable = (typeof STAMP_TABLES)[number];

export const run = mutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    ownerUserKey: v.string(),
    orgName: v.string(),
  },
  handler: async (ctx, { organizationId, ownerUserKey, orgName }) => {
    const now = Date.now();
    const cleanOrgName = orgName.trim() || "Organization";

    let orgId: Id<"organizations">;
    let orgCreated = false;

    if (organizationId) {
      const existing = await ctx.db.get(organizationId);
      if (!existing) throw new Error("organizationId not found.");
      orgId = organizationId;
      await ctx.db.patch(orgId, {
        name: cleanOrgName,
        plan: existing.plan ?? "enterprise",
        updatedAt: now,
      });
    } else {
      const byName = await ctx.db
        .query("organizations")
        .filter((q) => q.eq(q.field("name"), cleanOrgName))
        .first();
      if (byName) {
        orgId = byName._id;
        await ctx.db.patch(orgId, {
          name: cleanOrgName,
          plan: byName.plan ?? "enterprise",
          updatedAt: now,
        });
      } else {
        orgId = await ctx.db.insert("organizations", {
          name: cleanOrgName,
          plan: "enterprise",
          createdAt: now,
          updatedAt: now,
        });
        orgCreated = true;
      }
    }

    const { adminId } = await seedSystemRolesForOrganization(ctx, orgId);
    await syncSystemRolePermissions(ctx, orgId);

    const memberRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userKey", ownerUserKey),
      )
      .collect();
    const existingMember = pickCanonicalOrgMember(memberRows);
    let memberCreated = false;
    if (!existingMember) {
      await ctx.db.insert("organizationMembers", {
        organizationId: orgId,
        userKey: ownerUserKey,
        role: "owner",
        assignedRoleId: adminId,
        createdAt: now,
      });
      memberCreated = true;
    } else if (
      existingMember.role !== "owner" ||
      existingMember.assignedRoleId !== adminId
    ) {
      await ctx.db.patch(existingMember._id, {
        role: "owner",
        assignedRoleId: adminId,
      });
    }

    const stamped: Record<string, number> = {};
    for (const table of STAMP_TABLES) {
      let patched = 0;
      const rows = await ctx.db.query(table as StampTable).collect();
      for (const row of rows) {
        const r = row as {
          _id: Id<StampTable>;
          organizationId?: unknown;
        };
        if (!r.organizationId) {
          await ctx.db.patch(r._id, { organizationId: orgId });
          patched += 1;
        }
      }
      stamped[table] = patched;
    }

    let pipelineOwnerStamped = 0;
    const pipelineRows = await ctx.db.query("pipeline").collect();
    for (const row of pipelineRows) {
      const r = row as { _id: Id<"pipeline">; ownerUserKey?: unknown };
      if (!r.ownerUserKey) {
        await ctx.db.patch(r._id, { ownerUserKey: ownerUserKey });
        pipelineOwnerStamped += 1;
      }
    }

    return {
      orgCreated,
      orgId,
      memberCreated,
      ownerUserKey,
      stamped,
      pipelineOwnerStamped,
    };
  },
});
