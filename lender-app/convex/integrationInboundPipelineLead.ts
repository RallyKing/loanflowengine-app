/**
 * Inbound CRM webhook → contact + pipeline file upsert.
 * Invoked by `organizationIntegrationWorkflows` action `upsert_pipeline_lead`.
 */
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  extractInboundLeadFields,
  mapInboundStageToStatusSlug,
  resolveInboundEntityCompanyFields,
  sanitizeInboundScalarString,
  type InboundLeadFields,
} from "../lib/integrations/inboundLeadPayload";
import { normalizeEmailKey } from "../lib/crmRelationship";
import { normalizePhoneDigits } from "../lib/indexedGraphStickiness";
import {
  contactMethodsToConvexFields,
  normalizeContactMethods,
} from "../lib/contact/contactMethods";
import { DEFAULT_CONTACT_ROLE_IDS } from "../lib/contact/contactRoles";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { buildInitialIntakeDocument } from "./intakeDocumentDefaults";
import { assertCanAddOrgPipelineFile } from "./orgPlanLimits";
import { ensureConfirmInterestNewLeadTask } from "./integrationFileTask";
import {
  appendPipelineFileActivity,
} from "./pipelineFileActivity";
import {
  findStageBySlug,
  findStageForPipelineStatus,
} from "./organizationPipelineStagesHelpers";
import {
  refreshContactGlobalSearchText,
  refreshPipelineGlobalSearchText,
} from "./globalSearchSync";
import { syncFileClientTitleFromPrimaryParties } from "./pipelineClientTitleSync";
import { ownerFieldsForInsert } from "./resourceAccess";
import { sanitizeOrganizationIntegrationRules } from "../lib/orgIntegrationWorkflowsModel";
import { refreshContactCrmListFields } from "./contactCrmListFields";
import { resolveOrCreateClientForHierarchy } from "./pipelineHierarchyClientResolve";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import {
  ensurePrimaryLoanClientLink,
  ensurePrimaryProjectClientLink,
} from "./pipelineMultiClientLinks";
import { ensureClientFromBusiness } from "./entityCanonicalization";
import { upsertEntityContactLink } from "./entityContactLinkHelpers";
import { REGISTRY_ROLE_IDS } from "../lib/registry/universalRoles";

/** Placeholder project title — ops rename after the first client call. */
const INBOUND_TBD_PROJECT_TITLE = "TBD";

type UpsertResult = {
  created: boolean;
  fileId: Id<"pipeline">;
  contactId: Id<"contacts">;
  /** Hierarchy client (business entity when company/business was present). */
  clientId: Id<"clients"> | null;
  /** Same as clientId when inbound created/linked a business entity. */
  entityClientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  status: string;
  stageId: Id<"organizationPipelineStages"> | null;
};

/** Prefer existing non-empty strings; fill from inbound when empty. */
function fillEmptyString(
  existing: string | undefined | null,
  incoming: string | undefined | null,
): string | undefined {
  // Treat GHL literal "null" / "undefined" as empty so re-webhooks can repair.
  const cur = sanitizeInboundScalarString(existing);
  if (cur) return cur;
  return sanitizeInboundScalarString(incoming);
}

function buildPrimaryBorrowerRow(
  lead: InboundLeadFields,
  contactId: Id<"contacts">,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const prev = existing && typeof existing === "object" ? existing : {};
  const firstName =
    fillEmptyString(
      typeof prev.firstName === "string" ? prev.firstName : null,
      lead.firstName,
    ) ?? "";
  const lastName =
    fillEmptyString(
      typeof prev.lastName === "string" ? prev.lastName : null,
      lead.lastName,
    ) ?? "";
  const email =
    fillEmptyString(
      typeof prev.email === "string" ? prev.email : null,
      lead.email,
    ) ?? "";
  const mobile =
    fillEmptyString(
      typeof prev.mobile === "string" ? prev.mobile : null,
      lead.phone,
    ) ?? "";
  return {
    ...prev,
    contactId,
    firstName,
    lastName,
    email,
    mobile,
  };
}

