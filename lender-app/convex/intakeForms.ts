import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  assertOrgMember,
} from "./organizationAccess";
import {
  dealPartyFieldByRegistryKey,
  isKnownDealPartyRegistryKey,
} from "../lib/intake/dealPartyFieldRegistry";
import { buildInitialIntakeDocument } from "./intakeDocumentDefaults";
import {
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import {
  ensureClientFromBusiness,
} from "./entityCanonicalization";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import { DEFAULT_CONTACT_ROLE_IDS } from "../lib/contact/contactRoles";

const preferencesAccountIdArg = {
  preferencesAccountId: v.optional(v.string()),
};

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFieldKeys(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const k = key.trim();
    if (!k || !isKnownDealPartyRegistryKey(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

async function assertFormAccess(
  ctx: MutationCtx,
  form: Doc<"intakeForms">,
  memberUserKey: string | undefined,
) {
  await assertOrgMember(ctx, form.organizationId, memberUserKey);
  if (form.fileId) {
    const file = await ctx.db.get(form.fileId);
    if (!file) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, file, memberUserKey);
  }
}

export const listForFile = query({
  args: {
    fileId: v.id("pipeline"),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, args.preferencesAccountId);
    return await ctx.db
      .query("intakeForms")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .order("desc")
      .collect();
  },
});

export const listLinksForForm = query({
  args: {
    formId: v.id("intakeForms"),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) return [];
    await assertOrgMember(ctx, form.organizationId, args.preferencesAccountId);
    if (form.fileId) {
      const file = await ctx.db.get(form.fileId);
      if (file) {
        await assertCanReadPipelineRow(ctx, file, args.preferencesAccountId);
      }
    }
    return await ctx.db
      .query("intakeFormLinks")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .order("desc")
      .collect();
  },
});

export const createForm = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.optional(v.id("pipeline")),
    formType: v.union(v.literal("file_intake"), v.literal("referral")),
    name: v.string(),
    fieldKeys: v.array(v.string()),
    borrowerPartyType: v.union(
      v.literal("individual"),
      v.literal("entity"),
      v.literal("either"),
    ),
    referralPartnerContactId: v.optional(v.id("contacts")),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const memberKey = args.preferencesAccountId?.trim();
    if (!memberKey) throw new Error("preferencesAccountId is required.");
    await assertOrgMember(ctx, args.organizationId, memberKey);

    const fieldKeys = sanitizeFieldKeys(args.fieldKeys);
    if (fieldKeys.length === 0) {
      throw new Error("Select at least one field for this form.");
    }

    const name = args.name.trim();
    if (!name) throw new Error("Form name is required.");

    if (args.formType === "file_intake") {
      if (!args.fileId) throw new Error("fileId is required for file intake forms.");
      const file = await ctx.db.get(args.fileId);
      if (!file) throw new Error("Pipeline file not found.");
      await assertCanMutatePipelineRow(ctx, file, memberKey);
      if (file.organizationId !== args.organizationId) {
        throw new Error("File organization mismatch.");
      }
    } else if (args.fileId) {
      throw new Error("Referral forms cannot be bound to a single file.");
    }

    if (args.referralPartnerContactId) {
      const partner = await ctx.db.get(args.referralPartnerContactId);
      if (!partner || partner.organizationId !== args.organizationId) {
        throw new Error("Referral partner contact not found.");
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("intakeForms", {
      organizationId: args.organizationId,
      fileId: args.formType === "referral" ? undefined : args.fileId,
      formType: args.formType,
      name,
      fieldKeys,
      borrowerPartyType: args.borrowerPartyType,
      referralPartnerContactId: args.referralPartnerContactId,
      createdByUserKey: memberKey,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const updateForm = mutation({
  args: {
    formId: v.id("intakeForms"),
    name: v.optional(v.string()),
    fieldKeys: v.optional(v.array(v.string())),
    borrowerPartyType: v.optional(
      v.union(v.literal("individual"), v.literal("entity"), v.literal("either")),
    ),
    referralPartnerContactId: v.optional(v.id("contacts")),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found.");
    await assertFormAccess(ctx, form, args.preferencesAccountId);

    const patch: Partial<Doc<"intakeForms">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Form name is required.");
      patch.name = name;
    }
    if (args.fieldKeys !== undefined) {
      const fieldKeys = sanitizeFieldKeys(args.fieldKeys);
      if (fieldKeys.length === 0) {
        throw new Error("Select at least one field for this form.");
      }
      patch.fieldKeys = fieldKeys;
    }
    if (args.borrowerPartyType !== undefined) {
      patch.borrowerPartyType = args.borrowerPartyType;
    }
    if (args.referralPartnerContactId !== undefined) {
      patch.referralPartnerContactId = args.referralPartnerContactId;
    }
    await ctx.db.patch(args.formId, patch);
    return { ok: true as const };
  },
});

export const removeForm = mutation({
  args: {
    formId: v.id("intakeForms"),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) return;
    await assertFormAccess(ctx, form, args.preferencesAccountId);
    for (const link of await ctx.db
      .query("intakeFormLinks")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .collect()) {
      await ctx.db.delete(link._id);
    }
    await ctx.db.delete(args.formId);
  },
});

export const generateLink = mutation({
  args: {
    formId: v.id("intakeForms"),
    label: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found.");
    await assertFormAccess(ctx, form, args.preferencesAccountId);
    const token = generateToken();
    const id = await ctx.db.insert("intakeFormLinks", {
      formId: args.formId,
      token,
      label: args.label?.trim() || undefined,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
      submissionCount: 0,
    });
    return { id, token };
  },
});

export const revokeLink = mutation({
  args: {
    linkId: v.id("intakeFormLinks"),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) return;
    const form = await ctx.db.get(link.formId);
    if (!form) return;
    await assertFormAccess(ctx, form, args.preferencesAccountId);
    await ctx.db.patch(args.linkId, { revokedAt: Date.now() });
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("intakeFormLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link) return { status: "not_found" as const };
    if (link.revokedAt) return { status: "revoked" as const };
    if (link.expiresAt && link.expiresAt < Date.now()) {
      return { status: "expired" as const };
    }

    const form = await ctx.db.get(link.formId);
    if (!form) return { status: "not_found" as const };

    const org = await ctx.db.get(form.organizationId);
    const orgName = org?.name?.trim() || "Direct Lending Connection";

    return {
      status: "ok" as const,
      link: {
        _id: link._id,
        label: link.label,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
      },
      form: {
        _id: form._id,
        name: form.name,
        formType: form.formType,
        fieldKeys: form.fieldKeys,
        borrowerPartyType: form.borrowerPartyType,
        organizationName: orgName,
      },
    };
  },
});

export const markOpened = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("intakeFormLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link || link.revokedAt) return;
    await ctx.db.patch(link._id, { lastOpenedAt: Date.now() });
  },
});

type SubmissionValues = Record<string, string>;

function personNameFromValues(values: SubmissionValues): string {
  const first = trimmed(values.borrower_first_name);
  const last = trimmed(values.borrower_last_name);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return trimmed(values.guarantor_name);
}

async function createContactFromSubmission(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    ownerUserKey: string;
    values: SubmissionValues;
  },
): Promise<Id<"contacts"> | null> {
  const name = personNameFromValues(args.values);
  if (!name) return null;
  const email = trimmed(args.values.borrower_email || args.values.guarantor_email);
  const phone = trimmed(args.values.borrower_mobile || args.values.guarantor_mobile);
  const now = Date.now();
  return await ctx.db.insert("contacts", {
    name,
    email: email || "",
    phone: phone || "",
    notes: "",
    organizationId: args.organizationId,
    contactRoleId: DEFAULT_CONTACT_ROLE_IDS.client,
    contactRoleIds: [DEFAULT_CONTACT_ROLE_IDS.client],
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertBorrowerFileLink(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  contactId: Id<"contacts">,
  borrowerIndex: number,
) {
  const now = Date.now();
  const registryRoleId =
    borrowerIndex === 0 ? ("primary_borrower" as const) : ("coborrower" as const);
  const role = borrowerIndex === 0 ? "Primary Borrower" : "Co-Borrower";
  const existing = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contactId).eq("fileId", fileId),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      registryRoleId,
      contactRoleId: registryRoleId,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("contactFileLinks", {
    contactId,
    fileId,
    role,
    registryRoleId,
    contactRoleId: registryRoleId,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertReferralPartnerLink(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  contactId: Id<"contacts">,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contactId).eq("fileId", fileId),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: "Referral Partner",
      registryRoleId: "referral_partner",
      contactRoleId: "referral_partner",
      relationshipType: "referral",
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("contactFileLinks", {
    contactId,
    fileId,
    role: "Referral Partner",
    registryRoleId: "referral_partner",
    contactRoleId: "referral_partner",
    relationshipType: "referral",
    createdAt: now,
    updatedAt: now,
  });
}

function buildDealPatchesFromValues(values: SubmissionValues) {
  const borrowerPatch: Record<string, unknown> = {};
  const guarantorPatch: Record<string, unknown> = {};
  const businessPatch: Record<string, unknown> = {};
  const pfsPatch: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(values)) {
    const value = trimmed(raw);
    if (!value) continue;
    const def = dealPartyFieldByRegistryKey(key);
    if (!def) continue;
    switch (def.target) {
      case "borrower":
        borrowerPatch[def.rowKey] = value;
        break;
      case "guarantor":
        guarantorPatch[def.rowKey] = value;
        break;
      case "business":
        businessPatch[def.rowKey] = value;
        break;
      case "guarantor_pfs":
        pfsPatch[def.rowKey] = value;
        break;
      default:
        break;
    }
  }

  return { borrowerPatch, guarantorPatch, businessPatch, pfsPatch };
}

async function hydrateDealFromSubmission(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  form: Doc<"intakeForms">,
  values: SubmissionValues,
  partyType: "individual" | "entity",
) {
  const { borrowerPatch, guarantorPatch, businessPatch, pfsPatch } =
    buildDealPatchesFromValues(values);

  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const borrowers: unknown[] = Array.isArray(deal.borrowers)
    ? [...(deal.borrowers as unknown[])]
    : [];
  while (borrowers.length < 1) borrowers.push({});
  borrowers[0] = {
    ...(borrowers[0] != null && typeof borrowers[0] === "object"
      ? (borrowers[0] as Record<string, unknown>)
      : {}),
    ...borrowerPatch,
  };

  const guarantors: unknown[] = Array.isArray(deal.guarantors)
    ? [...(deal.guarantors as unknown[])]
    : [];
  if (Object.keys(guarantorPatch).length > 0) {
    while (guarantors.length < 1) guarantors.push({});
    guarantors[0] = {
      ...(guarantors[0] != null && typeof guarantors[0] === "object"
        ? (guarantors[0] as Record<string, unknown>)
        : {}),
      ...guarantorPatch,
    };
  }

  let business =
    deal.business != null &&
    typeof deal.business === "object" &&
    !Array.isArray(deal.business)
      ? { ...(deal.business as Record<string, unknown>) }
      : undefined;

  if (partyType === "entity" || Object.keys(businessPatch).length > 0) {
    business = { ...(business ?? {}), ...businessPatch };
  }

  let pfs =
    deal.pfs != null && typeof deal.pfs === "object" && !Array.isArray(deal.pfs)
      ? { ...(deal.pfs as Record<string, unknown>) }
      : undefined;
  if (Object.keys(pfsPatch).length > 0) {
    pfs = { ...(pfs ?? {}), ...pfsPatch };
  }

  const mergedDeal = mergePatchIntoDeal(deal, {
    borrowers,
    ...(guarantors.length > 0 ? { guarantors } : {}),
    ...(business ? { business } : {}),
    ...(pfs ? { pfs } : {}),
    sourceType: form.formType === "referral" ? "referral" : deal.sourceType,
    updatedAt: Date.now(),
  }) as Record<string, unknown>;

  const now = Date.now();
  await ctx.db.patch(file._id, {
    dealData: mergedDeal as Doc<"pipeline">["dealData"],
    updatedAt: now,
  });

  const ownerKey = form.createdByUserKey;

  if (partyType === "individual") {
    const contactId = await createContactFromSubmission(ctx, {
      organizationId: form.organizationId,
      ownerUserKey: ownerKey,
      values,
    });
    if (contactId) {
      borrowers[0] = {
        ...(borrowers[0] as Record<string, unknown>),
        contactId,
      };
      await upsertBorrowerFileLink(ctx, file._id, contactId, 0);
      const contact = await ctx.db.get(contactId);
      if (contact) {
        await ctx.db.patch(file._id, {
          dealData: mergePatchIntoDeal(mergedDeal, {
            borrowers,
            updatedAt: Date.now(),
          }) as Doc<"pipeline">["dealData"],
          updatedAt: now,
        });
      }
    }
  }

  if (partyType === "entity" && trimmed(businessPatch.legalName)) {
    const clientId = await ensureClientFromBusiness(ctx, {
      organizationId: form.organizationId,
      legalName: trimmed(businessPatch.legalName),
      ein: trimmed(businessPatch.ein),
      entityType: trimmed(businessPatch.entityType),
      ownerUserKey: ownerKey,
    });
    const entityBusiness = {
      ...(business ?? {}),
      legalName: trimmed(businessPatch.legalName),
      clientId,
    };
    await ctx.db.patch(file._id, {
      dealData: mergePatchIntoDeal(mergedDeal, {
        business: entityBusiness,
        updatedAt: Date.now(),
      }) as Doc<"pipeline">["dealData"],
      updatedAt: now,
    });
  }

  if (Object.keys(guarantorPatch).length > 0) {
    const gContactId = await createContactFromSubmission(ctx, {
      organizationId: form.organizationId,
      ownerUserKey: ownerKey,
      values: {
        guarantor_name: trimmed(values.guarantor_name),
        guarantor_email: trimmed(values.guarantor_email),
        guarantor_mobile: trimmed(values.guarantor_mobile),
      },
    });
    if (gContactId && guarantors[0] != null) {
      guarantors[0] = {
        ...(guarantors[0] as Record<string, unknown>),
        contactId: gContactId,
      };
      const now = Date.now();
      const existing = await ctx.db
        .query("contactFileLinks")
        .withIndex("by_contact_file", (q) =>
          q.eq("contactId", gContactId).eq("fileId", file._id),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          role: "Guarantor",
          registryRoleId: "guarantor",
          contactRoleId: "guarantor",
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("contactFileLinks", {
          contactId: gContactId,
          fileId: file._id,
          role: "Guarantor",
          registryRoleId: "guarantor",
          contactRoleId: "guarantor",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  if (form.referralPartnerContactId) {
    await upsertReferralPartnerLink(ctx, file._id, form.referralPartnerContactId);
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
}

async function createReferralLeadFile(
  ctx: MutationCtx,
  form: Doc<"intakeForms">,
  values: SubmissionValues,
  partyType: "individual" | "entity",
): Promise<Id<"pipeline">> {
  const legalName = trimmed(values.entity_legal_name);
  const personName = personNameFromValues(values);
  const clientName =
    partyType === "entity" && legalName ? legalName : personName || "New Lead";
  const projectName = "Incoming Referral";
  const fileName = `${clientName} — Referral`;

  let dealData = buildInitialIntakeDocument({
    clientName,
    projectName,
    fileName,
  });
  dealData = {
    ...dealData,
    sourceType: "referral",
  };

  const body = {
    fileName,
    status: "New Lead",
    fundingAmount: 0,
    rate: 0,
    term: "",
    lenders: [] as Id<"lenders">[],
  };

  const now = Date.now();
  const fileId = await ctx.db.insert("pipeline", {
    ...body,
    contacts: [],
    dealData,
    intakeSheetId: undefined,
    organizationId: form.organizationId,
    ownerUserKey: form.createdByUserKey,
    createdAt: now,
    updatedAt: now,
  });

  const file = await ctx.db.get(fileId);
  if (!file) throw new Error("Failed to create referral file.");

  await hydrateDealFromSubmission(ctx, file, form, values, partyType);

  await appendPipelineFileActivity(ctx, {
    fileId,
    at: now,
    kind: "file_created",
    summary: clampActivitySummary(`Incoming referral — “${fileName}”`),
  });
  await refreshPipelineGlobalSearchText(ctx, fileId);
  return fileId;
}

export const submitByToken = mutation({
  args: {
    token: v.string(),
    values: v.record(v.string(), v.string()),
    partyType: v.optional(v.union(v.literal("individual"), v.literal("entity"))),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("intakeFormLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!link) throw new Error("Invalid link.");
    if (link.revokedAt) throw new Error("This form link has been revoked.");
    if (link.expiresAt && link.expiresAt < Date.now()) {
      throw new Error("This form link has expired.");
    }

    const form = await ctx.db.get(link.formId);
    if (!form) throw new Error("Form not found.");

    const allowed = new Set(form.fieldKeys);
    const safeValues: SubmissionValues = {};
    for (const [key, value] of Object.entries(args.values ?? {})) {
      if (!allowed.has(key)) continue;
      safeValues[key] = typeof value === "string" ? value : String(value ?? "");
    }

    const partyType: "individual" | "entity" =
      form.borrowerPartyType === "entity"
        ? "entity"
        : form.borrowerPartyType === "individual"
          ? "individual"
          : args.partyType === "entity"
            ? "entity"
            : "individual";

    let targetFileId = form.fileId;

    if (form.formType === "referral") {
      targetFileId = await createReferralLeadFile(
        ctx,
        form,
        safeValues,
        partyType,
      );
    } else if (!targetFileId) {
      throw new Error("This form is not linked to a pipeline file.");
    } else {
      const file = await ctx.db.get(targetFileId);
      if (!file) throw new Error("Pipeline file not found.");
      await hydrateDealFromSubmission(ctx, file, form, safeValues, partyType);
    }

    await ctx.db.patch(link._id, {
      lastSubmittedAt: Date.now(),
      submissionCount: (link.submissionCount ?? 0) + 1,
    });

    return {
      ok: true as const,
      fileId: targetFileId,
      formType: form.formType,
    };
  },
});
