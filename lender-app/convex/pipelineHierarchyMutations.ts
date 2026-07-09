/**
 * Phase 13.3 — Transactional hierarchy create flows (additive; legacy paths unchanged).
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { buildInitialIntakeDocument } from "./intakeDocumentDefaults";
import {
  assertLenderAttachableToPipeline,
  assertOrgMember,
} from "./organizationAccess";
import { assertCanAddOrgPipelineFile } from "./orgPlanLimits";
import {
  ownerFieldsForInsert,
  resolveClientAccessLevel,
  resolveProjectAccessLevel,
} from "./resourceAccess";
import { resolveMemberUserKey } from "./organizationAccess";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import type { MutationCtx } from "./_generated/server";
import {
  ensurePrimaryLoanClientLink,
  ensurePrimaryProjectClientLink,
} from "./pipelineMultiClientLinks";
import {
  layoutToDbFields,
  resolveNewFileDrawerLayout,
} from "./pipelineGlobalBlockConfigHelpers";
import { finalizeDrawerLayoutRespectingOrgPlan } from "./organizationPlan";
import { buildNewFilePipelineMetricsContext } from "../lib/userPreferencesNewFileDrawer";
import { resolveOrCreateClientForHierarchy } from "./pipelineHierarchyClientResolve";

const contactItem = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  company: v.optional(v.string()),
});

const loanFileShellArgs = {
  fileName: v.string(),
  status: v.string(),
  fundingAmount: v.float64(),
  rate: v.float64(),
  term: v.string(),
  propertyAddress: v.optional(v.string()),
  lenders: v.array(v.id("lenders")),
  contacts: v.array(contactItem),
};

/** Phase Modular-E — optional New File wizard extras (template + portal queue). */
const wizardTemplateArgs = {
  /** Built-in strategy template id (`lib/pipelineFileTemplates.ts`). */
  catalogFileTemplateId: v.optional(v.string()),
  /** User-saved loan template (favorites/checklist applied by the wizard client). */
  userPipelineFileTemplateId: v.optional(v.id("pipelineFileUserTemplates")),
  /** Portal document requests queued until the borrower is invited. */
  pendingPortalChecklist: v.optional(
    v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        folderName: v.optional(v.string()),
      }),
    ),
  ),
};

type WizardTemplateOptions = {
  catalogFileTemplateId?: string;
  userPipelineFileTemplateId?: Id<"pipelineFileUserTemplates">;
  pendingPortalChecklist?: {
    title: string;
    description?: string;
    folderName?: string;
  }[];
};

const memberArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.string(),
};

async function ownerFieldsForActor(
  ctx: MutationCtx,
  memberUserKey: string,
) {
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  return ownerFieldsForInsert(key);
}

async function assertCanEditClient(
  ctx: MutationCtx,
  client: Doc<"clients">,
  memberUserKey: string,
) {
  const level = await resolveClientAccessLevel(ctx, client, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to modify this client.");
  }
}

async function assertCanEditProject(
  ctx: MutationCtx,
  project: Doc<"projects">,
  memberUserKey: string,
) {
  const level = await resolveProjectAccessLevel(ctx, project, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to modify this project.");
  }
}