function phoneDigitsMatch(
  stored: string | undefined,
  incomingDigits: string,
): boolean {
  if (!incomingDigits || incomingDigits.length < 7) return false;
  const storedDigits = normalizePhoneDigits(stored);
  if (!storedDigits) return false;
  return (
    storedDigits === incomingDigits ||
    storedDigits.endsWith(incomingDigits) ||
    incomingDigits.endsWith(storedDigits)
  );
}

async function findOrgContact(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  email: string | undefined,
  phone: string | undefined,
): Promise<Doc<"contacts"> | null> {
  const emailKey = email ? normalizeEmailKey(email) : null;
  if (emailKey) {
    const byEmail = await ctx.db
      .query("contacts")
      .withIndex("by_organization_emailKey", (q) =>
        q.eq("organizationId", organizationId).eq("emailKey", emailKey),
      )
      .first();
    if (byEmail) return byEmail;
  }

  const digits = normalizePhoneDigits(phone);
  if (!digits || digits.length < 7) return null;

  // Bounded scan for phone-only match (email path is preferred).
  const recent = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .take(400);
  for (const row of recent) {
    if (phoneDigitsMatch(row.phone, digits)) return row;
    for (const entry of row.phones ?? []) {
      if (phoneDigitsMatch(entry.number, digits)) return row;
    }
  }
  return null;
}

async function findLinkedPipelineFile(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  contactId: Id<"contacts">,
  externalId: string | undefined,
): Promise<Doc<"pipeline"> | null> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .order("desc")
    .take(40);

  let fallback: Doc<"pipeline"> | null = null;
  for (const link of links) {
    const file = await ctx.db.get(link.fileId);
    if (!file || file.organizationId !== organizationId) continue;
    const inbound = (
      file.dealData as
        | { integrationInbound?: { externalId?: string } }
        | undefined
    )?.integrationInbound;
    if (externalId && inbound?.externalId === externalId) {
      return file;
    }
    if (!fallback) fallback = file;
  }
  return fallback;
}

async function ensurePrimaryBorrowerLink(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  fileId: Id<"pipeline">,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contactId).eq("fileId", fileId),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: "Primary Borrower",
      registryRoleId: "primary_borrower",
      contactRoleId: "primary_borrower",
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("contactFileLinks", {
    contactId,
    fileId,
    role: "Primary Borrower",
    registryRoleId: "primary_borrower",
    contactRoleId: "primary_borrower",
    createdAt: now,
    updatedAt: now,
  });
}

async function resolveStageForLead(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  statusSlug: string,
): Promise<Doc<"organizationPipelineStages"> | null> {
  const bySlug = await findStageBySlug(ctx, organizationId, statusSlug);
  if (bySlug) return bySlug;
  return await findStageForPipelineStatus(ctx, organizationId, statusSlug);
}

function clientDisplayNameFromLead(lead: InboundLeadFields): string {
  const parts = [lead.firstName, lead.lastName]
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return lead.name.trim() || "Unknown Client";
}

/**
 * When inbound payload includes business/company name, find-or-create the
 * canonical `clients` entity, link the individual via `entityContactLinks`
 * (primary company), and lightly hydrate `dealData.business`.
 */
