import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
} from "./organizationAccess";
import {
  contactBusinessDebtFieldsV,
  contactDataEntityTypeV,
  contactReoPropertyFieldsV,
  contactStickyAssetRowV,
  contactStickyIncomeRowV,
  contactStickyLiabilityRowV,
} from "./contactStickyData/validators";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function appendContactDataVersion(
  ctx: MutationCtx,
  args: {
    contact: Doc<"contacts">;
    entityType: Doc<"contactDataVersions">["entityType"];
    entityId?: string;
    previousState: unknown;
    modifiedBy: string;
  },
): Promise<Id<"contactDataVersions">> {
  const now = Date.now();
  return await ctx.db.insert("contactDataVersions", {
    organizationId: args.contact.organizationId,
    contactId: args.contact._id,
    entityType: args.entityType,
    entityId: args.entityId,
    previousState: cloneJson(args.previousState),
    modifiedBy: args.modifiedBy.trim(),
    modifiedAt: now,
  });
}

async function loadContactForBridge(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  memberUserKey: string,
  mode: "read" | "mutate",
): Promise<Doc<"contacts">> {
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found.");
  if (mode === "read") {
    await assertCanReadContactRow(ctx, contact, memberUserKey);
  } else {
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
  }
  return contact;
}

const reoPropertyPatchV = v.object({
  sortOrder: v.optional(v.number()),
  ...contactReoPropertyFieldsV,
});

const financialProfilePatchV = v.object({
  income: v.optional(v.array(contactStickyIncomeRowV)),
  assets: v.optional(v.array(contactStickyAssetRowV)),
  liabilities: v.optional(v.array(contactStickyLiabilityRowV)),
  netWorth: v.optional(v.string()),
  liquidAssets: v.optional(v.string()),
  dependentsCount: v.optional(v.string()),
  dependentsAges: v.optional(v.string()),
});

const businessOwnershipPatchV = v.object({
  ownershipPercentage: v.optional(v.string()),
  title: v.optional(v.string()),
});

const businessDebtPatchV = v.object({
  sortOrder: v.optional(v.number()),
  ...contactBusinessDebtFieldsV,
});

/* ============================== REO ============================== */

export const getContactReo = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);
    const rows = await ctx.db
      .query("contactReoProperties")
      .withIndex("by_contact_sort", (q) => q.eq("contactId", args.contactId))
      .collect();
    if (args.includeArchived) return rows;
    return rows.filter((r) => r.archivedAt == null);
  },
});

export const saveContactReo = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    reoId: v.optional(v.id("contactReoProperties")),
    patch: reoPropertyPatchV,
  },
  handler: async (ctx, args) => {
    const contact = await loadContactForBridge(
      ctx,
      args.contactId,
      args.memberUserKey,
      "mutate",
    );
    const now = Date.now();
    const actor = args.memberUserKey.trim();

    if (args.reoId) {
      const existing = await ctx.db.get(args.reoId);
      if (!existing || existing.contactId !== args.contactId) {
        throw new Error("REO property not found for this contact.");
      }
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "reo",
        entityId: existing._id,
        previousState: existing,
        modifiedBy: actor,
      });
      await ctx.db.patch(args.reoId, {
        ...args.patch,
        updatedAt: now,
      });
      return args.reoId;
    }

    const siblings = await ctx.db
      .query("contactReoProperties")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    const sortOrder =
      args.patch.sortOrder ??
      siblings.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    const id = await ctx.db.insert("contactReoProperties", {
      organizationId: contact.organizationId,
      contactId: args.contactId,
      sortOrder,
      propertyAddress: args.patch.propertyAddress,
      propertyType: args.patch.propertyType,
      usage: args.patch.usage,
      state: args.patch.state,
      purchasedDate: args.patch.purchasedDate,
      marketValue: args.patch.marketValue,
      mortgageBalance: args.patch.mortgageBalance,
      monthlyPayment: args.patch.monthlyPayment,
      rate: args.patch.rate,
      position: args.patch.position,
      taxes: args.patch.taxes,
      insurance: args.patch.insurance,
      hoa: args.patch.hoa,
      escrow: args.patch.escrow,
      grossRent: args.patch.grossRent,
      netRent: args.patch.netRent,
      apn: args.patch.apn,
      invested: args.patch.invested,
      latLong: args.patch.latLong,
      createdAt: now,
      updatedAt: now,
    });

    await appendContactDataVersion(ctx, {
      contact,
      entityType: "reo",
      entityId: id,
      previousState: null,
      modifiedBy: actor,
    });

    return id;
  },
});

