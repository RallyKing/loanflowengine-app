import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { borrower, guarantor, incomeRow, assetRow, liabilityRow, reoRow, weightedInterestRow } from "./intakeSchemaPart";
import {
  mergePatchIntoDeal,
  resolveDealBaseForPipelinePatch,
} from "./dealDataMerge";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";
import {
  assertCanMutateContactRow,
  assertCanMutateContactFileLink,
  assertCanMutatePipelineRow,
  assertCanReadContactRow,
  assertOrgPermission,
} from "./organizationAccess";
import { refreshContactGlobalSearchText } from "./globalSearchSync";
import { appendContactCrudFeed } from "./activityFeed";
import {
  allContactEmailStrings,
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";
import { normalizeEmailKey } from "../lib/crmRelationship";
import { DEFAULT_CONTACT_ROLE_IDS } from "../lib/contact/contactRoles";
import {
  borrowerFileLinkRole,
  borrowerRowHasIdentity,
  borrowerRowToContactIdentityPatch,
  buildBorrowerContactLookups,
  isCoBorrowerFileLink,
  isPrimaryBorrowerFileLink,
  matchContactByNormalizedEmail,
  matchContactByNormalizedName,
  personNameFromBorrowerRow,
} from "../lib/contacts/borrowerIdentityFromDeal";
import {
  buildBorrowerContactLookups as buildGuarantorContactLookups,
  guarantorRowHasIdentity,
  guarantorRowToContactIdentityPatch,
  matchGuarantorContact,
  personNameFromGuarantorRow,
} from "../lib/contacts/guarantorIdentityFromDeal";
import {
  groupIncomeRowsByBorrowerIndex,
  incomeRowsToProfileArray,
} from "../lib/contacts/incomeFromDeal";
import {
  assetsToProfileArray,
  liabilitiesToProfileArray,
} from "../lib/contacts/pfsFromDeal";
import {
  reoFingerprintFromLegacyRow,
  reoFingerprintFromProfileShape,
  reoFingerprintFromStoredProperty,
  reoRowsToProfileArray,
  type ContactReoPropertyShape,
} from "../lib/contacts/reoFromDeal";
import {
  businessDebtFingerprintFromLegacyRow,
  businessDebtFingerprintFromStored,
  businessDebtRowToScheduleShape,
} from "../lib/contacts/businessDebtFromDeal";
import {
  businessDebtScheduleToDealRow,
  contactPiiToDealStringFields,
  dealRowPiiToContactPatch,
  reoProfileShapeToDealRow,
} from "../lib/contacts/contactProfileToDeal";
import { reoRowToProfileShape } from "../lib/contacts/reoFromDeal";
import { ensureClientBackrefForBusinessEntity } from "./entityCanonicalization";
import { upsertEntityContactLink } from "./entityContactLinkHelpers";
import type { RegistryRoleId } from "../lib/registry/universalRoles";

const preferencesAccountIdArg = {
  preferencesAccountId: v.optional(v.string()),
};

async function assertNoDuplicateEmailsInOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  emailKeys: readonly string[],
  excludeContactId?: Id<"contacts">,
): Promise<void> {
  if (!organizationId) return;
  const seen = new Set<string>();
  const orgRows = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  for (const raw of emailKeys) {
    const key = normalizeEmailKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const dupIndex = await ctx.db
      .query("contacts")
      .withIndex("by_organization_emailKey", (q) =>
        q.eq("organizationId", organizationId).eq("emailKey", key),
      )
      .first();
    if (dupIndex && dupIndex._id !== excludeContactId) {
      throw new Error(
        "A contact with this email already exists in this organization.",
      );
    }

    for (const other of orgRows) {
      if (other._id === excludeContactId) continue;
      if (allContactEmailStrings(other).includes(key)) {
        throw new Error(
          "A contact with this email already exists in this organization.",
        );
      }
    }
  }
}

async function applyBorrowersDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  borrowers: unknown[],
): Promise<{ ok: true }> {
  const cleaned = { borrowers, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: ["borrowers"],
    summary: clampActivitySummary("Deal: borrowers"),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch({
          borrowers,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function loadOrgContacts(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<Doc<"contacts">[]> {
  const all = await ctx.db.query("contacts").collect();
  if (!organizationId) return all;
  return all.filter((c) => c.organizationId === organizationId);
}

async function resolveContactForBorrowerIndex(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  borrowerIndex: number,
  row: unknown,
  lookups: ReturnType<typeof buildBorrowerContactLookups>,
): Promise<Doc<"contacts"> | null> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", file._id))
    .collect();

  if (borrowerIndex === 0) {
    const primaryLinks = links
      .filter(isPrimaryBorrowerFileLink)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const link of primaryLinks) {
      const contact = await ctx.db.get(link.contactId);
      if (contact) return contact;
    }
  } else {
    const coLinks = links
      .filter(isCoBorrowerFileLink)
      .sort((a, b) => a.createdAt - b.createdAt);
    const slot = coLinks[borrowerIndex - 1];
    if (slot) {
      const contact = await ctx.db.get(slot.contactId);
      if (contact) return contact;
    }
  }

  if (row && typeof row === "object") {
    const rec = row as { contactId?: Id<"contacts">; email?: string };
    if (rec.contactId) {
      const byId = await ctx.db.get(rec.contactId);
      if (byId) return byId;
    }
    const byEmail = matchContactByNormalizedEmail(rec.email, lookups);
    if (byEmail) return byEmail;
  }

  const name = personNameFromBorrowerRow(row);
  if (name) {
    return matchContactByNormalizedName(name, lookups);
  }

  return null;
}

async function upsertContactFileLink(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    borrowerIndex: number;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, borrowerIndex, memberUserKey } = args;
  await assertCanMutateContactFileLink(ctx, contact, file, memberUserKey);
  const { role, contactRoleId } = borrowerFileLinkRole(borrowerIndex);
  const registryRoleId: RegistryRoleId =
    borrowerIndex === 0 ? "primary_borrower" : "coborrower";
  const now = Date.now();

  const existing = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contact._id).eq("fileId", file._id),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      contactRoleId,
      registryRoleId,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFileLinks", {
    contactId: contact._id,
    fileId: file._id,
    role,
    contactRoleId,
    registryRoleId,
    createdAt: now,
    updatedAt: now,
  });
}