async function insertLoanFile(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    clientId: Id<"clients">;
    projectId: Id<"projects">;
    clientName: string;
    projectName: string;
    fileName: string;
    status: string;
    fundingAmount: number;
    rate: number;
    term: string;
    propertyAddress?: string;
    lenders: Id<"lenders">[];
    contacts: Doc<"pipeline">["contacts"];
    wizard?: WizardTemplateOptions;
  },
): Promise<Id<"pipeline">> {
  const orgStub = { organizationId: args.organizationId } as Doc<"pipeline">;
  for (const lid of args.lenders) {
    const lender = await ctx.db.get(lid);
    if (!lender) throw new Error(`Lender not found: ${lid}`);
    assertLenderAttachableToPipeline(lender, orgStub);
  }
  const dealData = buildInitialIntakeDocument({
    clientName: args.clientName,
    projectName: args.projectName,
    fileName: args.fileName.trim() || undefined,
  });
  const now = Date.now();

  const body = {
    fileName:
      args.fileName.trim() || `${args.clientName} – ${args.projectName}`,
    status: args.status.trim() || "Unknown",
    fundingAmount: args.fundingAmount,
    rate: args.rate,
    term: args.term.trim() || "",
    propertyAddress: args.propertyAddress?.trim() || undefined,
    notes: undefined,
    lenders: args.lenders,
    contacts: args.contacts.map((c) => ({
      name: c.name.trim() || "Unknown",
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      company: c.company?.trim() || undefined,
    })),
  };

  // Phase Modular-E — when the wizard picks a strategy template, resolve and
  // persist the drawer layout at creation (same chain as pipeline.addFile).
  let drawerLayoutField: Pick<Doc<"pipeline">, "fileDrawerLayout"> | undefined;
  const wizard = args.wizard;
  if (wizard?.catalogFileTemplateId || wizard?.userPipelineFileTemplateId) {
    const metrics = buildNewFilePipelineMetricsContext({
      body: {
        ...body,
        organizationId: args.organizationId,
        clientId: args.clientId,
        projectId: args.projectId,
      } as Parameters<typeof buildNewFilePipelineMetricsContext>[0]["body"],
      dealData,
      intakeSheetId: undefined,
    });
    const drawerUnscoped = await resolveNewFileDrawerLayout(
      ctx,
      args.memberUserKey,
      metrics,
      {
        catalogFileTemplateId: wizard.catalogFileTemplateId,
        userPipelineFileTemplateId: wizard.userPipelineFileTemplateId,
      },
    );
    const drawer = await finalizeDrawerLayoutRespectingOrgPlan(
      ctx,
      args.organizationId,
      drawerUnscoped,
    );
    drawerLayoutField = {
      fileDrawerLayout: { v: 1 as const, ...layoutToDbFields(drawer) },
    };
  }

  const pendingChecklist = (wizard?.pendingPortalChecklist ?? [])
    .map((item) => ({
      title: item.title.trim().slice(0, 200),
      description: item.description?.trim().slice(0, 4000) || undefined,
      folderName: item.folderName?.trim().slice(0, 120) || undefined,
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 40);

  const fileId = await ctx.db.insert("pipeline", {
    ...body,
    dealData,
    intakeSheetId: undefined,
    organizationId: args.organizationId,
    clientId: args.clientId,
    projectId: args.projectId,
    ...(await ownerFieldsForActor(ctx, args.memberUserKey)),
    ...(drawerLayoutField ?? {}),
    ...(pendingChecklist.length > 0
      ? { pendingPortalChecklist: pendingChecklist }
      : {}),
    createdAt: now,
    updatedAt: now,
  });
  const inserted = await ctx.db.get(fileId);
  if (inserted) {
    await ensurePrimaryLoanClientLink(ctx, inserted);
  }
  await refreshPipelineGlobalSearchText(ctx, fileId);
  return fileId;
}

/** Create loan file under an existing normalized project. */
export const createLoanFileUnderProject = mutation({
  args: {
    ...memberArgs,
    projectId: v.id("projects"),
    ...loanFileShellArgs,
    ...wizardTemplateArgs,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertCanAddOrgPipelineFile(ctx, args.organizationId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertCanEditProject(ctx, project, args.memberUserKey);
    const client = await ctx.db.get(project.clientId);
    if (!client) throw new Error("Client not found.");
    const funding = args.fundingAmount;
    if (!Number.isFinite(funding) || funding < 0) {
      throw new Error("Provide a non-negative fundingAmount.");
    }
    const fileId = await insertLoanFile(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      clientId: project.clientId,
      projectId: project._id,
      clientName: client.displayName,
      projectName: project.title,
      fileName: args.fileName,
      status: args.status,
      fundingAmount: funding,
      rate: args.rate,
      term: args.term,
      propertyAddress: args.propertyAddress,
      lenders: args.lenders,
      contacts: args.contacts,
      wizard: {
        catalogFileTemplateId: args.catalogFileTemplateId,
        userPipelineFileTemplateId: args.userPipelineFileTemplateId,
        pendingPortalChecklist: args.pendingPortalChecklist,
      },
    });
    return { clientId: project.clientId, projectId: project._id, fileId };
  },
});

/** Create project + loan file under an existing client. */
export const createProjectUnderClient = mutation({
  args: {
    ...memberArgs,
    clientId: v.id("clients"),
    projectTitle: v.string(),
    projectPurpose: v.optional(v.string()),
    targetFunding: v.optional(v.float64()),
    ...loanFileShellArgs,
    ...wizardTemplateArgs,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertCanAddOrgPipelineFile(ctx, args.organizationId);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      throw new Error("Client not found.");
    }
    await assertCanEditClient(ctx, client, args.memberUserKey);
    const title = args.projectTitle.trim();
    if (!title) throw new Error("Project title is required.");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      clientId: client._id,
      organizationId: args.organizationId,
      title,
      normalizedTitle: normalizeHierarchyName(title),
      purpose: args.projectPurpose?.trim() || undefined,
      status: "active",
      targetFunding: args.targetFunding,
      completionPercent: undefined,
      ...(await ownerFieldsForActor(ctx, args.memberUserKey)),
      createdAt: now,
      updatedAt: now,
    });
    const insertedProject = await ctx.db.get(projectId);
    if (insertedProject) {
      await ensurePrimaryProjectClientLink(ctx, insertedProject);
    }
    const funding = args.fundingAmount;
    if (!Number.isFinite(funding) || funding < 0) {
      throw new Error("Provide a non-negative fundingAmount.");
    }
    const fileId = await insertLoanFile(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      clientId: client._id,
      projectId,
      clientName: client.displayName,
      projectName: title,
      fileName: args.fileName,
      status: args.status,
      fundingAmount: funding,
      rate: args.rate,
      term: args.term,
      propertyAddress: args.propertyAddress,
      lenders: args.lenders,
      contacts: args.contacts,
      wizard: {
        catalogFileTemplateId: args.catalogFileTemplateId,
        userPipelineFileTemplateId: args.userPipelineFileTemplateId,
        pendingPortalChecklist: args.pendingPortalChecklist,
      },
    });
    return { clientId: client._id, projectId, fileId };
  },
});

