/**
 * Removable demo workspace: sample pipeline files, contacts, org lenders, and tasks.
 * All seeded rows carry `demoBundleId` + org flag on `organizations.demoWorkspaceBundleId`.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertCanDeletePipelineRow,
  assertCanMutateContactRow,
  assertOrgMember,
  assertOrgPermission,
  assertOrgScopeArgs,
  resolveMemberUserKey,
} from "./organizationAccess";
import {
  assertCanAddOrgPipelineFile,
  countOrgPipelineFiles,
} from "./orgPlanLimits";
import { maxPipelineFilesForPlan } from "../lib/orgPlanLimits";
import { normalizeOrganizationPlan } from "../lib/orgPlanFeatures";
import { insertDemoWorkspacePipelineFile } from "./pipeline";
import { insertDemoWorkspaceLender } from "./lenders";
import {
  deleteContactGraph,
  insertDemoWorkspaceContact,
} from "./contacts";
import {
  deleteDemoWorkspaceTaskTree,
  insertDemoWorkspaceTask,
} from "./tasks";
import {
  deletePipelineGraph,
  purgeLenderRelationsBeforeDelete,
} from "./graphCleanup";
import { deleteAllForLender } from "./lenderFiles";
import { applyLenderWrite } from "./lenderWriteStats";

export const DEMO_WORKSPACE_BUNDLE_ID = "demo_workspace_v1";

const DEMO_FILES_NEEDED = 2;

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

export const status = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const org = await ctx.db.get(organizationId);
    const bundleId = DEMO_WORKSPACE_BUNDLE_ID;
    const [pipelines, contacts, lenders, tasks] = await Promise.all([
      ctx.db
        .query("pipeline")
        .withIndex("by_org_demoBundle", (q) =>
          q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
        )
        .collect(),
      ctx.db
        .query("contacts")
        .withIndex("by_org_demoBundle", (q) =>
          q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
        )
        .collect(),
      ctx.db
        .query("lenders")
        .withIndex("by_org_demoBundle", (q) =>
          q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
        )
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_org_demoBundle", (q) =>
          q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
        )
        .collect(),
    ]);
    const plan = normalizeOrganizationPlan(org?.plan);
    const cap = maxPipelineFilesForPlan(plan);
    const nFiles = await countOrgPipelineFiles(ctx, organizationId);
    const loadBlockedByPlan =
      cap !== null && nFiles + DEMO_FILES_NEEDED > cap;
    const byFlag = org?.demoWorkspaceBundleId === bundleId;
    const byRows = pipelines.length > 0;
    return {
      bundleId,
      loaded: byFlag || byRows,
      counts: {
        pipeline: pipelines.length,
        contacts: contacts.length,
        lenders: lenders.length,
        tasks: tasks.length,
      },
      plan,
      pipelineFileCount: nFiles,
      pipelineFileCap: cap,
      canLoadDemo:
        !loadBlockedByPlan &&
        !byFlag &&
        !byRows,
      loadBlockedReason: loadBlockedByPlan
        ? `This team’s plan allows ${cap} pipeline files and you have ${nFiles}. Remove files or upgrade to load the demo.`
        : null,
    };
  },
});

export const load = mutation({
  args: {
    ...orgArgs,
    preferencesAccountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, preferencesAccountId } = args;
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    await assertOrgMember(ctx, organizationId, key);
    await assertOrgPermission(ctx, organizationId, key, "files.edit");
    await assertOrgPermission(ctx, organizationId, key, "contacts.manage");

    const org = await ctx.db.get(organizationId);
    const bundleId = DEMO_WORKSPACE_BUNDLE_ID;

    const existingDemoPipelines = await ctx.db
      .query("pipeline")
      .withIndex("by_org_demoBundle", (q) =>
        q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
      )
      .collect();
    if (
      org?.demoWorkspaceBundleId === bundleId ||
      existingDemoPipelines.length > 0
    ) {
      if (org && org.demoWorkspaceBundleId !== bundleId) {
        const now = Date.now();
        await ctx.db.patch(organizationId, {
          demoWorkspaceBundleId: bundleId,
          updatedAt: now,
        });
      }
      return { ok: true as const, alreadyLoaded: true as const };
    }

    await assertCanAddOrgPipelineFile(ctx, organizationId);
    const plan = normalizeOrganizationPlan(org?.plan);
    const cap = maxPipelineFilesForPlan(plan);
    const nFiles = await countOrgPipelineFiles(ctx, organizationId);
    if (cap !== null && nFiles + DEMO_FILES_NEEDED > cap) {
      throw new Error(
        `Cannot load demo: pipeline file limit (${nFiles} of ${cap} on ${plan} plan).`,
      );
    }

    const oidSlug = String(organizationId).replace(/[^a-z0-9]+/gi, "").slice(-12) ||
      "org";
    const now = Date.now();
    const commonNote =
      "Sample record from Demo workspace — removable anytime under Settings → Getting started.";

    const lenderA = await insertDemoWorkspaceLender(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      fields: {
        company: "[Demo] Meridian Bridge Capital",
        contactName: "Jordan Lee",
        email: `demo-meridian-${oidSlug}@demo.invalid`,
        phone: "(555) 010-0456",
        website: "https://example.com/demo-meridian",
        entityType: "Hard Money / Bridge Lender",
        primaryNiche: "Commercial bridge & light rehab",
        programs: "12–24 mo bridge, interest-only, asset-backed",
        propertyTypes: "Retail, office, multifamily, mixed-use",
        statesServed: "AZ, CA, NV, OR, WA",
        fundingAmountMin: "250000",
        fundingAmountMax: "15000000",
        notes: commonNote,
        source: "Demo workspace",
        section: "Demo workspace",
      },
    });

    const lenderB = await insertDemoWorkspaceLender(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      fields: {
        company: "[Demo] Harbor Trust Funding",
        contactName: "Sam Rivera",
        email: `demo-harbor-${oidSlug}@demo.invalid`,
        phone: "(555) 010-0789",
        website: "https://example.com/demo-harbor",
        entityType: "Bank / Commercial Lender",
        primaryNiche: "SBA 7(a) & conventional commercial",
        programs: "7(a), 504, equipment term",
        propertyTypes: "Industrial, owner-occupied CRE, specialty use",
        statesServed: "National",
        fundingAmountMin: "150000",
        fundingAmountMax: "5000000",
        notes: commonNote,
        source: "Demo workspace",
        section: "Demo workspace",
      },
    });

    const contactBorrower = await insertDemoWorkspaceContact(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      name: "[Demo] Alex Morgan",
      email: `demo-borrower-${oidSlug}@demo.invalid`,
      phone: "(555) 010-0301",
      notes: commonNote,
      companyName: "Riverline Retail Holdings LLC",
      contactRoleId: "client",
    });

    const contactReferral = await insertDemoWorkspaceContact(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      name: "[Demo] Priya Shah",
      email: `demo-referral-${oidSlug}@demo.invalid`,
      phone: "(555) 010-0302",
      notes: commonNote,
      companyName: "Northwind Business Brokers",
      contactRoleId: "referral_partner",
    });

    const fileRiverline = await insertDemoWorkspacePipelineFile(ctx, {
      organizationId,
      memberUserKey: key,
      preferencesAccountId: preferencesAccountId?.trim() || undefined,
      demoBundleId: bundleId,
      fileName: "[Demo] Riverline Retail — Bridge refinance",
      status: "Underwriting",
      fundingAmount: 2_650_000,
      rate: 10.25,
      term: "18 months IO",
      propertyAddress: "1200 Market St, Phoenix, AZ",
      lenders: [lenderA],
      contacts: [
        {
          name: "[Demo] Alex Morgan",
          email: `demo-borrower-${oidSlug}@demo.invalid`,
          phone: "(555) 010-0301",
          company: "Riverline Retail Holdings LLC",
        },
      ],
      clientName: "[Demo] Riverline Retail Holdings LLC",
      projectName: "Metro strip center — bridge recap",
    });

    const fileNorthwind = await insertDemoWorkspacePipelineFile(ctx, {
      organizationId,
      memberUserKey: key,
      preferencesAccountId: preferencesAccountId?.trim() || undefined,
      demoBundleId: bundleId,
      fileName: "[Demo] Northwind Logistics — Equipment term loan",
      status: "Term sheet",
      fundingAmount: 890_000,
      rate: 8.4,
      term: "7-year amortizing",
      propertyAddress: "Industrial yard + fleet HQ, Tacoma, WA",
      lenders: [lenderB],
      contacts: [
        {
          name: "[Demo] Priya Shah",
          email: `demo-referral-${oidSlug}@demo.invalid`,
          phone: "(555) 010-0302",
          company: "Northwind Business Brokers",
        },
      ],
      clientName: "[Demo] Northwind Logistics Inc.",
      projectName: "Fleet modernization & warehouse lift",
    });

    await ctx.db.insert("contactFileLinks", {
      contactId: contactBorrower,
      fileId: fileRiverline,
      role: "[Demo] Primary borrower",
      contactRoleId: "client",
      notes: commonNote,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("contactFileLinks", {
      contactId: contactReferral,
      fileId: fileNorthwind,
      role: "[Demo] Referral source",
      contactRoleId: "referral_partner",
      notes: commonNote,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("contactLenderLinks", {
      contactId: contactReferral,
      lenderId: lenderB,
      role: "[Demo] Introducer",
      contactRoleId: "referral_partner",
      notes: commonNote,
      createdAt: now,
      updatedAt: now,
    });

    const dueSoon = now + 3 * 24 * 60 * 60 * 1000;

    await insertDemoWorkspaceTask(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      title: "[Demo] Call Meridian — appraisal scope",
      description:
        "Confirm the appraisal is ordered for the Phoenix retail center (demo task).",
      type: "work",
      category: "call",
      quadrant: 2,
      status: "todo",
      priority: 2,
      dueDate: dueSoon,
      relatedFileId: fileRiverline,
      checklist: [
        { text: "Confirm borrower contact for access", done: false },
        { text: "Get ETA on draft report", done: false },
      ],
    });

    await insertDemoWorkspaceTask(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      title: "[Demo] Send term sheet summary to borrower",
      description:
        "Share the high-level economics with Alex (demo).",
      type: "work",
      category: "admin",
      quadrant: 1,
      status: "in_progress",
      priority: 3,
      relatedFileId: fileRiverline,
      relatedContactId: contactBorrower,
    });

    await insertDemoWorkspaceTask(ctx, {
      organizationId,
      memberUserKey: key,
      demoBundleId: bundleId,
      title: "[Demo] Review Harbor guidelines — specialty use",
      description: "Skim collateral policy for industrial + fleet HQ (demo).",
      type: "work",
      category: "research",
      quadrant: 2,
      status: "todo",
      priority: 1,
      relatedFileId: fileNorthwind,
    });

    await ctx.db.patch(organizationId, {
      demoWorkspaceBundleId: bundleId,
      updatedAt: now,
    });

    return { ok: true as const, alreadyLoaded: false as const };
  },
});

export const remove = mutation({
  args: orgArgs,
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    await assertOrgMember(ctx, organizationId, key);
    await assertOrgPermission(ctx, organizationId, key, "files.delete");
    await assertOrgPermission(ctx, organizationId, key, "contacts.manage");

    const bundleId = DEMO_WORKSPACE_BUNDLE_ID;

    const demoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_org_demoBundle", (q) =>
        q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
      )
      .collect();
    const taskIds = new Set(demoTasks.map((t) => t._id));
    const roots = demoTasks.filter(
      (t) =>
        t.parentTaskId == null ||
        (t.parentTaskId != null && !taskIds.has(t.parentTaskId)),
    );
    for (const root of roots) {
      await deleteDemoWorkspaceTaskTree(ctx, root._id);
    }

    const pipelines = await ctx.db
      .query("pipeline")
      .withIndex("by_org_demoBundle", (q) =>
        q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
      )
      .collect();
    for (const row of pipelines) {
      await assertCanDeletePipelineRow(ctx, row, key);
      await deletePipelineGraph(ctx, row._id);
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org_demoBundle", (q) =>
        q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
      )
      .collect();
    for (const row of contacts) {
      await assertCanMutateContactRow(ctx, row, key);
      await deleteContactGraph(ctx, row._id);
      await ctx.db.delete(row._id);
    }

    const lenders = await ctx.db
      .query("lenders")
      .withIndex("by_org_demoBundle", (q) =>
        q.eq("organizationId", organizationId).eq("demoBundleId", bundleId),
      )
      .collect();
    for (const row of lenders) {
      await deleteAllForLender(ctx, row._id);
      await purgeLenderRelationsBeforeDelete(ctx, row._id);
      await ctx.db.delete(row._id);
      await applyLenderWrite(ctx, row, null);
    }

    const orgRow = await ctx.db.get(organizationId);
    if (orgRow) {
      await ctx.db.patch(organizationId, {
        demoWorkspaceBundleId: undefined,
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});