async function createContactFromBorrowerRow(
  ctx: MutationCtx,
  args: {
    file: Doc<"pipeline">;
    row: unknown;
    borrowerIndex: number;
    memberUserKey?: string;
  },
): Promise<Doc<"contacts"> | null> {
  const { file, row, borrowerIndex, memberUserKey } = args;
  const name = personNameFromBorrowerRow(row);
  if (!name) return null;

  if (file.organizationId && memberUserKey) {
    await assertOrgPermission(
      ctx,
      file.organizationId,
      memberUserKey,
      "contacts.manage",
    );
  }

  const identity = borrowerRowToContactIdentityPatch(row);
  const nameForInsert = (identity.name ?? name).trim();
  if (!nameForInsert) return null;

  await assertNoDuplicateEmailsInOrg(
    ctx,
    file.organizationId,
    allContactEmailStrings({
      email: identity.email ?? "",
      emails: identity.emails,
    }),
    undefined,
  );

  const contactRoleIds = [DEFAULT_CONTACT_ROLE_IDS.client];
  const contactRoleId = DEFAULT_CONTACT_ROLE_IDS.client;
  const now = Date.now();

  const id = await ctx.db.insert("contacts", {
    name: nameForInsert,
    email: identity.email ?? "",
    phone: identity.phone ?? "",
    ...(identity.emails !== undefined ? { emails: identity.emails } : {}),
    ...(identity.phones !== undefined ? { phones: identity.phones } : {}),
    ...(identity.emailKey !== undefined ? { emailKey: identity.emailKey } : {}),
    notes: "",
    contactRoleIds,
    contactRoleId,
    organizationId: file.organizationId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (created) {
    await refreshContactGlobalSearchText(ctx, id);
    await appendContactCrudFeed(
      ctx,
      created,
      "contact_created",
      `Created contact “${created.name.trim() || "Contact"}”`,
      memberUserKey?.trim(),
    );
  }
  return created;
}

async function updateContactFromBorrowerRow(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
  row: unknown,
  memberUserKey?: string,
): Promise<void> {
  await assertCanMutateContactRow(ctx, contact, memberUserKey);
  const patch = borrowerRowToContactIdentityPatch(row, contact);
  const name = (patch.name ?? contact.name).trim();
  if (!name) return;

  const methodsTouched =
    patch.email !== undefined ||
    patch.phone !== undefined ||
    patch.emails !== undefined ||
    patch.phones !== undefined;

  if (methodsTouched) {
    await assertNoDuplicateEmailsInOrg(
      ctx,
      contact.organizationId,
      allContactEmailStrings({
        email: patch.email ?? contact.email,
        emails: patch.emails ?? contact.emails,
      }),
      contact._id,
    );
  }

  const now = Date.now();
  const piiPatch = dealRowPiiToContactPatch(row);
  await ctx.db.patch(contact._id, {
    name,
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.emails !== undefined ? { emails: patch.emails } : {}),
    ...(patch.phones !== undefined ? { phones: patch.phones } : {}),
    ...(patch.emailKey !== undefined ? { emailKey: patch.emailKey } : {}),
    ...piiPatch,
    updatedAt: now,
  });
  await refreshContactGlobalSearchText(ctx, contact._id);
  const updated = await ctx.db.get(contact._id);
  if (updated) {
    await appendContactCrudFeed(
      ctx,
      updated,
      "contact_updated",
      `Updated contact “${updated.name.trim() || "Contact"}”`,
      memberUserKey?.trim(),
    );
  }
}

/**
 * Quiet dealData.borrowers write (+ intake mirror) — used for contactId
 * backfill and contact→file identity propagation. Skips the activity feed so
 * mirror writes don't double-log user edits.
 */
async function writeBorrowersQuietly(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  borrowers: unknown[],
): Promise<void> {
  const fresh = await ctx.db.get(fileId);
  if (!fresh) return;
  const deal = await resolveDealBaseForPipelinePatch(ctx, fresh);
  const mergedDeal = mergePatchIntoDeal(deal, {
    borrowers,
    updatedAt: Date.now(),
  }) as Record<string, unknown>;
  await ctx.db.patch(
    fileId,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: Date.now(),
    }) as Partial<Doc<"pipeline">>,
  );
  if (fresh.intakeSheetId) {
    const intakeRow = await ctx.db.get(fresh.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        fresh.intakeSheetId,
        sanitizeDbPatch({
          borrowers,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }
  await refreshPipelineGlobalSearchText(ctx, fileId);
}

async function syncBorrowersToContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  borrowers: unknown[],
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;

  let contacts = await loadOrgContacts(ctx, file.organizationId);
  let lookups = buildBorrowerContactLookups(contacts, file.organizationId);
  const resolvedIds: (Id<"contacts"> | null)[] = borrowers.map(() => null);

  for (let i = 0; i < borrowers.length; i += 1) {
    const row = borrowers[i];
    if (!borrowerRowHasIdentity(row)) continue;

    let contact = await resolveContactForBorrowerIndex(
      ctx,
      file,
      i,
      row,
      lookups,
    );

    if (!contact) {
      contact = await createContactFromBorrowerRow(ctx, {
        file,
        row,
        borrowerIndex: i,
        memberUserKey,
      });
      if (contact) {
        contacts = [...contacts, contact];
        lookups = buildBorrowerContactLookups(contacts, file.organizationId);
      }
    } else {
      await updateContactFromBorrowerRow(ctx, contact, row, memberUserKey);
      const refreshed = await ctx.db.get(contact._id);
      if (refreshed) {
        contacts = contacts.map((c) =>
          c._id === refreshed._id ? refreshed : c,
        );
        lookups = buildBorrowerContactLookups(contacts, file.organizationId);
      }
    }

    if (contact) {
      resolvedIds[i] = contact._id;
      await upsertContactFileLink(ctx, {
        contact,
        file,
        borrowerIndex: i,
        memberUserKey,
      });
    }
  }

  // Hard-link borrower rows to their resolved contacts so contact→file
  // propagation has stable keys (bidirectional relational integrity).
  let idsChanged = false;
  const borrowersWithIds = borrowers.map((row, i) => {
    const cid = resolvedIds[i];
    if (!cid || !row || typeof row !== "object") return row;
    const rec = row as Record<string, unknown>;
    if (rec.contactId === String(cid) || rec.contactId === cid) return row;
    idsChanged = true;
    return { ...rec, contactId: cid };
  });
  if (idsChanged) {
    await writeBorrowersQuietly(ctx, file._id, borrowersWithIds);
  }
}

/**
 * Master-record → file propagation: when a CRM contact's identity changes,
 * refresh every linked pipeline file's borrower snapshot (rows hard-linked
 * via `contactId`). Tenant-guarded to the contact's organization; quiet
 * writes (no duplicate activity entries).
 */
export async function propagateContactIdentityToLinkedFiles(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
): Promise<{ filesTouched: number }> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .collect();
  if (links.length === 0) return { filesTouched: 0 };

  const name = contact.name.trim();
  const spaceIdx = name.lastIndexOf(" ");
  const firstName = spaceIdx > 0 ? name.slice(0, spaceIdx).trim() : name;
  const lastName = spaceIdx > 0 ? name.slice(spaceIdx + 1).trim() : "";
  const email = primaryContactEmail(contact);
  const phone = primaryContactPhone(contact);
  const pii = contactPiiToDealStringFields(contact);

  let filesTouched = 0;
  const MAX_FILES = 50;
  for (const link of links.slice(0, MAX_FILES)) {
    const file = await ctx.db.get(link.fileId);
    if (!file) continue;
    // Tenant isolation: never cross organizations during propagation.
    if (
      contact.organizationId &&
      file.organizationId !== contact.organizationId
    ) {
      continue;
    }
    const deal =
      file.dealData != null &&
      typeof file.dealData === "object" &&
      !Array.isArray(file.dealData)
        ? (file.dealData as Record<string, unknown>)
        : {};
    const borrowers: unknown[] = Array.isArray(deal.borrowers)
      ? (deal.borrowers as unknown[])
      : [];
    let changed = false;
    const next = borrowers.map((row) => {
      if (!row || typeof row !== "object") return row;
      const rec = row as Record<string, unknown>;
      if (String(rec.contactId ?? "") !== String(contact._id)) return row;
      const patch: Record<string, unknown> = {
        firstName,
        ...(lastName ? { lastName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { mobile: phone } : {}),
        ...pii,
      };
      const differs = Object.entries(patch).some(
        ([k, v]) => (rec[k] ?? "") !== v,
      );
      if (!differs) return row;
      changed = true;
      return { ...rec, ...patch };
    });
    if (changed) {
      await writeBorrowersQuietly(ctx, file._id, next);
      filesTouched += 1;
    }
  }
  return { filesTouched };
}

/**
 * Phase 37.3.C.C.1 — dual-write borrower identity to dealData and CRM contacts.
 */
export const saveBorrowerIdentityDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    borrowers: v.array(borrower),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    await applyBorrowersDealPatch(ctx, p, args.borrowers as unknown[]);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncBorrowersToContacts(
      ctx,
      fileAfterDeal,
      args.borrowers as unknown[],
      memberUserKey,
    );

    return { ok: true as const };
  },
});