export const archiveContactReo = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    reoId: v.id("contactReoProperties"),
  },
  handler: async (ctx, args) => {
    const contact = await loadContactForBridge(
      ctx,
      args.contactId,
      args.memberUserKey,
      "mutate",
    );
    const existing = await ctx.db.get(args.reoId);
    if (!existing || existing.contactId !== args.contactId) {
      throw new Error("REO property not found for this contact.");
    }
    const now = Date.now();
    await appendContactDataVersion(ctx, {
      contact,
      entityType: "reo",
      entityId: existing._id,
      previousState: existing,
      modifiedBy: args.memberUserKey.trim(),
    });
    await ctx.db.patch(args.reoId, { archivedAt: now, updatedAt: now });
    return args.reoId;
  },
});

/* ============================== PFS ============================== */

export const getContactFinancialProfile = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);
    return await ctx.db
      .query("contactFinancialProfiles")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .first();
  },
});

export const saveContactFinancialProfile = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    patch: financialProfilePatchV,
  },
  handler: async (ctx, args) => {
    const contact = await loadContactForBridge(
      ctx,
      args.contactId,
      args.memberUserKey,
      "mutate",
    );
    const now = Date.now();
    const actor = args.memberUserKey.trim();
    const existing = await ctx.db
      .query("contactFinancialProfiles")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .first();

    if (existing) {
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "pfs",
        entityId: existing._id,
        previousState: existing,
        modifiedBy: actor,
      });
      await ctx.db.patch(existing._id, { ...args.patch, updatedAt: now });
      return existing._id;
    }

    const id = await ctx.db.insert("contactFinancialProfiles", {
      organizationId: contact.organizationId,
      contactId: args.contactId,
      income: args.patch.income ?? [],
      assets: args.patch.assets ?? [],
      liabilities: args.patch.liabilities ?? [],
      netWorth: args.patch.netWorth,
      liquidAssets: args.patch.liquidAssets,
      dependentsCount: args.patch.dependentsCount,
      dependentsAges: args.patch.dependentsAges,
      createdAt: now,
      updatedAt: now,
    });

    await appendContactDataVersion(ctx, {
      contact,
      entityType: "pfs",
      entityId: id,
      previousState: null,
      modifiedBy: actor,
    });

    return id;
  },
});

/* ============================== Business ============================== */

export const getContactBusinessEntities = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);

    const ownership = await ctx.db
      .query("contactBusinessOwnership")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    const entities: {
      ownership: Doc<"contactBusinessOwnership">;
      entity: Doc<"contactBusinessEntities"> | null;
    }[] = [];

    for (const row of ownership) {
      const entity = await ctx.db.get(row.businessEntityId);
      entities.push({ ownership: row, entity });
    }
    return entities;
  },
});

export const saveContactBusinessEntity = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    entityId: v.optional(v.id("contactBusinessEntities")),
    entity: v.object({
      entityName: v.string(),
      dba: v.optional(v.string()),
      ein: v.optional(v.string()),
      entityType: v.optional(v.string()),
      state: v.optional(v.string()),
      formationDate: v.optional(v.string()),
    }),
    ownership: v.optional(businessOwnershipPatchV),
  },
  handler: async (ctx, args) => {
    const contact = await loadContactForBridge(
      ctx,
      args.contactId,
      args.memberUserKey,
      "mutate",
    );
    const now = Date.now();
    const actor = args.memberUserKey.trim();
    let entityId = args.entityId;

    if (entityId) {
      const existing = await ctx.db.get(entityId);
      if (!existing) throw new Error("Business entity not found.");
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "business",
        entityId,
        previousState: existing,
        modifiedBy: actor,
      });
      await ctx.db.patch(entityId, {
        ...args.entity,
        updatedAt: now,
      });
    } else {
      entityId = await ctx.db.insert("contactBusinessEntities", {
        organizationId: contact.organizationId,
        ...args.entity,
        createdAt: now,
        updatedAt: now,
      });
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "business",
        entityId,
        previousState: null,
        modifiedBy: actor,
      });
    }

    const ownershipPatch = args.ownership ?? {};
    const existingLink = await ctx.db
      .query("contactBusinessOwnership")
      .withIndex("by_contact_entity", (q) =>
        q.eq("contactId", args.contactId).eq("businessEntityId", entityId!),
      )
      .first();

    if (existingLink) {
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "business_ownership",
        entityId: existingLink._id,
        previousState: existingLink,
        modifiedBy: actor,
      });
      await ctx.db.patch(existingLink._id, {
        ...ownershipPatch,
        updatedAt: now,
      });
    } else {
      const linkId = await ctx.db.insert("contactBusinessOwnership", {
        organizationId: contact.organizationId,
        contactId: args.contactId,
        businessEntityId: entityId!,
        ownershipPercentage: ownershipPatch.ownershipPercentage,
        title: ownershipPatch.title,
        createdAt: now,
        updatedAt: now,
      });
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "business_ownership",
        entityId: linkId,
        previousState: null,
        modifiedBy: actor,
      });
    }

    return entityId!;
  },
});

