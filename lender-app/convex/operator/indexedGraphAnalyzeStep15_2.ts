/**
 * Phase 15 Step 2 — indexed graph foundation analyze (read-only, dry run).
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { analyzeIndexedGraphFoundation } from "../indexedGraphAnalyze";
import {
  assertUniqueFileRefs,
  resolveFilesForClient,
  resolveFilesForLender,
  resolveFilesForProject,
  resolveFilesForReferralPartner,
  resolveFilesForTask,
  resolveFilesForTeamMember,
} from "../indexedGraphCompat";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

export const analyzeGraphFoundation = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const analyze = await analyzeIndexedGraphFoundation(ctx, orgId);
    return { dryRun: true, writes: 0, analyze };
  },
});

export const analyzeGraphFoundationQuery = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    return await analyzeIndexedGraphFoundation(ctx, orgId);
  },
});

/** Sample compat uniqueness on Joshua org (read-only). */
export const proveCompatUniqueness = mutation({
  args: {
    adminSecret: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { adminSecret, memberUserKey }) => {
    assertDataMigrationAdmin(adminSecret);
    const viewer = memberUserKey?.trim() || JOSHUA_USER_ID;

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();

    const checks: Record<string, boolean> = {};
    for (const c of clients.slice(0, 5)) {
      const refs = await resolveFilesForClient(ctx, {
        organizationId: JOSHUA_ORG_ID,
        clientId: c._id,
        memberUserKey: viewer,
      });
      checks[`client:${c._id}`] = assertUniqueFileRefs(refs);
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .take(5);
    for (const p of projects) {
      const refs = await resolveFilesForProject(ctx, {
        organizationId: JOSHUA_ORG_ID,
        projectId: p._id,
        memberUserKey: viewer,
      });
      checks[`project:${p._id}`] = assertUniqueFileRefs(refs);
    }

    const lenders = await ctx.db
      .query("lenders")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .take(3);
    for (const l of lenders) {
      const refs = await resolveFilesForLender(ctx, {
        organizationId: JOSHUA_ORG_ID,
        lenderId: l._id,
        memberUserKey: viewer,
      });
      checks[`lender:${l._id}`] = assertUniqueFileRefs(refs);
    }

    const referrals = await ctx.db
      .query("contacts")
      .withIndex("by_organization_updatedAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();
    const refContacts = referrals.filter((c) =>
      c.contactRoleId === "referral_partner",
    );
    for (const c of refContacts.slice(0, 3)) {
      const refs = await resolveFilesForReferralPartner(ctx, {
        organizationId: JOSHUA_ORG_ID,
        contactId: c._id,
        memberUserKey: viewer,
      });
      checks[`referral:${c._id}`] = assertUniqueFileRefs(refs);
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .take(3);
    for (const m of members) {
      const refs = await resolveFilesForTeamMember(ctx, {
        organizationId: JOSHUA_ORG_ID,
        userKey: m.userKey,
        memberUserKey: viewer,
      });
      checks[`team:${m.userKey}`] = assertUniqueFileRefs(refs);
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .take(5);
    for (const t of tasks) {
      const refs = await resolveFilesForTask(ctx, {
        organizationId: JOSHUA_ORG_ID,
        taskId: t._id,
        memberUserKey: viewer,
      });
      checks[`task:${t._id}`] = assertUniqueFileRefs(refs);
    }

    return {
      pass: Object.values(checks).every(Boolean),
      checks,
    };
  },
});