/**
 * Phase Modular-A — bidirectional Associated Contacts → deal borrower slot.
 * Assigns a linked CRM contact into `dealData.borrowers[]`, hydrating identity
 * fields from the global contact record (no duplicate data entry), and
 * upgrades the file link to the matching borrower-class role.
 */
export const assignContactToBorrowerSlot = mutation({
  args: {
    fileId: v.id("pipeline"),
    contactId: v.id("contacts"),
    slot: v.union(v.literal("primary"), v.literal("coborrower")),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, file, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanReadContactRow(ctx, contact, memberUserKey);

    const name = contact.name.trim();
    const spaceIdx = name.lastIndexOf(" ");
    const firstName = spaceIdx > 0 ? name.slice(0, spaceIdx).trim() : name;
    const lastName = spaceIdx > 0 ? name.slice(spaceIdx + 1).trim() : "";
    const email = primaryContactEmail(contact);
    const phone = primaryContactPhone(contact);
    const pii = contactPiiToDealStringFields(contact);

    const deal =
      file.dealData != null &&
      typeof file.dealData === "object" &&
      !Array.isArray(file.dealData)
        ? (file.dealData as Record<string, unknown>)
        : {};
    const borrowers: unknown[] = Array.isArray(deal.borrowers)
      ? [...(deal.borrowers as unknown[])]
      : [];

    // Reuse the slot already bound to this contact rather than duplicating it.
    const boundIndex = borrowers.findIndex(
      (row) =>
        row != null &&
        typeof row === "object" &&
        (row as { contactId?: string }).contactId === args.contactId,
    );
    const targetIndex =
      args.slot === "primary"
        ? 0
        : boundIndex > 0
          ? boundIndex
          : Math.max(1, borrowers.length);

    const existingRow =
      borrowers[targetIndex] != null &&
      typeof borrowers[targetIndex] === "object"
        ? (borrowers[targetIndex] as Record<string, unknown>)
        : {};
    borrowers[targetIndex] = {
      ...existingRow,
      contactId: args.contactId,
      firstName,
      ...(lastName ? { lastName } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { mobile: phone } : {}),
      ...pii,
    };
    for (let i = 0; i < borrowers.length; i += 1) {
      if (borrowers[i] == null) borrowers[i] = {};
    }

    await applyBorrowersDealPatch(ctx, file, borrowers);
    await upsertContactFileLink(ctx, {
      contact,
      file,
      borrowerIndex: targetIndex,
      memberUserKey,
    });

    return { ok: true as const, borrowerIndex: targetIndex };
  },
});

/**
 * Assign a CRM contact into `dealData.guarantors[]`, hydrating identity from
 * the global registry and upserting the guarantor-class file link.
 */