export async function ensureInboundBusinessEntity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    contactId: Id<"contacts">;
    file: Doc<"pipeline">;
    lead: InboundLeadFields;
    now: number;
  },
): Promise<{
  file: Doc<"pipeline">;
  entityClientId: Id<"clients"> | null;
}> {
  const companyFields = resolveInboundEntityCompanyFields(args.lead);
  if (!companyFields) {
    return { file: args.file, entityClientId: null };
  }
  const { legalName, companyName, dba } = companyFields;

  const entityClientId = await ensureClientFromBusiness(ctx, {
    organizationId: args.organizationId,
    legalName,
    dba,
    primaryContactId: args.contactId,
    ownerUserKey: args.ownerUserKey,
  });

  // Ensure primaryContactId / companyName when the entity already existed.
  const entity = await ctx.db.get(entityClientId);
  if (entity) {
    const entityPatch: Partial<Doc<"clients">> = {};
    if (!entity.primaryContactId) {
      entityPatch.primaryContactId = args.contactId;
    }
    // Fill-empty + repair literal "null" from prior inbound bugs.
    const existingCompany = sanitizeInboundScalarString(entity.companyName);
    if (!existingCompany) {
      entityPatch.companyName = companyName;
    }
    if (Object.keys(entityPatch).length > 0) {
      await ctx.db.patch(entityClientId, {
        ...entityPatch,
        updatedAt: args.now,
      });
    }
  }

  const linkId = await upsertEntityContactLink(ctx, {
    organizationId: args.organizationId,
    entityId: entityClientId,
    contactId: args.contactId,
    position: "Primary Contact",
    registryRoleId: REGISTRY_ROLE_IDS.primaryBorrower,
  });
  const link = await ctx.db.get(linkId);
  if (link && link.isPrimaryCompany !== true) {
    // Clear other primary flags for this contact, then set this one.
    const siblings = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    for (const row of siblings) {
      if (row.isPrimaryCompany && String(row._id) !== String(linkId)) {
        await ctx.db.patch(row._id, {
          isPrimaryCompany: false,
          updatedAt: args.now,
        });
      }
    }
    await ctx.db.patch(linkId, {
      isPrimaryCompany: true,
      updatedAt: args.now,
    });
  }

  const prevDeal =
    args.file.dealData && typeof args.file.dealData === "object"
      ? (args.file.dealData as Record<string, unknown>)
      : {};
  const prevBusiness =
    prevDeal.business &&
    typeof prevDeal.business === "object" &&
    !Array.isArray(prevDeal.business)
      ? (prevDeal.business as Record<string, unknown>)
      : {};
  const nextLegal =
    sanitizeInboundScalarString(
      typeof prevBusiness.legalName === "string" ? prevBusiness.legalName : null,
    ) ?? legalName;
  // Always populate DBA from inbound company (repair empty / literal "null").
  const nextDba =
    sanitizeInboundScalarString(
      typeof prevBusiness.dba === "string" ? prevBusiness.dba : null,
    ) ?? dba;
  await ctx.db.patch(args.file._id, {
    dealData: {
      ...prevDeal,
      business: {
        ...prevBusiness,
        legalName: nextLegal,
        dba: nextDba,
        // Entity Details "COMPANY NAME" also reads companyName on some surfaces.
        companyName:
          sanitizeInboundScalarString(
            typeof prevBusiness.companyName === "string"
              ? prevBusiness.companyName
              : null,
          ) ?? companyName,
      },
    },
    updatedAt: args.now,
  });
  const file = (await ctx.db.get(args.file._id))!;
  return { file, entityClientId };
}

/**
 * Ensure Client → Project hierarchy for an inbound pipeline file.
 * Reuses client by primary contact / normalized name; creates a TBD project
 * only when the file lacks `projectId`. Never overwrites an existing project.
 * When business/company is present, the hierarchy client is the entity.
 */
