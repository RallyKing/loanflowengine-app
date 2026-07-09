/**
 * Phase CRM-1 — entity (clients) ↔ individual (contacts) junction CRUD.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";
import {
  resolveClientAccessLevel,
} from "./resourceAccess";

import {
  entityContactRelationshipRoleV,
  type EntityContactRelationshipRole,
} from "./crmLinkValidators";
import { registryRoleIdV } from "./registryRoleValidators";
import { upsertEntityContactLink } from "./entityContactLinkHelpers";
import { coerceRegistryRoleId } from "../lib/registry/universalRoles";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

async function assertEntityReadable(
  ctx: Parameters<typeof resolveClientAccessLevel>[0],
  entity: Doc<"clients">,
  memberUserKey: string,
): Promise<void> {
  const level = await resolveClientAccessLevel(ctx, entity, memberUserKey);
  if (level === "none") {
    throw new Error("You do not have access to this business entity.");
  }
}

async function assertEntityMutable(
  ctx: Parameters<typeof resolveClientAccessLevel>[0],
  entity: Doc<"clients">,
  memberUserKey: string,
): Promise<void> {
  const level = await resolveClientAccessLevel(ctx, entity, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this business entity.");
  }
}

function normalizePosition(position: string): string {
  return position.trim().replace(/\s+/g, " ");
}

function normalizeOwnershipPercentage(
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) {
    throw new Error("Ownership percentage must be a valid number.");
  }
  if (value < 0 || value > 100) {
    throw new Error("Ownership percentage must be between 0 and 100.");
  }
  return value;
}

export const listByEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.organizationId !== args.organizationId) return [];
    await assertEntityReadable(ctx, entity, args.memberUserKey);
    const links = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .collect();
    const out: Array<{
      link: Doc<"entityContactLinks">;
      contact: Doc<"contacts"> | null;
    }> = [];
    for (const link of links) {
      if (link.organizationId !== args.organizationId) continue;
      const contact = await ctx.db.get(link.contactId);
      if (contact) {
        try {
          await assertCanReadContactRow(ctx, contact, args.memberUserKey);
        } catch {
          continue;
        }
      }
      out.push({ link, contact });
    }
    return out.sort(
      (a, b) =>
        (a.link.sortOrder ?? 0) - (b.link.sortOrder ?? 0) ||
        a.link.createdAt - b.link.createdAt,
    );
  },
});

export const listByContact = query({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);
    const links = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    const out: Array<{
      link: Doc<"entityContactLinks">;
      entity: Doc<"clients"> | null;
    }> = [];
    for (const link of links) {
      if (link.organizationId !== args.organizationId) continue;
      const entity = await ctx.db.get(link.entityId);
      if (entity) {
        try {
          await assertEntityReadable(ctx, entity, args.memberUserKey);
        } catch {
          continue;
        }
      }
      out.push({ link, entity });
    }
    return out.sort(
      (a, b) =>
        (a.link.sortOrder ?? 0) - (b.link.sortOrder ?? 0) ||
        a.link.createdAt - b.link.createdAt,
    );
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityId: v.id("clients"),
    contactId: v.id("contacts"),
    position: v.string(),
    registryRoleId: v.optional(registryRoleIdV),
    relationshipRole: v.optional(entityContactRelationshipRoleV),
    ownershipPercentage: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
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
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found.");
    }
    await assertEntityMutable(ctx, entity, args.memberUserKey);
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const registryRoleId = coerceRegistryRoleId(
      args.registryRoleId ??
        (args.relationshipRole
          ? args.relationshipRole
          : undefined),
    );

    const existing = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity_contact", (q) =>
        q.eq("entityId", args.entityId).eq("contactId", args.contactId),
      )
      .first();
    if (existing) {
      throw new Error("This contact is already linked to the entity.");
    }

    return await upsertEntityContactLink(ctx, {
      organizationId: args.organizationId,
      entityId: args.entityId,
      contactId: args.contactId,
      position: args.position,
      registryRoleId,
      ownershipPercentage: args.ownershipPercentage,
      sortOrder: args.sortOrder,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    linkId: v.id("entityContactLinks"),
    position: v.optional(v.string()),
    relationshipRole: v.optional(entityContactRelationshipRoleV),
    ownershipPercentage: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
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
    const link = await ctx.db.get(args.linkId);
    if (!link || link.organizationId !== args.organizationId) {
      throw new Error("Link not found.");
    }
    const entity = await ctx.db.get(link.entityId);
    const contact = await ctx.db.get(link.contactId);
    if (!entity || !contact) throw new Error("Link references missing records.");
    await assertEntityMutable(ctx, entity, args.memberUserKey);
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const patch: Partial<Doc<"entityContactLinks">> = {
      updatedAt: Date.now(),
    };
    if (args.position !== undefined) {
      const position = normalizePosition(args.position);
      if (!position) throw new Error("Position cannot be empty.");
      patch.position = position;
    }
    if (args.relationshipRole !== undefined) {
      patch.relationshipRole = args.relationshipRole;
    }
    if (args.ownershipPercentage !== undefined) {
      patch.ownershipPercentage = normalizeOwnershipPercentage(
        args.ownershipPercentage,
      );
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = args.sortOrder;
    }
    await ctx.db.patch(args.linkId, patch);
    return { ok: true as const };
  },
});

/** Lightweight index for Contacts hub filtering by junction metadata. */
export const listOrgLinkIndex = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const links = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const out: Array<{
      contactId: Id<"contacts">;
      entityId: Id<"clients">;
      position: string;
      relationshipRole: EntityContactRelationshipRole;
    }> = [];
    for (const link of links) {
      const contact = await ctx.db.get(link.contactId);
      if (!contact) continue;
      try {
        await assertCanReadContactRow(ctx, contact, args.memberUserKey);
      } catch {
        continue;
      }
      out.push({
        contactId: link.contactId,
        entityId: link.entityId,
        position: link.position,
        relationshipRole: link.relationshipRole,
      });
    }
    return out;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    linkId: v.id("entityContactLinks"),
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
    const link = await ctx.db.get(args.linkId);
    if (!link || link.organizationId !== args.organizationId) {
      throw new Error("Link not found.");
    }
    const entity = await ctx.db.get(link.entityId);
    const contact = await ctx.db.get(link.contactId);
    if (!entity || !contact) {
      await ctx.db.delete(args.linkId);
      return { ok: true as const };
    }
    await assertEntityMutable(ctx, entity, args.memberUserKey);
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);
    await ctx.db.delete(args.linkId);
    return { ok: true as const };
  },
});

export type { EntityContactRelationshipRole } from "./crmLinkValidators";
export { entityContactRelationshipRoleV } from "./crmLinkValidators";