export const assignContactToGuarantorSlot = mutation({
  args: {
    fileId: v.id("pipeline"),
    contactId: v.id("contacts"),
    slotIndex: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline not found");
    await assertCanMutatePipelineRow(ctx, file, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanReadContactRow(ctx, contact, memberUserKey);

    const email = primaryContactEmail(contact);
    const phone = primaryContactPhone(contact);
    const pii = contactPiiToDealStringFields(contact);

    const deal =
      file.dealData != null &&
      typeof file.dealData === "object" &&
      !Array.isArray(file.dealData)
        ? (file.dealData as Record<string, unknown>)
        : {};
    const guarantors: unknown[] = Array.isArray(deal.guarantors)
      ? [...(deal.guarantors as unknown[])]
      : [];

    const boundIndex = guarantors.findIndex(
      (row) =>
        row != null &&
        typeof row === "object" &&
        (row as { contactId?: string }).contactId === args.contactId,
    );
    let targetIndex =
      boundIndex >= 0
        ? boundIndex
        : args.slotIndex != null && args.slotIndex >= 0
          ? args.slotIndex
          : guarantors.length;

    while (guarantors.length <= targetIndex) {
      guarantors.push({});
    }

    const existingRow =
      guarantors[targetIndex] != null &&
      typeof guarantors[targetIndex] === "object"
        ? (guarantors[targetIndex] as Record<string, unknown>)
        : {};

    guarantors[targetIndex] = {
      ...existingRow,
      contactId: args.contactId,
      name: contact.name.trim(),
      ...(email ? { email } : {}),
      ...(phone ? { mobile: phone } : {}),
      ...pii,
      role: (existingRow.role as string | undefined) ?? "Primary",
    };

    await applyGuarantorsDealPatch(ctx, file, guarantors);
    await upsertGuarantorContactFileLink(ctx, {
      contact,
      file,
      row: guarantors[targetIndex],
      memberUserKey,
    });

    return { ok: true as const, guarantorIndex: targetIndex };
  },
});

const profileSyncTargetV = v.union(
  v.literal("borrower"),
  v.literal("guarantor"),
);

/**
 * Phase 3 — Pull CRM financial profile (PII, REO, business debt) into dealData.
 */
export const pullContactFinancialProfileToDeal = mutation({
  args: {
    fileId: v.id("pipeline"),
    contactId: v.id("contacts"),
    target: profileSyncTargetV,
    slotIndex: v.number(),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanReadContactRow(ctx, contact, memberUserKey);

    const reoRows = await ctx.db
      .query("contactReoProperties")
      .withIndex("by_contact_sort", (q) => q.eq("contactId", args.contactId))
      .collect();
    const activeReo = reoRows.filter((r) => r.archivedAt == null);

    const ownership = await ctx.db
      .query("contactBusinessOwnership")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    const debtRows: unknown[] = [];
    for (const link of ownership) {
      const schedule = await ctx.db
        .query("contactBusinessDebtSchedules")
        .withIndex("by_business_entity_sort", (q) =>
          q.eq("businessEntityId", link.businessEntityId),
        )
        .collect();
      for (const row of schedule.filter((r) => r.archivedAt == null)) {
        debtRows.push(
          businessDebtScheduleToDealRow({
            sortOrder: row.sortOrder,
            creditor: row.creditor,
            balance: row.balance,
            monthlyPayment: row.monthlyPayment,
            position: row.position,
          }),
        );
      }
    }

    const deal = await resolveDealBaseForPipelinePatch(ctx, p);
    const piiFields = contactPiiToDealStringFields(contact);
    const dealReo = activeReo.map((row) =>
      reoProfileShapeToDealRow(reoRowToProfileShape(row, row.sortOrder)),
    );

    if (args.target === "borrower") {
      const borrowers = Array.isArray(deal.borrowers)
        ? [...(deal.borrowers as unknown[])]
        : [];
      while (borrowers.length <= args.slotIndex) {
        borrowers.push({});
      }
      const current =
        borrowers[args.slotIndex] && typeof borrowers[args.slotIndex] === "object"
          ? { ...(borrowers[args.slotIndex] as Record<string, unknown>) }
          : {};
      borrowers[args.slotIndex] = {
        ...current,
        contactId: args.contactId,
        ...piiFields,
      };
      const mergedDeal = mergePatchIntoDeal(deal, {
        borrowers,
        reo: dealReo,
        weightedInterest: debtRows,
        updatedAt: Date.now(),
      }) as Record<string, unknown>;
      const now = Date.now();
      await ctx.db.patch(
        p._id,
        sanitizeDbPatch({
          dealData: mergedDeal as Doc<"pipeline">["dealData"],
          updatedAt: now,
        }) as Partial<Doc<"pipeline">>,
      );
      if (p.intakeSheetId) {
        const intakeRow = await ctx.db.get(p.intakeSheetId);
        if (intakeRow) {
          await ctx.db.patch(
            p.intakeSheetId,
            sanitizeDbPatch({
              borrowers,
              reo: dealReo,
              weightedInterest: debtRows,
              updatedAt: now,
            }) as Partial<Doc<"intakeSheets">>,
          );
        }
      }
    } else {
      const guarantors = Array.isArray(deal.guarantors)
        ? [...(deal.guarantors as unknown[])]
        : [];
      while (guarantors.length <= args.slotIndex) {
        guarantors.push({});
      }
      const current =
        guarantors[args.slotIndex] &&
        typeof guarantors[args.slotIndex] === "object"
          ? { ...(guarantors[args.slotIndex] as Record<string, unknown>) }
          : {};
      guarantors[args.slotIndex] = {
        ...current,
        ...piiFields,
      };
      const mergedDeal = mergePatchIntoDeal(deal, {
        guarantors,
        updatedAt: Date.now(),
      }) as Record<string, unknown>;
      const now = Date.now();
      await ctx.db.patch(
        p._id,
        sanitizeDbPatch({
          dealData: mergedDeal as Doc<"pipeline">["dealData"],
          updatedAt: now,
        }) as Partial<Doc<"pipeline">>,
      );
      if (p.intakeSheetId) {
        const intakeRow = await ctx.db.get(p.intakeSheetId);
        if (intakeRow) {
          await ctx.db.patch(
            p.intakeSheetId,
            sanitizeDbPatch({
              guarantors,
              updatedAt: now,
            }) as Partial<Doc<"intakeSheets">>,
          );
        }
      }
    }

    await refreshPipelineGlobalSearchText(ctx, p._id);
    await upsertContactFileLink(ctx, {
      contact,
      file: p,
      borrowerIndex: args.target === "borrower" ? args.slotIndex : 0,
      memberUserKey,
    });

    const refreshed = await ctx.db.get(args.fileId);
    return {
      ok: true as const,
      serverUpdatedAt: refreshed?.updatedAt ?? Date.now(),
    };
  },
});

/**
 * Phase 3 — Push deal financial profile (PII, REO, business debt) to CRM contact.
 */
export const pushDealFinancialProfileToContact = mutation({
  args: {
    fileId: v.id("pipeline"),
    target: profileSyncTargetV,
    slotIndex: v.number(),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const deal =
      p.dealData != null &&
      typeof p.dealData === "object" &&
      !Array.isArray(p.dealData)
        ? (p.dealData as Record<string, unknown>)
        : {};

    if (args.target === "borrower") {
      const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
      const row = borrowers[args.slotIndex];
      if (!row) throw new Error("Borrower slot not found on this deal.");

      const contacts = await loadOrgContacts(ctx, p.organizationId);
      const lookups = buildBorrowerContactLookups(contacts, p.organizationId);
      const contact = await resolveContactForBorrowerIndex(
        ctx,
        p,
        args.slotIndex,
        row,
        lookups,
      );
      if (!contact) {
        throw new Error(
          "No CRM contact linked for this borrower. Save identity or link a contact first.",
        );
      }

      await updateContactFromBorrowerRow(ctx, contact, row, memberUserKey);

      const fileAfter = await ctx.db.get(args.fileId);
      if (!fileAfter) throw new Error("Pipeline not found");

      const reo = Array.isArray(deal.reo) ? deal.reo : [];
      await syncReoToPrimaryContactProfile(
        ctx,
        fileAfter,
        reo,
        memberUserKey,
      );

      const weightedInterest = Array.isArray(deal.weightedInterest)
        ? deal.weightedInterest
        : [];
      await syncBusinessDebtToEntitySchedule(
        ctx,
        fileAfter,
        weightedInterest,
        memberUserKey,
      );
    } else {
      const guarantors = Array.isArray(deal.guarantors) ? deal.guarantors : [];
      const row = guarantors[args.slotIndex];
      if (!row) throw new Error("Guarantor slot not found on this deal.");

      let contacts = await loadOrgContacts(ctx, p.organizationId);
      let lookups = buildGuarantorContactLookups(contacts, p.organizationId);
      const { primary, coBorrowers } = await loadPrimaryAndCoBorrowerContacts(
        ctx,
        p,
      );
      const contact = matchGuarantorContact(row, lookups, primary, coBorrowers);
      if (!contact) {
        throw new Error(
          "No CRM contact matched for this guarantor. Save identity first.",
        );
      }

      await updateContactFromGuarantorRow(ctx, contact, row, memberUserKey);
      await upsertGuarantorFinancialProfile(ctx, {
        contact,
        file: p,
        row,
        memberUserKey,
      });
    }

    return { ok: true as const };
  },
});



function dealStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function dealNorm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

async function applyGuarantorsDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  guarantors: unknown[],
): Promise<{ ok: true }> {
  const cleaned = { guarantors, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: ["guarantors"],
    summary: clampActivitySummary("Deal: guarantors"),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch({
          guarantors,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function findBusinessEntityForOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  legalName: string,
  ein?: string,
): Promise<Doc<"contactBusinessEntities"> | null> {
  if (!organizationId) return null;
  if (ein) {
    const all = await ctx.db
      .query("contactBusinessEntities")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    const einNorm = dealNorm(ein);
    const byEin = all.find((e) => dealNorm(e.ein) === einNorm);
    if (byEin) return byEin;
  }
  return await ctx.db
    .query("contactBusinessEntities")
    .withIndex("by_organization_entity_name", (q) =>
      q.eq("organizationId", organizationId).eq("entityName", legalName),
    )
    .first();
}

type EnsuredBusinessEntity = {
  businessEntityId: Id<"contactBusinessEntities">;
  /** Canonical `clients` row (Phase Modular-A); null when no owner key is resolvable. */
  clientId: Id<"clients"> | null;
};

async function ensureBusinessEntityFromDeal(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  deal: Record<string, unknown>,
  memberUserKey?: string,
): Promise<EnsuredBusinessEntity | null> {
  const business =
    deal.business != null &&
    typeof deal.business === "object" &&
    !Array.isArray(deal.business)
      ? (deal.business as Record<string, unknown>)
      : null;
  const legalName = dealStr(business?.legalName);
  if (!legalName || !file.organizationId) return null;

  const ein = dealStr(business?.ein);
  const existing = await findBusinessEntityForOrg(
    ctx,
    file.organizationId,
    legalName,
    ein,
  );

  let businessEntityId: Id<"contactBusinessEntities">;
  if (existing) {
    businessEntityId = existing._id;
  } else {
    if (memberUserKey) {
      await assertOrgPermission(
        ctx,
        file.organizationId,
        memberUserKey,
        "contacts.manage",
      );
    }

    const now = Date.now();
    businessEntityId = await ctx.db.insert("contactBusinessEntities", {
      organizationId: file.organizationId,
      entityName: legalName,
      dba: dealStr(business?.dba),
      ein,
      entityType: dealStr(business?.entityType),
      state: dealStr(business?.stateOfFormation),
      formationDate: dealStr(business?.formationDate),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase Modular-A — keep the sticky row linked to its canonical clients row.
  let clientId: Id<"clients"> | null = null;
  const ownerKey =
    memberUserKey?.trim() ||
    file.ownerUserKey?.trim() ||
    file.ownerUserId?.trim() ||
    "";
  if (ownerKey) {
    const entityRow = await ctx.db.get(businessEntityId);
    if (entityRow) {
      clientId = await ensureClientBackrefForBusinessEntity(
        ctx,
        entityRow,
        ownerKey,
      );
    }
  }

  return { businessEntityId, clientId };
}

async function loadPrimaryAndCoBorrowerContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
): Promise<{
  primary: Doc<"contacts"> | null;
  coBorrowers: Doc<"contacts">[];
}> {
  const links = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", file._id))
    .collect();

  let primary: Doc<"contacts"> | null = null;
  const primaryLinks = links
    .filter(isPrimaryBorrowerFileLink)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const link of primaryLinks) {
    const contact = await ctx.db.get(link.contactId);
    if (contact) {
      primary = contact;
      break;
    }
  }

  const coBorrowers: Doc<"contacts">[] = [];
  const coLinks = links
    .filter(isCoBorrowerFileLink)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const link of coLinks) {
    const contact = await ctx.db.get(link.contactId);
    if (contact) coBorrowers.push(contact);
  }

  return { primary, coBorrowers };
}

async function createContactFromGuarantorRow(
  ctx: MutationCtx,
  args: {
    file: Doc<"pipeline">;
    row: unknown;
    memberUserKey?: string;
  },
): Promise<Doc<"contacts"> | null> {
  const { file, row, memberUserKey } = args;
  const name = personNameFromGuarantorRow(row);
  if (!name) return null;

  if (file.organizationId && memberUserKey) {
    await assertOrgPermission(
      ctx,
      file.organizationId,
      memberUserKey,
      "contacts.manage",
    );
  }

  const identity = guarantorRowToContactIdentityPatch(row);
  const nameForInsert = (identity.name ?? name).trim();
  if (!nameForInsert) return null;

  await assertNoDuplicateEmailsInOrg(
    ctx,
    file.organizationId,
    allContactEmailStrings({
      email: identity.email ?? "",
      emails: identity.emails,
    }),
    undefined,
  );

  const contactRoleIds = [DEFAULT_CONTACT_ROLE_IDS.client];
  const contactRoleId = DEFAULT_CONTACT_ROLE_IDS.client;
  const now = Date.now();

  const id = await ctx.db.insert("contacts", {
    name: nameForInsert,
    email: identity.email ?? "",
    phone: identity.phone ?? "",
    ...(identity.emails !== undefined ? { emails: identity.emails } : {}),
    ...(identity.phones !== undefined ? { phones: identity.phones } : {}),
    ...(identity.emailKey !== undefined ? { emailKey: identity.emailKey } : {}),
    notes: "",
    contactRoleIds,
    contactRoleId,
    organizationId: file.organizationId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (created) {
    await refreshContactGlobalSearchText(ctx, id);
    await appendContactCrudFeed(
      ctx,
      created,
      "contact_created",
      `Created contact “${created.name.trim() || "Contact"}”`,
      memberUserKey?.trim(),
    );
  }
  return created;
}

async function updateContactFromGuarantorRow(
  ctx: MutationCtx,
  contact: Doc<"contacts">,
  row: unknown,
  memberUserKey?: string,
): Promise<void> {
  await assertCanMutateContactRow(ctx, contact, memberUserKey);
  const patch = guarantorRowToContactIdentityPatch(row, contact);
  const name = (patch.name ?? contact.name).trim();
  if (!name) return;

  const methodsTouched =
    patch.email !== undefined ||
    patch.phone !== undefined ||
    patch.emails !== undefined ||
    patch.phones !== undefined;

  if (methodsTouched) {
    await assertNoDuplicateEmailsInOrg(
      ctx,
      contact.organizationId,
      allContactEmailStrings({
        email: patch.email ?? contact.email,
        emails: patch.emails ?? contact.emails,
      }),
      contact._id,
    );
  }

  const now = Date.now();
  const piiPatch = dealRowPiiToContactPatch(row);
  await ctx.db.patch(contact._id, {
    name,
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.emails !== undefined ? { emails: patch.emails } : {}),
    ...(patch.phones !== undefined ? { phones: patch.phones } : {}),
    ...(patch.emailKey !== undefined ? { emailKey: patch.emailKey } : {}),
    ...piiPatch,
    updatedAt: now,
  });
  await refreshContactGlobalSearchText(ctx, contact._id);
  const updated = await ctx.db.get(contact._id);
  if (updated) {
    await appendContactCrudFeed(
      ctx,
      updated,
      "contact_updated",
      `Updated contact “${updated.name.trim() || "Contact"}”`,
      memberUserKey?.trim(),
    );
  }
}

async function upsertGuarantorBusinessOwnership(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    businessEntityId: Id<"contactBusinessEntities">;
    ownershipPct?: string;
    role?: string;
  },
): Promise<void> {
  const { contact, businessEntityId, ownershipPct, role } = args;
  const now = Date.now();
  const existing = await ctx.db
    .query("contactBusinessOwnership")
    .withIndex("by_contact_entity", (q) =>
      q.eq("contactId", contact._id).eq("businessEntityId", businessEntityId),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      ownershipPercentage: ownershipPct,
      title: role,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactBusinessOwnership", {
    organizationId: contact.organizationId,
    contactId: contact._id,
    businessEntityId,
    ownershipPercentage: ownershipPct,
    title: role,
    createdAt: now,
    updatedAt: now,
  });
}

/** Guarantor row role → file-link role + canonical registry role. */
function guarantorLinkRole(row: unknown): {
  role: string;
  registryRoleId: RegistryRoleId;
} {
  const rec =
    row && typeof row === "object" ? (row as { role?: string }) : {};
  const raw = (rec.role ?? "").trim().toLowerCase();
  if (raw.includes("sponsor")) {
    return { role: "Sponsor", registryRoleId: "key_principal" };
  }
  return { role: "Guarantor", registryRoleId: "guarantor" };
}

/** Parse "50", "50%", "50.5 %" ownership strings to a 0–100 number. */
function ownershipPctToNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw.replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

/**
 * Phase Modular-A — guarantors/sponsors now appear in Associated Contacts.
 * Never demotes an existing borrower-class link (a guarantor may also be the
 * primary borrower on the same file).
 */
async function upsertGuarantorContactFileLink(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    row: unknown;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, row, memberUserKey } = args;
  await assertCanMutateContactFileLink(ctx, contact, file, memberUserKey);
  const { role, registryRoleId } = guarantorLinkRole(row);
  const now = Date.now();

  const existing = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contact._id).eq("fileId", file._id),
    )
    .first();

  if (existing) {
    if (
      isPrimaryBorrowerFileLink(existing) ||
      isCoBorrowerFileLink(existing)
    ) {
      return;
    }
    await ctx.db.patch(existing._id, {
      role,
      registryRoleId,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFileLinks", {
    contactId: contact._id,
    fileId: file._id,
    role,
    registryRoleId,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Phase 37.3.C.C.3 — sync guarantor liquidAssets / netWorth to contactFinancialProfiles.
 * Values remain strings (currency-formatted in UI) per schema.
 */
async function upsertGuarantorFinancialProfile(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    row: unknown;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, row, memberUserKey } = args;
  if (!row || typeof row !== "object") return;

  const rec = row as { netWorth?: string; liquidAssets?: string };
  const netWorth = dealStr(rec.netWorth);
  const liquidAssets = dealStr(rec.liquidAssets);
  if (netWorth === undefined && liquidAssets === undefined) return;

  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const existing = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();

  const now = Date.now();
  const financialPatch = {
    ...(netWorth !== undefined ? { netWorth } : {}),
    ...(liquidAssets !== undefined ? { liquidAssets } : {}),
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...financialPatch,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFinancialProfiles", {
    organizationId: contact.organizationId ?? file.organizationId,
    contactId: contact._id,
    income: [],
    assets: [],
    liabilities: [],
    ...financialPatch,
    createdAt: now,
    updatedAt: now,
  });
}

async function syncGuarantorsToContacts(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  guarantors: unknown[],
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const ensuredEntity = await ensureBusinessEntityFromDeal(
    ctx,
    file,
    deal,
    memberUserKey,
  );
  const businessEntityId = ensuredEntity?.businessEntityId ?? null;
  const canonicalClientId = ensuredEntity?.clientId ?? null;

  let contacts = await loadOrgContacts(ctx, file.organizationId);
  let lookups = buildGuarantorContactLookups(contacts, file.organizationId);
  const { primary, coBorrowers } = await loadPrimaryAndCoBorrowerContacts(
    ctx,
    file,
  );

  for (let i = 0; i < guarantors.length; i += 1) {
    const row = guarantors[i];
    if (!guarantorRowHasIdentity(row)) continue;

    let contact = matchGuarantorContact(row, lookups, primary, coBorrowers);

    if (!contact) {
      contact = await createContactFromGuarantorRow(ctx, {
        file,
        row,
        memberUserKey,
      });
      if (contact) {
        contacts = [...contacts, contact];
        lookups = buildGuarantorContactLookups(contacts, file.organizationId);
      }
    } else {
      await updateContactFromGuarantorRow(ctx, contact, row, memberUserKey);
      const refreshed = await ctx.db.get(contact._id);
      if (refreshed) {
        contacts = contacts.map((c) =>
          c._id === refreshed._id ? refreshed : c,
        );
        lookups = buildGuarantorContactLookups(contacts, file.organizationId);
      }
    }

    if (contact && businessEntityId) {
      const rec =
        row && typeof row === "object"
          ? (row as { ownershipPct?: string; role?: string })
          : {};
      await upsertGuarantorBusinessOwnership(ctx, {
        contact,
        businessEntityId,
        ownershipPct: dealStr(rec.ownershipPct),
        role: dealStr(rec.role),
      });
    }

    // Phase Modular-A — mirror the relationship onto the canonical clients row.
    if (contact && canonicalClientId && file.organizationId) {
      const rec =
        row && typeof row === "object"
          ? (row as { ownershipPct?: string; role?: string })
          : {};
      const { role, registryRoleId } = guarantorLinkRole(row);
      await upsertEntityContactLink(ctx, {
        organizationId: file.organizationId,
        entityId: canonicalClientId,
        contactId: contact._id,
        position: dealStr(rec.role) ?? role,
        registryRoleId,
        ownershipPercentage: ownershipPctToNumber(dealStr(rec.ownershipPct)),
      });
    }

    if (contact) {
      // Phase Modular-A — guarantors/sponsors now surface in Associated Contacts.
      await upsertGuarantorContactFileLink(ctx, {
        contact,
        file,
        row,
        memberUserKey,
      });

      await upsertGuarantorFinancialProfile(ctx, {
        contact,
        file,
        row,
        memberUserKey,
      });
    }
  }
}

/**
 * Phase 37.3.C.C.2 — dual-write guarantor identity to dealData, contacts, and
 * contactBusinessOwnership.
 */
export const saveGuarantorIdentityDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    guarantors: v.array(guarantor),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    await applyGuarantorsDealPatch(ctx, p, args.guarantors as unknown[]);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncGuarantorsToContacts(
      ctx,
      fileAfterDeal,
      args.guarantors as unknown[],
      memberUserKey,
    );

    return { ok: true as const };
  },
});