export async function ensureInboundLeadHierarchy(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    contactId: Id<"contacts">;
    file: Doc<"pipeline">;
    lead: InboundLeadFields;
    now: number;
    /** Prefer this entity as hierarchy client when creating a new project. */
    preferredEntityClientId?: Id<"clients"> | null;
  },
): Promise<{
  file: Doc<"pipeline">;
  clientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  createdProject: boolean;
}> {
  const { organizationId, ownerUserKey, contactId, lead, now } = args;
  let file = args.file;

  // Preserve existing hierarchy — inbound updates must not wipe project/client.
  if (file.projectId) {
    const project = await ctx.db.get(file.projectId);
    if (project && project.organizationId === organizationId) {
      let clientId = file.clientId ?? project.clientId;
      if (!file.clientId || String(file.clientId) !== String(project.clientId)) {
        await ctx.db.patch(file._id, {
          clientId: project.clientId,
          updatedAt: now,
        });
        clientId = project.clientId;
        file = (await ctx.db.get(file._id))!;
      }
      await ensurePrimaryProjectClientLink(ctx, project);
      await ensurePrimaryLoanClientLink(ctx, file);
      return {
        file,
        clientId: clientId ?? null,
        projectId: project._id,
        createdProject: false,
      };
    }
  }

  const businessLabel = (lead.businessName ?? "").trim();
  const personLabel = clientDisplayNameFromLead(lead);
  // Prefer business entity as hierarchy client so the entity is not orphaned.
  const displayName = businessLabel || personLabel;
  const contact = await ctx.db.get(contactId);
  const clientId = await resolveOrCreateClientForHierarchy(ctx, {
    organizationId,
    memberUserKey: ownerUserKey,
    clientDisplayName: displayName,
    existingClientId: args.preferredEntityClientId ?? undefined,
    primaryContactId: contactId,
    primaryContactName: contact?.name?.trim() || personLabel,
    primaryContactEmail:
      lead.email?.trim() || contact?.email?.trim() || undefined,
    primaryContactPhone:
      lead.phone?.trim() || contact?.phone?.trim() || undefined,
    companyName: businessLabel || undefined,
  });

  const projectId = await ctx.db.insert("projects", {
    clientId,
    organizationId,
    title: INBOUND_TBD_PROJECT_TITLE,
    normalizedTitle: normalizeHierarchyName(INBOUND_TBD_PROJECT_TITLE),
    purpose: "Inbound lead — rename after first client call",
    status: "active",
    targetFunding: undefined,
    completionPercent: undefined,
    ...ownerFieldsForInsert(ownerUserKey),
    createdAt: now,
    updatedAt: now,
  });
  const project = (await ctx.db.get(projectId))!;
  await ensurePrimaryProjectClientLink(ctx, project);

  const prevDeal =
    file.dealData && typeof file.dealData === "object"
      ? (file.dealData as Record<string, unknown>)
      : {};
  const nextDeal = {
    ...prevDeal,
    clientName:
      typeof prevDeal.clientName === "string" && prevDeal.clientName.trim()
        ? prevDeal.clientName
        : displayName,
    projectName:
      typeof prevDeal.projectName === "string" && prevDeal.projectName.trim()
        ? prevDeal.projectName
        : INBOUND_TBD_PROJECT_TITLE,
  };

  await ctx.db.patch(file._id, {
    clientId,
    projectId,
    dealData: nextDeal,
    updatedAt: now,
  });
  file = (await ctx.db.get(file._id))!;
  await ensurePrimaryLoanClientLink(ctx, file);
  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "data_patch",
    keys: ["clientId", "projectId"],
    summary: clampActivitySummary(
      `Linked inbound lead under client “${displayName}” / project “${INBOUND_TBD_PROJECT_TITLE}”`,
    ),
    actorUserKey: ownerUserKey,
  });

  return {
    file,
    clientId,
    projectId,
    createdProject: true,
  };
}

