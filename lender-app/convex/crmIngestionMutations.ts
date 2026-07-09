/**
 * Phase CRM-2 — transactional CRM ingestion (entity + individual + junction links).
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutateContactRow,
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";
import { resolveClientAccessLevel } from "./resourceAccess";
import {
  entityContactRelationshipRoleV,
  type EntityContactRelationshipRole,
} from "./crmLinkValidators";
import { contactMethodsCreateArgs } from "../lib/contact/contactMethods";
import {
  DEFAULT_CONTACT_ROLE_IDS,
  primaryContactRoleIdFromDoc,
} from "../lib/contact/contactRoles";
import { refreshContactGlobalSearchText } from "./globalSearchSync";
import { normalizeEmailKey } from "../lib/crmRelationship";
import { resolveOrCreateEntityClientForHierarchy } from "./pipelineHierarchyClientResolve";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const newContactInlineV = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
});

const individualAssociationV = v.object({
  contactId: v.optional(v.id("contacts")),
  newContact: v.optional(newContactInlineV),
  position: v.string(),
  relationshipRole: entityContactRelationshipRoleV,
});

const entityAssociationV = v.object({
  entityId: v.optional(v.id("clients")),
  newEntity: v.optional(
    v.object({
      displayName: v.string(),
    }),
  ),
  position: v.string(),
  relationshipRole: entityContactRelationshipRoleV,
});

function normalizePosition(position: string): string {
  return position.trim().replace(/\s+/g, " ");
}

async function insertEntityContactLink(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    entityId: Id<"clients">;
    contactId: Id<"contacts">;
    position: string;
    relationshipRole: EntityContactRelationshipRole;
    ownershipPercentage?: number;
  },
): Promise<Id<"entityContactLinks">> {
  const position = normalizePosition(args.position);
  if (!position) throw new Error("Position is required for each association.");

  const existing = await ctx.db
    .query("entityContactLinks")
    .withIndex("by_entity_contact", (q) =>
      q.eq("entityId", args.entityId).eq("contactId", args.contactId),
    )
    .first();
  if (existing) {
    throw new Error("A contact is already linked to this entity.");
  }

  const siblingLinks = await ctx.db
    .query("entityContactLinks")
    .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
    .collect();
  const sortOrder =
    siblingLinks.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) +
    1;
  const now = Date.now();
  const ownershipPercentage =
    args.ownershipPercentage !== undefined &&
    Number.isFinite(args.ownershipPercentage) &&
    args.ownershipPercentage >= 0 &&
    args.ownershipPercentage <= 100
      ? args.ownershipPercentage
      : undefined;

  return await ctx.db.insert("entityContactLinks", {
    organizationId: args.organizationId,
    entityId: args.entityId,
    contactId: args.contactId,
    position,
    relationshipRole: args.relationshipRole,
    ...(ownershipPercentage !== undefined ? { ownershipPercentage } : {}),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
}

async function assertNoDuplicateContactEmailInOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  email: string | undefined,
): Promise<void> {
  const key = normalizeEmailKey(email ?? "");
  if (!key) return;
  const dup = await ctx.db
    .query("contacts")
    .withIndex("by_organization_emailKey", (q) =>
      q.eq("organizationId", organizationId).eq("emailKey", key),
    )
    .first();
  if (dup) {
    throw new Error(
      "A contact with this email already exists in this organization.",
    );
  }
}

async function createOrgContact(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    name: string;
    email?: string;
    phone?: string;
  },
): Promise<Id<"contacts">> {
  const name = args.name.trim();
  if (!name) throw new Error("Contact name is required.");

  await assertNoDuplicateContactEmailInOrg(ctx, args.organizationId, args.email);

  const methods = contactMethodsCreateArgs({
    email: args.email,
    phone: args.phone,
  });
  const contactRoleIds = [DEFAULT_CONTACT_ROLE_IDS.client];
  const contactRoleId = primaryContactRoleIdFromDoc({ contactRoleIds });
  const now = Date.now();

  const contactId = await ctx.db.insert("contacts", {
    name,
    email: methods.emails?.[0]?.email ?? "",
    phone: methods.phones?.[0]?.number ?? "",
    ...(methods.emails?.length ? { emails: methods.emails } : {}),
    ...(methods.phones?.length ? { phones: methods.phones } : {}),
    notes: "",
    contactRoleIds,
    contactRoleId,
    organizationId: args.organizationId,
    createdAt: now,
    updatedAt: now,
  });
  await refreshContactGlobalSearchText(ctx, contactId);
  return contactId;
}

async function createOrgEntity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    displayName: string;
    companyName?: string;
    primaryContactName?: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    primaryContactId?: Id<"contacts">;
  },
): Promise<Id<"clients">> {
  const displayName = args.displayName.trim();
  if (!displayName) throw new Error("Entity name is required.");

  return await resolveOrCreateEntityClientForHierarchy(ctx, {
    organizationId: args.organizationId,
    memberUserKey: args.memberUserKey,
    legalName: displayName,
    dba: args.companyName?.trim() || undefined,
    primaryContactId: args.primaryContactId,
  });
}

async function resolveContactIdFromAssociation(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  row: {
    contactId?: Id<"contacts">;
    newContact?: { name: string; email?: string; phone?: string };
  },
): Promise<Id<"contacts">> {
  if (row.contactId) {
    const contact = await ctx.db.get(row.contactId);
    if (!contact || contact.organizationId !== organizationId) {
      throw new Error("Selected contact was not found.");
    }
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
    return row.contactId;
  }
  if (row.newContact?.name.trim()) {
    return await createOrgContact(ctx, {
      organizationId,
      memberUserKey,
      name: row.newContact.name,
      email: row.newContact.email,
      phone: row.newContact.phone,
    });
  }
  throw new Error(
    "Each associated individual requires a contact selection or new name.",
  );
}

async function resolveEntityIdFromAssociation(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  row: {
    entityId?: Id<"clients">;
    newEntity?: { displayName: string };
  },
): Promise<Id<"clients">> {
  if (row.entityId) {
    const entity = await ctx.db.get(row.entityId);
    if (!entity || entity.organizationId !== organizationId) {
      throw new Error("Selected entity was not found.");
    }
    const level = await resolveClientAccessLevel(ctx, entity, memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to link to this entity.");
    }
    return row.entityId;
  }
  if (row.newEntity?.displayName.trim()) {
    return await createOrgEntity(ctx, {
      organizationId,
      memberUserKey,
      displayName: row.newEntity.displayName,
    });
  }
  throw new Error(
    "Each associated entity requires a selection or new name.",
  );
}

export const ingestBusinessEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    displayName: v.string(),
    companyName: v.optional(v.string()),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    primaryContactPhone: v.optional(v.string()),
    individualAssociations: v.array(individualAssociationV),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    let primaryContactId: Id<"contacts"> | undefined;
    const primaryName = args.primaryContactName?.trim();
    if (primaryName) {
      primaryContactId = await createOrgContact(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        name: primaryName,
        email: args.primaryContactEmail,
        phone: args.primaryContactPhone,
      });
    }

    const entityId = await createOrgEntity(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      displayName: args.displayName,
      companyName: args.companyName,
      primaryContactName: primaryName,
      primaryContactEmail: args.primaryContactEmail,
      primaryContactPhone: args.primaryContactPhone,
      primaryContactId,
    });

    const linkIds: Id<"entityContactLinks">[] = [];
    for (const row of args.individualAssociations) {
      const contactId = await resolveContactIdFromAssociation(
        ctx,
        args.organizationId,
        args.memberUserKey,
        row,
      );
      if (
        primaryContactId &&
        String(contactId) === String(primaryContactId)
      ) {
        continue;
      }
      const linkId = await insertEntityContactLink(ctx, {
        organizationId: args.organizationId,
        entityId,
        contactId,
        position: row.position,
        relationshipRole: row.relationshipRole,
      });
      linkIds.push(linkId);
    }

    return {
      ok: true as const,
      entityId,
      primaryContactId,
      linkIds,
    };
  },
});

export const ingestIndividual = mutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    entityAssociations: v.array(entityAssociationV),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const name = [args.firstName.trim(), args.lastName?.trim()]
      .filter(Boolean)
      .join(" ");
    if (!name) throw new Error("First name is required.");

    const contactId = await createOrgContact(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      name,
      email: args.email,
      phone: args.phone,
    });

    const linkIds: Id<"entityContactLinks">[] = [];
    for (const row of args.entityAssociations) {
      const entityId = await resolveEntityIdFromAssociation(
        ctx,
        args.organizationId,
        args.memberUserKey,
        row,
      );
      const linkId = await insertEntityContactLink(ctx, {
        organizationId: args.organizationId,
        entityId,
        contactId,
        position: row.position,
        relationshipRole: row.relationshipRole,
      });
      linkIds.push(linkId);
    }

    return {
      ok: true as const,
      contactId,
      linkIds,
    };
  },
});

export const setIndividualPrimaryCompany = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    clear: v.optional(v.boolean()),
    entityId: v.optional(v.id("clients")),
    newEntity: v.optional(
      v.object({
        displayName: v.string(),
      }),
    ),
    position: v.optional(v.string()),
    relationshipRole: v.optional(entityContactRelationshipRoleV),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found.");
    }
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const now = Date.now();
    const links = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    if (args.clear) {
      for (const link of links) {
        if (link.isPrimaryCompany) {
          await ctx.db.delete(link._id);
        }
      }
      await ctx.db.patch(args.contactId, {
        companyName: undefined,
        companyKey: undefined,
        updatedAt: now,
      });
      await refreshContactGlobalSearchText(ctx, args.contactId);
      return { ok: true as const, cleared: true as const };
    }

    const position = normalizePosition(args.position ?? "");
    if (!position) {
      throw new Error("Position is required when linking a business entity.");
    }
    if (!args.relationshipRole) {
      throw new Error("Relationship role is required.");
    }

    let entityId = args.entityId;
    if (!entityId && args.newEntity?.displayName.trim()) {
      entityId = await createOrgEntity(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        displayName: args.newEntity.displayName,
      });
    }
    if (!entityId) {
      throw new Error("Select or create a business entity.");
    }

    const entity = await ctx.db.get(entityId);
    if (!entity || entity.organizationId !== args.organizationId) {
      throw new Error("Business entity not found.");
    }
    const level = await resolveClientAccessLevel(
      ctx,
      entity,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to link to this entity.");
    }

    for (const link of links) {
      if (link.isPrimaryCompany) {
        await ctx.db.delete(link._id);
      }
    }

    const existingPair = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity_contact", (q) =>
        q.eq("entityId", entityId).eq("contactId", args.contactId),
      )
      .first();

    if (existingPair) {
      await ctx.db.patch(existingPair._id, {
        position,
        relationshipRole: args.relationshipRole,
        isPrimaryCompany: true,
        sortOrder: 0,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("entityContactLinks", {
        organizationId: args.organizationId,
        entityId,
        contactId: args.contactId,
        position,
        relationshipRole: args.relationshipRole,
        isPrimaryCompany: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.contactId, {
      companyName: undefined,
      companyKey: undefined,
      updatedAt: now,
    });
    await refreshContactGlobalSearchText(ctx, args.contactId);

    return {
      ok: true as const,
      entityId,
      contactId: args.contactId,
    };
  },
});

/** Link an individual to an entity in their portfolio (no primary-company semantics). */
export const addEntityToPortfolio = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    entityId: v.optional(v.id("clients")),
    newEntity: v.optional(
      v.object({
        displayName: v.string(),
      }),
    ),
    position: v.string(),
    relationshipRole: entityContactRelationshipRoleV,
    ownershipPercentage: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found.");
    }
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const position = normalizePosition(args.position);
    if (!position) {
      throw new Error("Position is required when adding an entity to the portfolio.");
    }

    let entityId = args.entityId;
    if (!entityId && args.newEntity?.displayName.trim()) {
      entityId = await createOrgEntity(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        displayName: args.newEntity.displayName,
        primaryContactId: args.contactId,
        primaryContactName: contact.name?.trim(),
      });
    }
    if (!entityId) {
      throw new Error("Select an existing entity or provide a name for a new one.");
    }

    const entity = await ctx.db.get(entityId);
    if (!entity || entity.organizationId !== args.organizationId) {
      throw new Error("Business entity not found.");
    }
    const level = await resolveClientAccessLevel(
      ctx,
      entity,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to link to this entity.");
    }

    const linkId = await insertEntityContactLink(ctx, {
      organizationId: args.organizationId,
      entityId,
      contactId: args.contactId,
      position,
      relationshipRole: args.relationshipRole,
      ownershipPercentage: args.ownershipPercentage,
    });

    return {
      ok: true as const,
      linkId,
      entityId,
      contactId: args.contactId,
    };
  },
});