async function applyIncomeRowsDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  incomeRows: unknown[],
): Promise<{ ok: true }> {
  const cleaned = { incomeRows, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: ["incomeRows"],
    summary: clampActivitySummary("Deal: income"),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch({
          incomeRows,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function upsertContactFinancialProfileIncome(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    income: ReturnType<typeof incomeRowsToProfileArray>;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, income, memberUserKey } = args;
  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const existing = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();

  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      income,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFinancialProfiles", {
    organizationId: contact.organizationId ?? file.organizationId,
    contactId: contact._id,
    income,
    assets: [],
    liabilities: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function syncIncomeRowsToContactProfiles(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  incomeRows: unknown[],
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  const grouped = groupIncomeRowsByBorrowerIndex(incomeRows);

  const indices = new Set<number>();
  for (let i = 0; i < borrowers.length; i += 1) indices.add(i);
  for (const idx of grouped.keys()) indices.add(idx);

  if (indices.size === 0) return;

  const contacts = await loadOrgContacts(ctx, file.organizationId);
  const lookups = buildBorrowerContactLookups(contacts, file.organizationId);

  const sorted = [...indices].sort((a, b) => a - b);
  for (const borrowerIndex of sorted) {
    const row = borrowers[borrowerIndex];
    const contact = await resolveContactForBorrowerIndex(
      ctx,
      file,
      borrowerIndex,
      row,
      lookups,
    );
    if (!contact) continue;

    const bucket = grouped.get(borrowerIndex) ?? [];
    const income = incomeRowsToProfileArray(bucket);

    await upsertContactFinancialProfileIncome(ctx, {
      contact,
      file,
      income,
      memberUserKey,
    });
  }
}

/**
 * Phase 37.3.E.1 — dual-write income rows to dealData and contactFinancialProfiles.
 */
export const saveIncomeDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    incomeRows: v.array(incomeRow),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    await applyIncomeRowsDealPatch(ctx, p, args.incomeRows as unknown[]);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncIncomeRowsToContactProfiles(
      ctx,
      fileAfterDeal,
      args.incomeRows as unknown[],
      memberUserKey,
    );

    return { ok: true as const };
  },
});



async function applyAssetsLiabilitiesDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  patch: { assets?: unknown[]; liabilities?: unknown[] },
): Promise<{ ok: true }> {
  const keys = [
    ...(patch.assets !== undefined ? (["assets"] as const) : []),
    ...(patch.liabilities !== undefined ? (["liabilities"] as const) : []),
  ];
  if (keys.length === 0) return { ok: true as const };

  const cleaned = { ...patch, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  const summary =
    keys.length === 2
      ? "Deal: assets & liabilities"
      : keys[0] === "assets"
        ? "Deal: assets"
        : "Deal: liabilities";

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: [...keys],
    summary: clampActivitySummary(summary),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      const intakePatch: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.assets !== undefined) intakePatch.assets = patch.assets;
      if (patch.liabilities !== undefined) {
        intakePatch.liabilities = patch.liabilities;
      }
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch(intakePatch) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function upsertContactFinancialProfilePfs(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    assets?: ReturnType<typeof assetsToProfileArray>;
    liabilities?: ReturnType<typeof liabilitiesToProfileArray>;
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, assets, liabilities, memberUserKey } = args;
  if (assets === undefined && liabilities === undefined) return;

  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const existing = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();

  const now = Date.now();
  const financialPatch = {
    ...(assets !== undefined ? { assets } : {}),
    ...(liabilities !== undefined ? { liabilities } : {}),
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...financialPatch,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFinancialProfiles", {
    organizationId: contact.organizationId ?? file.organizationId,
    contactId: contact._id,
    income: [],
    assets: assets ?? [],
    liabilities: liabilities ?? [],
    createdAt: now,
    updatedAt: now,
  });
}