/** Create client + project + loan file in one transaction. */
export const createClientProjectAndLoanFile = mutation({
  args: {
    ...memberArgs,
    clientDisplayName: v.string(),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    primaryContactPhone: v.optional(v.string()),
    /** Reuse existing CRM contact — strict lookup before client insert. */
    primaryContactId: v.optional(v.id("contacts")),
    /** Reuse existing client row (entity party or deduped client). */
    existingClientId: v.optional(v.id("clients")),
    companyName: v.optional(v.string()),
    projectTitle: v.string(),
    /** Nest file under an existing project instead of creating a new one. */
    existingProjectId: v.optional(v.id("projects")),
    projectPurpose: v.optional(v.string()),
    targetFunding: v.optional(v.float64()),
    ...loanFileShellArgs,
    ...wizardTemplateArgs,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertCanAddOrgPipelineFile(ctx, args.organizationId);
    const displayName = args.clientDisplayName.trim();
    if (!displayName) throw new Error("Client display name is required.");

    const clientId = await resolveOrCreateClientForHierarchy(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      clientDisplayName: displayName,
      primaryContactId: args.primaryContactId,
      existingClientId: args.existingClientId,
      primaryContactName: args.primaryContactName,
      primaryContactEmail: args.primaryContactEmail,
      primaryContactPhone: args.primaryContactPhone,
      companyName: args.companyName,
    });

    const funding = args.fundingAmount;
    if (!Number.isFinite(funding) || funding < 0) {
      throw new Error("Provide a non-negative fundingAmount.");
    }

    if (args.existingProjectId) {
      const project = await ctx.db.get(args.existingProjectId);
      if (!project || project.organizationId !== args.organizationId) {
        throw new Error("Project not found.");
      }
      if (String(project.clientId) !== String(clientId)) {
        throw new Error("Project does not belong to the selected client.");
      }
      await assertCanEditProject(ctx, project, args.memberUserKey);
      const fileId = await insertLoanFile(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        clientId,
        projectId: project._id,
        clientName: displayName,
        projectName: project.title,
        fileName: args.fileName,
        status: args.status,
        fundingAmount: funding,
        rate: args.rate,
        term: args.term,
        propertyAddress: args.propertyAddress,
        lenders: args.lenders,
        contacts: args.contacts,
        wizard: {
          catalogFileTemplateId: args.catalogFileTemplateId,
          userPipelineFileTemplateId: args.userPipelineFileTemplateId,
          pendingPortalChecklist: args.pendingPortalChecklist,
        },
      });
      return { clientId, projectId: project._id, fileId };
    }

    const title = args.projectTitle.trim();
    if (!title) throw new Error("Project title is required.");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      clientId,
      organizationId: args.organizationId,
      title,
      normalizedTitle: normalizeHierarchyName(title),
      purpose: args.projectPurpose?.trim() || undefined,
      status: "active",
      targetFunding: args.targetFunding,
      completionPercent: undefined,
      ...(await ownerFieldsForActor(ctx, args.memberUserKey)),
      createdAt: now,
      updatedAt: now,
    });
    const insertedStackProject = await ctx.db.get(projectId);
    if (insertedStackProject) {
      await ensurePrimaryProjectClientLink(ctx, insertedStackProject);
    }
    const fileId = await insertLoanFile(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      clientId,
      projectId,
      clientName: displayName,
      projectName: title,
      fileName: args.fileName,
      status: args.status,
      fundingAmount: funding,
      rate: args.rate,
      term: args.term,
      propertyAddress: args.propertyAddress,
      lenders: args.lenders,
      contacts: args.contacts,
      wizard: {
        catalogFileTemplateId: args.catalogFileTemplateId,
        userPipelineFileTemplateId: args.userPipelineFileTemplateId,
        pendingPortalChecklist: args.pendingPortalChecklist,
      },
    });
    return { clientId, projectId, fileId };
  },
});