/* ============================== Business debt ============================== */

export const getContactBusinessDebtSchedule = query({
  args: {
    businessEntityId: v.id("contactBusinessEntities"),
    memberUserKey: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.businessEntityId);
    if (!entity) return [];

    const ownership = await ctx.db
      .query("contactBusinessOwnership")
      .withIndex("by_business_entity", (q) =>
        q.eq("businessEntityId", args.businessEntityId),
      )
      .first();
    if (ownership) {
      const contact = await ctx.db.get(ownership.contactId);
      if (contact) {
        await assertCanReadContactRow(ctx, contact, args.memberUserKey);
      }
    }

    const rows = await ctx.db
      .query("contactBusinessDebtSchedules")
      .withIndex("by_business_entity_sort", (q) =>
        q.eq("businessEntityId", args.businessEntityId),
      )
      .collect();
    if (args.includeArchived) return rows;
    return rows.filter((r) => r.archivedAt == null);
  },
});

export const saveContactBusinessDebt = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    businessEntityId: v.id("contactBusinessEntities"),
    debtId: v.optional(v.id("contactBusinessDebtSchedules")),
    patch: businessDebtPatchV,
  },
  handler: async (ctx, args) => {
    const contact = await loadContactForBridge(
      ctx,
      args.contactId,
      args.memberUserKey,
      "mutate",
    );
    const entity = await ctx.db.get(args.businessEntityId);
    if (!entity) throw new Error("Business entity not found.");

    const now = Date.now();
    const actor = args.memberUserKey.trim();

    if (args.debtId) {
      const existing = await ctx.db.get(args.debtId);
      if (!existing || existing.businessEntityId !== args.businessEntityId) {
        throw new Error("Debt row not found for this entity.");
      }
      await appendContactDataVersion(ctx, {
        contact,
        entityType: "business_debt",
        entityId: existing._id,
        previousState: existing,
        modifiedBy: actor,
      });
      await ctx.db.patch(args.debtId, { ...args.patch, updatedAt: now });
      return args.debtId;
    }

    const siblings = await ctx.db
      .query("contactBusinessDebtSchedules")
      .withIndex("by_business_entity", (q) =>
        q.eq("businessEntityId", args.businessEntityId),
      )
      .collect();
    const sortOrder =
      args.patch.sortOrder ??
      siblings.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    const id = await ctx.db.insert("contactBusinessDebtSchedules", {
      organizationId: contact.organizationId ?? entity.organizationId,
      businessEntityId: args.businessEntityId,
      sortOrder,
      creditor: args.patch.creditor,
      balance: args.patch.balance,
      monthlyPayment: args.patch.monthlyPayment,
      position: args.patch.position,
      createdAt: now,
      updatedAt: now,
    });

    await appendContactDataVersion(ctx, {
      contact,
      entityType: "business_debt",
      entityId: id,
      previousState: null,
      modifiedBy: actor,
    });

    return id;
  },
});

/** All business debt rows across entities owned by a contact. */
export const listBusinessDebtByContact = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);

    const ownership = await ctx.db
      .query("contactBusinessOwnership")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    const out: Array<{
      debt: Doc<"contactBusinessDebtSchedules">;
      entity: Doc<"contactBusinessEntities"> | null;
    }> = [];

    for (const link of ownership) {
      const entity = await ctx.db.get(link.businessEntityId);
      const schedule = await ctx.db
        .query("contactBusinessDebtSchedules")
        .withIndex("by_business_entity_sort", (q) =>
          q.eq("businessEntityId", link.businessEntityId),
        )
        .collect();
      for (const debt of schedule) {
        if (!args.includeArchived && debt.archivedAt != null) continue;
        out.push({ debt, entity });
      }
    }
    return out;
  },
});

/* ============================== Version history ============================== */

export const listContactDataVersions = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.string(),
    entityType: v.optional(contactDataEntityTypeV),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);

    const cap = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = args.entityType
      ? await ctx.db
          .query("contactDataVersions")
          .withIndex("by_contact_entity_type_at", (q) =>
            q.eq("contactId", args.contactId).eq("entityType", args.entityType!),
          )
          .order("desc")
          .take(cap)
      : await ctx.db
          .query("contactDataVersions")
          .withIndex("by_contact_at", (q) => q.eq("contactId", args.contactId))
          .order("desc")
          .take(cap);

    return rows;
  },
});