async function syncPfsArraysToPrimaryContactProfile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  patch: { assets?: unknown[]; liabilities?: unknown[] },
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;
  if (patch.assets === undefined && patch.liabilities === undefined) return;

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  const primaryRow = borrowers[0];

  const contacts = await loadOrgContacts(ctx, file.organizationId);
  const lookups = buildBorrowerContactLookups(contacts, file.organizationId);

  const contact = await resolveContactForBorrowerIndex(
    ctx,
    file,
    0,
    primaryRow,
    lookups,
  );
  if (!contact) return;

  await upsertContactFinancialProfilePfs(ctx, {
    contact,
    file,
    ...(patch.assets !== undefined
      ? { assets: assetsToProfileArray(patch.assets) }
      : {}),
    ...(patch.liabilities !== undefined
      ? { liabilities: liabilitiesToProfileArray(patch.liabilities) }
      : {}),
    memberUserKey,
  });
}

/**
 * Phase 37.3.E.2 — dual-write PFS assets/liabilities to dealData and primary
 * borrower's contactFinancialProfiles.
 */
export const saveAssetsAndLiabilitiesDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    assets: v.optional(v.array(assetRow)),
    liabilities: v.optional(v.array(liabilityRow)),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    if (args.assets === undefined && args.liabilities === undefined) {
      return { ok: true as const };
    }

    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const patch = {
      ...(args.assets !== undefined
        ? { assets: args.assets as unknown[] }
        : {}),
      ...(args.liabilities !== undefined
        ? { liabilities: args.liabilities as unknown[] }
        : {}),
    };

    await applyAssetsLiabilitiesDealPatch(ctx, p, patch);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncPfsArraysToPrimaryContactProfile(
      ctx,
      fileAfterDeal,
      patch,
      memberUserKey,
    );

    return { ok: true as const };
  },
});