export async function upsertPipelineLeadFromInboundJob(
  ctx: MutationCtx,
  args: {
    jobId: Id<"integrationJobs">;
    defaultStatus?: string;
  },
): Promise<UpsertResult | null> {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.kind !== "inbound_event") return null;

  const lead = extractInboundLeadFields(job.payload);
  if (!lead) return null;

  const defaultStatus = (args.defaultStatus ?? "confirm_interest").trim() ||
    "confirm_interest";
  const statusSlug = mapInboundStageToStatusSlug(lead.stageRaw, defaultStatus);
  const stage = await resolveStageForLead(ctx, job.organizationId, statusSlug);
  const status = stage?.slug ?? statusSlug;

  let connectorPublicId: string | undefined;
  let ownerUserKey: string | undefined;
  if (job.connectorId) {
    const conn = await ctx.db.get(job.connectorId);
    connectorPublicId = conn?.publicId;
    ownerUserKey = conn?.createdByUserKey;
  }
  if (!ownerUserKey?.trim()) {
    throw new Error("Inbound connector owner missing; cannot create org file.");
  }

  const now = Date.now();
  let contact = await findOrgContact(
    ctx,
    job.organizationId,
    lead.email,
    lead.phone,
  );
  let contactId: Id<"contacts">;

  const methods = normalizeContactMethods(
    {
      legacyEmail: lead.email ?? "",
      legacyPhone: lead.phone ?? "",
    },
    normalizeEmailKey,
  );
  const methodFields = contactMethodsToConvexFields(methods);

  if (contact) {
    contactId = contact._id;
    // Fill-empty merge: never wipe richer existing CRM identity/contact methods.
    const patch: Partial<Doc<"contacts">> = {
      updatedAt: now,
    };
    const nextName = fillEmptyString(contact.name, lead.name);
    if (nextName && nextName !== contact.name.trim()) {
      patch.name = nextName;
    }
    const existingEmail = (contact.email ?? "").trim();
    if (!existingEmail && methodFields.email) {
      patch.email = methodFields.email;
      patch.emailKey = methodFields.emailKey;
      patch.emails = methodFields.emails;
    }
    const existingPhone = (contact.phone ?? "").trim();
    if (!existingPhone && methodFields.phone) {
      patch.phone = methodFields.phone;
      patch.phones = methodFields.phones;
    }
    const nextCompany = fillEmptyString(
      contact.companyName,
      lead.businessName ?? lead.companyName,
    );
    if (nextCompany && nextCompany !== (contact.companyName ?? "").trim()) {
      patch.companyName = nextCompany;
    }
    if (Object.keys(patch).length > 1) {
      await ctx.db.patch(contactId, patch);
      await refreshContactGlobalSearchText(ctx, contactId);
    }
  } else {
    contactId = await ctx.db.insert("contacts", {
      name: lead.name,
      ...methodFields,
      notes: "",
      organizationId: job.organizationId,
      contactRoleId: DEFAULT_CONTACT_ROLE_IDS.client,
      contactRoleIds: [DEFAULT_CONTACT_ROLE_IDS.client],
      ...((lead.businessName ?? lead.companyName)
        ? { companyName: lead.businessName ?? lead.companyName }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
    await refreshContactGlobalSearchText(ctx, contactId);
  }

  let file = await findLinkedPipelineFile(
    ctx,
    job.organizationId,
    contactId,
    lead.externalId,
  );
  let created = false;

  const clientName =
    (lead.businessName ?? "").trim() || clientDisplayNameFromLead(lead);
  const projectName = INBOUND_TBD_PROJECT_TITLE;
  const fileName = `${lead.name} — ${projectName}`;
  const inboundMeta = {
    connectorPublicId: connectorPublicId ?? null,
    externalId: lead.externalId ?? null,
    providerKey: job.providerKey,
    lastJobId: String(args.jobId),
    lastReceivedAt: now,
  };

  if (!file) {
    await assertCanAddOrgPipelineFile(ctx, job.organizationId);
    const dealData = {
      ...buildInitialIntakeDocument({
        clientName,
        projectName,
        fileName,
      }),
      sourceType: "integration_inbound",
      integrationInbound: inboundMeta,
      borrowers: [buildPrimaryBorrowerRow(lead, contactId)],
    };
    const fileId = await ctx.db.insert("pipeline", {
      fileName,
      status,
      stageId: stage?._id,
      fundingAmount: 0,
      rate: 0,
      term: "",
      lenders: [],
      contacts: [
        {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        },
      ],
      dealData,
      intakeSheetId: undefined,
      organizationId: job.organizationId,
      ...ownerFieldsForInsert(ownerUserKey),
      createdAt: now,
      updatedAt: now,
    });
    file = (await ctx.db.get(fileId))!;
    created = true;
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "file_created",
      summary: clampActivitySummary(
        `Created from inbound integration (${job.providerKey})`,
      ),
      actorUserKey: ownerUserKey,
    });
    await ctx.scheduler.runAfter(0, internal.webhookOutbound.emitOrgWebhookEvent, {
      organizationId: job.organizationId,
      eventType: "pipeline.file.created",
      resourceType: "pipeline",
      resourceId: fileId,
    });
  } else {
    const prevStatus = file.status;
    const prevDeal =
      file.dealData && typeof file.dealData === "object"
        ? (file.dealData as Record<string, unknown>)
        : {};
    const prevBorrowers = Array.isArray(prevDeal.borrowers)
      ? [...(prevDeal.borrowers as unknown[])]
      : [];
    const existingPrimary =
      prevBorrowers[0] != null && typeof prevBorrowers[0] === "object"
        ? (prevBorrowers[0] as Record<string, unknown>)
        : null;
    const nextPrimary = buildPrimaryBorrowerRow(
      lead,
      contactId,
      existingPrimary,
    );
    if (prevBorrowers.length === 0) {
      prevBorrowers.push(nextPrimary);
    } else {
      prevBorrowers[0] = nextPrimary;
    }
    await ctx.db.patch(file._id, {
      status,
      stageId: stage?._id ?? file.stageId,
      updatedAt: now,
      dealData: {
        ...prevDeal,
        clientName:
          typeof prevDeal.clientName === "string" && prevDeal.clientName.trim()
            ? prevDeal.clientName
            : clientName,
        integrationInbound: inboundMeta,
        borrowers: prevBorrowers,
      },
    });
    file = (await ctx.db.get(file._id))!;
    await appendPipelineFileActivity(ctx, {
      fileId: file._id,
      at: now,
      kind: "data_patch",
      keys: ["status", "stageId", "borrowers"],
      summary: clampActivitySummary(
        `Updated from inbound integration (${prevStatus} → ${status})`,
      ),
      actorUserKey: ownerUserKey,
    });
    if (prevStatus !== status) {
      await ctx.scheduler.runAfter(
        0,
        internal.webhookOutbound.emitOrgWebhookEvent,
        {
          organizationId: job.organizationId,
          eventType: "pipeline.file.updated",
          resourceType: "pipeline",
          resourceId: file._id,
          patchContext: {
            changedKeys: ["status", "stageId"],
            previousStatus: prevStatus,
            nextStatus: status,
          },
        },
      );
    }
  }

  await ensurePrimaryBorrowerLink(ctx, contactId, file._id, now);

  const entityResult = await ensureInboundBusinessEntity(ctx, {
    organizationId: job.organizationId,
    ownerUserKey,
    contactId,
    file,
    lead,
    now,
  });
  file = entityResult.file;

  const hierarchy = await ensureInboundLeadHierarchy(ctx, {
    organizationId: job.organizationId,
    ownerUserKey,
    contactId,
    file,
    lead,
    now,
    preferredEntityClientId: entityResult.entityClientId,
  });
  file = hierarchy.file;

  await refreshContactCrmListFields(ctx, contactId);
  await syncFileClientTitleFromPrimaryParties(ctx, file._id);
  await refreshPipelineGlobalSearchText(ctx, file._id);

  if (created) {
    try {
      await ensureConfirmInterestNewLeadTask(ctx, {
        organizationId: job.organizationId,
        relatedFileId: file._id,
        actorUserKey: ownerUserKey,
        now,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `Confirm Interest NEW LEAD task skipped after file create: ${msg}`,
      );
    }
  }

  return {
    created,
    fileId: file._id,
    contactId,
    clientId: hierarchy.clientId,
    entityClientId: entityResult.entityClientId,
    projectId: hierarchy.projectId,
    status,
    stageId: stage?._id ?? null,
  };
}

/** Apply `upsert_pipeline_lead` for a verified inbound job (automation bridge). */
export const applyFromInboundJob = internalMutation({
  args: {
    jobId: v.id("integrationJobs"),
    defaultStatus: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      created: v.boolean(),
      fileId: v.id("pipeline"),
      contactId: v.id("contacts"),
      clientId: v.union(v.id("clients"), v.null()),
      entityClientId: v.union(v.id("clients"), v.null()),
      projectId: v.union(v.id("projects"), v.null()),
      status: v.string(),
      stageId: v.union(v.id("organizationPipelineStages"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    return await upsertPipelineLeadFromInboundJob(ctx, args);
  },
});

/**
 * Operator: inspect a pipeline file's primary borrower + contact links
 * (used to verify inbound lead repairs).
 */
export const operatorInspectPipelineBorrower = mutation({
  args: {
    operatorSecret: v.string(),
    fileId: v.id("pipeline"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    const file = await ctx.db.get(args.fileId);
    if (!file) return { found: false as const };
    const deal =
      file.dealData && typeof file.dealData === "object"
        ? (file.dealData as Record<string, unknown>)
        : {};
    const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
    const b0 =
      borrowers[0] != null && typeof borrowers[0] === "object"
        ? (borrowers[0] as Record<string, unknown>)
        : null;
    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", file._id))
      .collect();
    const contactId =
      b0 && typeof b0.contactId === "string"
        ? (b0.contactId as Id<"contacts">)
        : links[0]?.contactId;
    const contact = contactId ? await ctx.db.get(contactId) : null;
    const project = file.projectId ? await ctx.db.get(file.projectId) : null;
    const client = file.clientId
      ? await ctx.db.get(file.clientId)
      : project
        ? await ctx.db.get(project.clientId)
        : null;
    return {
      found: true as const,
      fileName: file.fileName,
      clientId: file.clientId ?? null,
      projectId: file.projectId ?? null,
      client: client
        ? { id: client._id, displayName: client.displayName }
        : null,
      project: project
        ? { id: project._id, title: project.title, clientId: project.clientId }
        : null,
      borrower0: b0,
      links: links.map((l) => ({
        contactId: l.contactId,
        role: l.role,
        registryRoleId: l.registryRoleId,
      })),
      contact: contact
        ? {
            id: contact._id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            linkStatus: contact.linkStatus ?? null,
          }
        : null,
    };
  },
});

/**
 * Operator: attach Client + TBD Project to an inbound file that lacks hierarchy.
 * Idempotent when projectId already set.
 */
export const operatorEnsureInboundLeadHierarchy = mutation({
  args: {
    operatorSecret: v.string(),
    fileId: v.id("pipeline"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  returns: v.object({
    found: v.boolean(),
    fileId: v.optional(v.id("pipeline")),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    createdProject: v.optional(v.boolean()),
    skipped: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    const file = await ctx.db.get(args.fileId);
    if (!file) return { found: false as const };
    if (!file.organizationId) {
      return { found: true as const, skipped: "no_organization" };
    }

    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", file._id))
      .collect();
    const deal =
      file.dealData && typeof file.dealData === "object"
        ? (file.dealData as Record<string, unknown>)
        : {};
    const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
    const b0 =
      borrowers[0] != null && typeof borrowers[0] === "object"
        ? (borrowers[0] as Record<string, unknown>)
        : null;
    const contactIdFromBorrower =
      b0 && typeof b0.contactId === "string"
        ? (b0.contactId as Id<"contacts">)
        : null;
    const contactId = contactIdFromBorrower ?? links[0]?.contactId;
    if (!contactId) {
      return { found: true as const, skipped: "no_contact" };
    }

    const contact = await ctx.db.get(contactId);
    const firstName =
      args.firstName?.trim() ||
      (typeof b0?.firstName === "string" ? b0.firstName.trim() : "") ||
      "";
    const lastName =
      args.lastName?.trim() ||
      (typeof b0?.lastName === "string" ? b0.lastName.trim() : "") ||
      "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      contact?.name?.trim() ||
      file.fileName;

    const ownerUserKey =
      file.ownerUserKey?.trim() || file.ownerUserId?.trim() || "";
    if (!ownerUserKey) {
      return { found: true as const, skipped: "no_owner" };
    }

    const lead: InboundLeadFields = {
      name,
      firstName: firstName || name.split(/\s+/)[0] || name,
      lastName:
        lastName ||
        (name.includes(" ") ? name.split(/\s+/).slice(1).join(" ") : ""),
      email:
        (typeof b0?.email === "string" && b0.email.trim()) ||
        contact?.email ||
        undefined,
      phone:
        (typeof b0?.mobile === "string" && b0.mobile.trim()) ||
        (typeof b0?.phone === "string" && b0.phone.trim()) ||
        contact?.phone ||
        undefined,
    };

    const hierarchy = await ensureInboundLeadHierarchy(ctx, {
      organizationId: file.organizationId,
      ownerUserKey,
      contactId,
      file,
      lead,
      now: Date.now(),
    });
    await refreshPipelineGlobalSearchText(ctx, hierarchy.file._id);

    return {
      found: true as const,
      fileId: hierarchy.file._id,
      clientId: hierarchy.clientId,
      projectId: hierarchy.projectId,
      createdProject: hierarchy.createdProject,
    };
  },
});

/**
 * Operator: ensure an enabled upsert_pipeline_lead rule for a connector.
 * Idempotent by rule id (default `ghl-upsert-pipeline-lead:<publicId>`).
 */
export const operatorEnsureUpsertPipelineLeadRule = mutation({
  args: {
    operatorSecret: v.string(),
    organizationId: v.id("organizations"),
    connectorPublicId: v.string(),
    ruleId: v.optional(v.string()),
    name: v.optional(v.string()),
    defaultStatus: v.optional(v.string()),
  },
  returns: v.object({
    workflowId: v.id("organizationIntegrationWorkflows"),
    ruleId: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    const publicId = args.connectorPublicId.trim().toLowerCase();
    if (!publicId) throw new Error("connectorPublicId required");
    const conn = await ctx.db
      .query("integrationConnectors")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .first();
    if (!conn || conn.organizationId !== args.organizationId) {
      throw new Error("Connector not found for organization.");
    }

    const ruleId =
      args.ruleId?.trim() || `ghl-upsert-pipeline-lead:${publicId}`;
    const now = Date.now();
    const existing = await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();

    const nextRule = {
      id: ruleId,
      enabled: true,
      name: args.name?.trim() || "GHL → Pipeline lead",
      connectorPublicId: publicId,
      action: {
        type: "upsert_pipeline_lead" as const,
        defaultStatus: args.defaultStatus?.trim() || "confirm_interest",
      },
    };

    let created = true;
    const prior = existing?.rules ?? [];
    const without = prior.filter((r) => r.id !== ruleId);
    if (without.length !== prior.length) created = false;
    const cleaned = sanitizeOrganizationIntegrationRules([
      ...without,
      nextRule,
    ]);

    if (existing) {
      await ctx.db.patch(existing._id, {
        rules: cleaned,
        updatedAt: now,
        formatVersion: 1,
      });
      return { workflowId: existing._id, ruleId, created };
    }
    const workflowId = await ctx.db.insert("organizationIntegrationWorkflows", {
      organizationId: args.organizationId,
      updatedAt: now,
      formatVersion: 1,
      rules: cleaned,
    });
    return { workflowId, ruleId, created };
  },
});

/**
 * Operator: re-run pipeline lead upsert for historical inbound jobs
 * (e.g. accepted before workflow rules existed).
 */
export const operatorReplayInboundPipelineLeads = mutation({
  args: {
    operatorSecret: v.string(),
    organizationId: v.id("organizations"),
    jobIds: v.optional(v.array(v.id("integrationJobs"))),
    connectorPublicId: v.optional(v.string()),
    defaultStatus: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    results: v.array(
      v.object({
        jobId: v.id("integrationJobs"),
        created: v.optional(v.boolean()),
        fileId: v.optional(v.id("pipeline")),
        skipped: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const publicId = args.connectorPublicId?.trim().toLowerCase();
    let connectorId: Id<"integrationConnectors"> | undefined;
    if (publicId) {
      const conn = await ctx.db
        .query("integrationConnectors")
        .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
        .first();
      if (!conn || conn.organizationId !== args.organizationId) {
        throw new Error("Connector not found for organization.");
      }
      connectorId = conn._id;
    }

    const jobIds = args.jobIds?.length
      ? args.jobIds
      : (
          await ctx.db
            .query("integrationJobs")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", args.organizationId),
            )
            .order("desc")
            .take(80)
        )
          .filter(
            (j) =>
              j.kind === "inbound_event" &&
              (!connectorId || j.connectorId === connectorId),
          )
          .slice(0, limit)
          .map((j) => j._id);

    const results: Array<{
      jobId: Id<"integrationJobs">;
      created?: boolean;
      fileId?: Id<"pipeline">;
      skipped?: string;
    }> = [];

    for (const jobId of jobIds.slice(0, limit)) {
      const job = await ctx.db.get(jobId);
      if (!job || job.organizationId !== args.organizationId) {
        results.push({ jobId, skipped: "not_found" });
        continue;
      }
      if (job.kind !== "inbound_event") {
        results.push({ jobId, skipped: "not_inbound" });
        continue;
      }
      const out = await upsertPipelineLeadFromInboundJob(ctx, {
        jobId,
        defaultStatus: args.defaultStatus,
      });
      if (!out) {
        results.push({ jobId, skipped: "no_lead_fields" });
        continue;
      }
      results.push({
        jobId,
        created: out.created,
        fileId: out.fileId,
      });
    }

    return { processed: results.length, results };
  },
});
