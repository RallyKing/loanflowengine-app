/**
 * Phase 15 Step 3 — indexed graph backfill execute + production proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  executeIndexedGraphBackfill,
  JOSHUA_ORG_ID,
  JOSHUA_USER_ID,
  EBALLARD_USER_ID,
  runCompatResolverProof,
  runIndexedGraphProductionProof,
  scanIndexedGraphIntegrity,
} from "../indexedGraphBackfill";
import { analyzeIndexedGraphFoundation } from "../indexedGraphAnalyze";

export const executeBackfillStep15_3 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
    skipAmbiguityAbort: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;
    const backfill = await executeIndexedGraphBackfill(ctx, {
      organizationId: orgId,
      dryRun: args.dryRun === true,
      skipAmbiguityAbort: args.skipAmbiguityAbort === true,
    });
    return {
      phase: "15-step3-backfill-execute",
      organizationId: orgId,
      backfill,
    };
  },
});

export const runProofStep15_3 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;

    const integrity = await scanIndexedGraphIntegrity(ctx, orgId);
    const resolverProof = await runCompatResolverProof(
      ctx,
      orgId,
      JOSHUA_USER_ID,
    );
    const analyze = await analyzeIndexedGraphFoundation(ctx, orgId);

    const edgeCounts: Record<string, number> = {};
    for (const table of [
      "fileClients",
      "fileProjects",
      "fileLenders",
      "fileReferralPartners",
      "fileTeamMembers",
      "fileTasks",
      "projectLenders",
      "projectReferralPartners",
      "projectTeamMembers",
      "projectTasks",
    ] as const) {
      const rows = (await ctx.db.query(table).collect()).filter(
        (r) => String(r.organizationId) === String(orgId),
      );
      edgeCounts[table] = rows.length;
    }

    return {
      phase: "15-step3-proof",
      organizationId: orgId,
      edgeCounts,
      integrity,
      resolverProof,
      analyze,
      pass: integrity.pass && resolverProof.pass,
    };
  },
});

/** Execute backfill (writes) then run full proof in one admin call. */
export const executeAndProveStep15_3 = mutation({
  args: {
    adminSecret: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const orgId = args.organizationId ?? JOSHUA_ORG_ID;

    const backfill = await executeIndexedGraphBackfill(ctx, {
      organizationId: orgId,
      dryRun: false,
    });

    if (backfill.aborted) {
      return {
        pass: false,
        aborted: true,
        abortReason: backfill.abortReason,
        backfill,
      };
    }

    const proof = await runIndexedGraphProductionProof(ctx, orgId, backfill);
    const eballardResolver = await runCompatResolverProof(
      ctx,
      orgId,
      EBALLARD_USER_ID,
    );

    return {
      pass: proof.pass,
      aborted: false,
      backfill,
      proof,
      eballardResolverPass: eballardResolver.pass,
      joshuaUserId: JOSHUA_USER_ID,
      eballardUserId: EBALLARD_USER_ID,
    };
  },
});