async function applyReoDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  reo: unknown[],
): Promise<{ ok: true }> {
  const cleaned = { reo, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: ["reo"],
    summary: clampActivitySummary("Deal: REO"),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch({
          reo,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

function reoShapeHasIdentity(shape: ContactReoPropertyShape): boolean {
  return Boolean(
    reoFingerprintFromProfileShape(shape).replace(/\|/g, "").trim(),
  );
}

async function syncReoToPrimaryContactProfile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  reo: unknown[],
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  const primaryRow = borrowers[0];

  const contacts = await loadOrgContacts(ctx, file.organizationId);
  const lookups = buildBorrowerContactLookups(contacts, file.organizationId);

  const contact = await resolveContactForBorrowerIndex(
    ctx,
    file,
    0,
    primaryRow,
    lookups,
  );
  if (!contact) return;

  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const desired = reoRowsToProfileArray(reo).filter(reoShapeHasIdentity);

  const existing = await ctx.db
    .query("contactReoProperties")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .collect();

  const activeExisting = existing.filter((row) => row.archivedAt == null);
  const matchedIds = new Set<Id<"contactReoProperties">>();
  const now = Date.now();

  for (let i = 0; i < desired.length; i += 1) {
    const shape = { ...desired[i]!, sortOrder: i };
    const legacyRow = reo[i];
    const fp =
      reoFingerprintFromLegacyRow(legacyRow) ||
      reoFingerprintFromProfileShape(shape);

    const match = activeExisting.find(
      (row) =>
        !matchedIds.has(row._id) &&
        reoFingerprintFromStoredProperty(row) === fp,
    );

    const patchFields: Record<string, unknown> = {
      sortOrder: shape.sortOrder,
      updatedAt: now,
    };
    for (const key of [
      "propertyAddress",
      "propertyType",
      "usage",
      "state",
      "purchasedDate",
      "marketValue",
      "mortgageBalance",
      "monthlyPayment",
      "rate",
      "position",
      "taxes",
      "insurance",
      "hoa",
      "escrow",
      "grossRent",
      "netRent",
      "apn",
      "invested",
      "latLong",
    ] as const) {
      if (shape[key] !== undefined) {
        patchFields[key] = shape[key];
      }
    }

    if (match) {
      matchedIds.add(match._id);
      await ctx.db.patch(match._id, patchFields);
      continue;
    }

    await ctx.db.insert("contactReoProperties", {
      organizationId: contact.organizationId ?? file.organizationId,
      contactId: contact._id,
      sortOrder: shape.sortOrder,
      propertyAddress: shape.propertyAddress,
      propertyType: shape.propertyType,
      usage: shape.usage,
      state: shape.state,
      purchasedDate: shape.purchasedDate,
      marketValue: shape.marketValue,
      mortgageBalance: shape.mortgageBalance,
      monthlyPayment: shape.monthlyPayment,
      rate: shape.rate,
      position: shape.position,
      taxes: shape.taxes,
      insurance: shape.insurance,
      hoa: shape.hoa,
      escrow: shape.escrow,
      grossRent: shape.grossRent,
      netRent: shape.netRent,
      apn: shape.apn,
      invested: shape.invested,
      latLong: shape.latLong,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const row of activeExisting) {
    if (!matchedIds.has(row._id)) {
      await ctx.db.delete(row._id);
    }
  }
}

/**
 * Phase 37.3.E.3 — dual-write REO schedule to dealData and contactReoProperties.
 */
export const saveReoDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    reo: v.array(reoRow),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    await applyReoDealPatch(ctx, p, args.reo as unknown[]);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncReoToPrimaryContactProfile(
      ctx,
      fileAfterDeal,
      args.reo as unknown[],
      memberUserKey,
    );

    return { ok: true as const };
  },
});



async function applyWeightedInterestDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  weightedInterest: unknown[],
): Promise<{ ok: true }> {
  const cleaned = { weightedInterest, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: ["weightedInterest"],
    summary: clampActivitySummary("Deal: business debt"),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch({
          weightedInterest,
          updatedAt: Date.now(),
        }) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function syncBusinessDebtToEntitySchedule(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  weightedInterest: unknown[],
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const ensuredEntity = await ensureBusinessEntityFromDeal(
    ctx,
    file,
    deal,
    memberUserKey,
  );
  if (!ensuredEntity) return;
  const { businessEntityId } = ensuredEntity;

  const legacyRows = (Array.isArray(weightedInterest) ? weightedInterest : []).filter(
    (row) => {
      if (!row || typeof row !== "object") return false;
      if ((row as { include?: boolean }).include === false) return false;
      return Boolean(
        businessDebtFingerprintFromLegacyRow(row).replace(/\|/g, "").trim(),
      );
    },
  );

  const desired = legacyRows.map((row, index) =>
    businessDebtRowToScheduleShape(row, index),
  );

  const existing = await ctx.db
    .query("contactBusinessDebtSchedules")
    .withIndex("by_business_entity", (q) =>
      q.eq("businessEntityId", businessEntityId),
    )
    .collect();

  const activeExisting = existing.filter((row) => row.archivedAt == null);
  const matchedIds = new Set<Id<"contactBusinessDebtSchedules">>();
  const now = Date.now();

  for (let i = 0; i < desired.length; i += 1) {
    const shape = desired[i]!;
    const legacyRow = legacyRows[i];
    const fp = businessDebtFingerprintFromLegacyRow(legacyRow);

    const match = activeExisting.find(
      (row) =>
        !matchedIds.has(row._id) &&
        businessDebtFingerprintFromStored(row) === fp,
    );

    const patchFields: Record<string, unknown> = {
      sortOrder: shape.sortOrder,
      updatedAt: now,
    };
    for (const key of [
      "creditor",
      "balance",
      "monthlyPayment",
      "position",
    ] as const) {
      if (shape[key] !== undefined) {
        patchFields[key] = shape[key];
      }
    }

    if (match) {
      matchedIds.add(match._id);
      await ctx.db.patch(match._id, patchFields);
      continue;
    }

    await ctx.db.insert("contactBusinessDebtSchedules", {
      organizationId: file.organizationId,
      businessEntityId,
      sortOrder: shape.sortOrder,
      creditor: shape.creditor,
      balance: shape.balance,
      monthlyPayment: shape.monthlyPayment,
      position: shape.position,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const row of activeExisting) {
    if (!matchedIds.has(row._id)) {
      await ctx.db.delete(row._id);
    }
  }
}

/**
 * Phase 37.3.G — dual-write business debt schedule (`weightedInterest`) to
 * dealData and contactBusinessDebtSchedules on the borrowing entity.
 */
export const saveBusinessDebtDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    weightedInterest: v.array(weightedInterestRow),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    await applyWeightedInterestDealPatch(
      ctx,
      p,
      args.weightedInterest as unknown[],
    );

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncBusinessDebtToEntitySchedule(
      ctx,
      fileAfterDeal,
      args.weightedInterest as unknown[],
      memberUserKey,
    );

    return { ok: true as const };
  },
});



async function applyHouseholdDealPatch(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  patch: { dependentsCount?: string; dependentsAges?: string },
): Promise<{ ok: true }> {
  const keys = [
    ...(patch.dependentsCount !== undefined ? (["dependentsCount"] as const) : []),
    ...(patch.dependentsAges !== undefined ? (["dependentsAges"] as const) : []),
  ];
  if (keys.length === 0) return { ok: true as const };

  const cleaned = { ...patch, updatedAt: Date.now() };
  const deal = await resolveDealBaseForPipelinePatch(ctx, file);
  const mergedDeal = mergePatchIntoDeal(deal, cleaned) as Record<string, unknown>;
  const now = Date.now();
  await ctx.db.patch(
    file._id,
    sanitizeDbPatch({
      dealData: mergedDeal as Doc<"pipeline">["dealData"],
      updatedAt: now,
    }) as Partial<Doc<"pipeline">>,
  );

  await appendPipelineFileActivity(ctx, {
    fileId: file._id,
    at: now,
    kind: "deal_patch",
    keys: [...keys],
    summary: clampActivitySummary(
      keys.length === 2 ? "Deal: household dependents" : `Deal: ${keys[0]}`,
    ),
  });

  if (file.intakeSheetId) {
    const intakeRow = await ctx.db.get(file.intakeSheetId);
    if (intakeRow) {
      const intakePatch: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.dependentsCount !== undefined) {
        intakePatch.dependentsCount = patch.dependentsCount;
      }
      if (patch.dependentsAges !== undefined) {
        intakePatch.dependentsAges = patch.dependentsAges;
      }
      await ctx.db.patch(
        file.intakeSheetId,
        sanitizeDbPatch(intakePatch) as Partial<Doc<"intakeSheets">>,
      );
    }
  }

  await refreshPipelineGlobalSearchText(ctx, file._id);
  return { ok: true as const };
}

async function upsertPrimaryBorrowerHouseholdProfile(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    file: Doc<"pipeline">;
    patch: { dependentsCount?: string; dependentsAges?: string };
    memberUserKey?: string;
  },
): Promise<void> {
  const { contact, file, patch, memberUserKey } = args;
  if (patch.dependentsCount === undefined && patch.dependentsAges === undefined) {
    return;
  }

  await assertCanMutateContactRow(ctx, contact, memberUserKey);

  const dependentsCount =
    patch.dependentsCount !== undefined
      ? String(patch.dependentsCount).trim()
      : undefined;
  const dependentsAges =
    patch.dependentsAges !== undefined
      ? String(patch.dependentsAges).trim()
      : undefined;
  const financialPatch = {
    ...(patch.dependentsCount !== undefined ? { dependentsCount } : {}),
    ...(patch.dependentsAges !== undefined ? { dependentsAges } : {}),
  };
  if (Object.keys(financialPatch).length === 0) return;

  const existing = await ctx.db
    .query("contactFinancialProfiles")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();

  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...financialPatch,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("contactFinancialProfiles", {
    organizationId: contact.organizationId ?? file.organizationId,
    contactId: contact._id,
    income: [],
    assets: [],
    liabilities: [],
    ...financialPatch,
    createdAt: now,
    updatedAt: now,
  });
}