/** Link an individual to an entity (inverse of addEntityToPortfolio). */
export const addPrincipalToEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityId: v.id("clients"),
    contactId: v.optional(v.id("contacts")),
    newContact: v.optional(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      }),
    ),
    position: v.string(),
    relationshipRole: entityContactRelationshipRoleV,
    ownershipPercentage: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.organizationId !== args.organizationId) {
      throw new Error("Business entity not found.");
    }
    const level = await resolveClientAccessLevel(
      ctx,
      entity,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this entity.");
    }

    const position = normalizePosition(args.position);
    if (!position) {
      throw new Error("Position is required when adding a principal.");
    }

    let contactId = args.contactId;
    if (!contactId && args.newContact?.name.trim()) {
      contactId = await createOrgContact(ctx, {
        organizationId: args.organizationId,
        memberUserKey: args.memberUserKey,
        name: args.newContact.name,
        email: args.newContact.email,
        phone: args.newContact.phone,
      });
    }
    if (!contactId) {
      throw new Error(
        "Select an existing individual or provide a name for a new one.",
      );
    }

    const contact = await ctx.db.get(contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found.");
    }
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const linkId = await insertEntityContactLink(ctx, {
      organizationId: args.organizationId,
      entityId: args.entityId,
      contactId,
      position,
      relationshipRole: args.relationshipRole,
      ownershipPercentage: args.ownershipPercentage,
    });

    if (!entity.primaryContactId) {
      await ctx.db.patch(args.entityId, {
        primaryContactId: contactId,
        primaryContactName: contact.name?.trim() || undefined,
        primaryContactEmail:
          contact.email?.trim() || entity.primaryContactEmail,
        updatedAt: Date.now(),
      });
    }

    return {
      ok: true as const,
      linkId,
      entityId: args.entityId,
      contactId,
    };
  },
});
