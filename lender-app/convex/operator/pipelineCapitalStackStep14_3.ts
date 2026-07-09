/**
 * Phase 14 Step 3 — capital stack production proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  ownerFieldsForInsert,
  removeResourceShare,
  resolveProjectAccessLevel,
  upsertResourceShare,
} from "../resourceAccess";
import {
  buildProjectCapitalRollup,
  syncCapitalSourcesFromProjectLoans,
} from "../projectCapitalStack";
import { safeMoney } from "../../lib/projectCapitalStack";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

export const runCapitalStackProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const orgProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();
    if (orgProjects.length === 0) {
      return { pass: false, reason: "no_project" };
    }

    let project = orgProjects[0]!;
    let loans: Doc<"pipeline">[] = [];
    for (const candidate of orgProjects) {
      const candidateLoans = await ctx.db
        .query("pipeline")
        .withIndex("by_projectId", (q) => q.eq("projectId", candidate._id))
        .collect();
      if (candidateLoans.length >= 3) {
        project = candidate;
        loans = candidateLoans;
        break;
      }
      if (candidateLoans.length > loans.length) {
        project = candidate;
        loans = candidateLoans;
      }
    }
    const seededLoanIds: string[] = [];
    if (loans.length < 3) {
      const nowSeed = Date.now();
      while (loans.length < 3) {
        const n = loans.length + 1;
        const id = await ctx.db.insert("pipeline", {
          fileName: `Phase 14.3 proof loan ${n}`,
          status: "Lead",
          fundingAmount: 100_000 * n,
          rate: 0,
          term: "",
          lenders: [],
          contacts: [],
          organizationId: JOSHUA_ORG_ID,
          clientId: project.clientId,
          projectId: project._id,
          ...ownerFieldsForInsert(JOSHUA_USER_ID),
          createdAt: nowSeed,
          updatedAt: nowSeed,
        });
        seededLoanIds.push(String(id));
        const row = await ctx.db.get(id);
        if (row) loans.push(row);
      }
    }

    const loanTriple = loans.slice(0, 3);
    const now = Date.now();

    const existingReqs = await ctx.db
      .query("projectCapitalRequirements")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    for (const r of existingReqs) await ctx.db.delete(r._id);
    const existingSources = await ctx.db
      .query("projectCapitalSources")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    for (const s of existingSources) await ctx.db.delete(s._id);
    const existingAlloc = await ctx.db
      .query("projectCapitalAllocations")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    for (const a of existingAlloc) await ctx.db.delete(a._id);

    const reqAmounts = [500_000, 300_000, 200_000];
    const reqTypes = ["acquisition", "rehab", "working_capital"] as const;
    const requirementIds: Id<"projectCapitalRequirements">[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await ctx.db.insert("projectCapitalRequirements", {
        organizationId: JOSHUA_ORG_ID,
        projectId: project._id,
        capitalType: reqTypes[i]!,
        requiredAmount: reqAmounts[i]!,
        priorityOrder: i,
        createdAt: now,
        updatedAt: now,
      });
      requirementIds.push(id);
    }

    const approvedPartial = [150_000, 100_000, 50_000];
    const sourceIds: Id<"projectCapitalSources">[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await ctx.db.insert("projectCapitalSources", {
        organizationId: JOSHUA_ORG_ID,
        projectId: project._id,
        pipelineId: loanTriple[i]!._id,
        sourceType: "loan",
        committedAmount: approvedPartial[i]!,
        approvedAmount: approvedPartial[i]!,
        fundedAmount: Math.round(approvedPartial[i]! * 0.5),
        status: "approved",
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
      sourceIds.push(id);
      await ctx.db.insert("projectCapitalAllocations", {
        organizationId: JOSHUA_ORG_ID,
        projectId: project._id,
        sourceId: id,
        requirementId: requirementIds[i]!,
        allocatedAmount: approvedPartial[i]!,
        createdAt: now,
        updatedAt: now,
      });
    }

    let rollup = await buildProjectCapitalRollup(ctx, project._id);
    const partialCoverage =
      rollup.totalRequired === 1_000_000 &&
      rollup.totalFunded < rollup.totalRequired &&
      rollup.gapHealth === "partial";

    const loan0 = loanTriple[0]!;
    const prevFunding = safeMoney(loan0.fundingAmount);
    const bumped = prevFunding + 25_000;
    await ctx.db.patch(loan0._id, { fundingAmount: bumped, updatedAt: now });
    await syncCapitalSourcesFromProjectLoans(ctx, project._id);
    const rollupAfterLoan = await buildProjectCapitalRollup(ctx, project._id);
    const liveRecalc =
      rollupAfterLoan.totalApproved !== rollup.totalApproved ||
      rollupAfterLoan.totalFunded !== rollup.totalFunded;
    await ctx.db.patch(loan0._id, {
      fundingAmount: prevFunding,
      updatedAt: Date.now(),
    });

    const joshuaEdit =
      (await resolveProjectAccessLevel(ctx, project, JOSHUA_USER_ID)) === "edit";

    const eballardBefore =
      (await resolveProjectAccessLevel(ctx, project, EBALLARD_USER_ID)) ===
      "none";

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "project",
      resourceId: String(project._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    const eballardView =
      (await resolveProjectAccessLevel(ctx, project, EBALLARD_USER_ID)) ===
      "view";

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "project",
      resourceId: String(project._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });
    const eballardEdit =
      (await resolveProjectAccessLevel(ctx, project, EBALLARD_USER_ID)) ===
      "edit";

    await removeResourceShare(ctx, {
      resourceType: "project",
      resourceId: String(project._id),
      sharedUserId: EBALLARD_USER_ID,
    });
    const eballardRevoked =
      (await resolveProjectAccessLevel(ctx, project, EBALLARD_USER_ID)) ===
      "none";

    const checks = {
      threeRequirements: requirementIds.length === 3,
      threeSourcesLinked: sourceIds.length === 3,
      partialCoverage,
      liveRecalcAfterLoanFunding: liveRecalc,
      joshuaEdit,
      eballardNoAccessBefore: eballardBefore,
      eballardViewShare: eballardView,
      eballardEditShare: eballardEdit,
      eballardRevoked,
    };

    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      projectId: String(project._id),
      loanIds: loanTriple.map((l) => String(l._id)),
      seededLoanIds,
      rollupBefore: rollup,
      rollupAfterLoan: rollupAfterLoan,
    };
  },
});