async function syncHouseholdToPrimaryContactProfile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  patch: { dependentsCount?: string; dependentsAges?: string },
  memberUserKey?: string,
): Promise<void> {
  if (!file.organizationId) return;
  if (patch.dependentsCount === undefined && patch.dependentsAges === undefined) {
    return;
  }

  const deal =
    file.dealData != null &&
    typeof file.dealData === "object" &&
    !Array.isArray(file.dealData)
      ? (file.dealData as Record<string, unknown>)
      : {};

  const borrowers = Array.isArray(deal.borrowers) ? deal.borrowers : [];
  const primaryRow = borrowers[0];

  const contacts = await loadOrgContacts(ctx, file.organizationId);
  const lookups = buildBorrowerContactLookups(contacts, file.organizationId);

  const contact = await resolveContactForBorrowerIndex(
    ctx,
    file,
    0,
    primaryRow,
    lookups,
  );
  if (!contact) return;

  await upsertPrimaryBorrowerHouseholdProfile(ctx, {
    contact,
    file,
    patch,
    memberUserKey,
  });
}

/**
 * Phase 37.4.H.2 — dual-write household dependents to dealData and primary
 * borrower's contactFinancialProfiles.
 */
export const saveHouseholdDualWrite = mutation({
  args: {
    fileId: v.id("pipeline"),
    dependentsCount: v.optional(v.string()),
    dependentsAges: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.number()),
    ...preferencesAccountIdArg,
  },
  handler: async (ctx, args) => {
    if (args.dependentsCount === undefined && args.dependentsAges === undefined) {
      return { ok: true as const };
    }

    const p = await ctx.db.get(args.fileId);
    if (!p) throw new Error("Pipeline not found");
    if (
      args.expectedUpdatedAt !== undefined &&
      p.updatedAt !== args.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        code: "CONFLICT_DATA_CHANGED" as const,
        serverUpdatedAt: p.updatedAt,
      };
    }

    await assertCanMutatePipelineRow(ctx, p, args.preferencesAccountId);
    const memberUserKey = args.preferencesAccountId?.trim() || undefined;

    const patch = {
      ...(args.dependentsCount !== undefined
        ? { dependentsCount: args.dependentsCount }
        : {}),
      ...(args.dependentsAges !== undefined
        ? { dependentsAges: args.dependentsAges }
        : {}),
    };

    await applyHouseholdDealPatch(ctx, p, patch);

    const fileAfterDeal = await ctx.db.get(args.fileId);
    if (!fileAfterDeal) throw new Error("Pipeline not found");

    await syncHouseholdToPrimaryContactProfile(
      ctx,
      fileAfterDeal,
      patch,
      memberUserKey,
    );

    return { ok: true as const };
  },
});


