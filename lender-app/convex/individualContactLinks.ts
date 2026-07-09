/**
 * Phase CRM overhaul — individual ↔ individual person-to-person junction CRUD.
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

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

function normalizeRelationshipType(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Relationship type is required.");
  return trimmed;
}

function normalizeNotes(notes: string | undefined): string | undefined {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : undefined;
}

async function assertContactsInOrg(
  contact1: Doc<"contacts">,
  contact2: Doc<"contacts">,
  organizationId: Id<"organizations">,
): Promise<void> {
  if (
    contact1.organizationId !== organizationId ||
    contact2.organizationId !== organizationId
  ) {
    throw new Error("Both contacts must belong to this organization.");
  }
}

async function findExistingPairLink(
  ctx: Parameters<typeof assertOrgMember>[0],
  contactId1: Id<"contacts">,
  contactId2: Id<"contacts">,
): Promise<Doc<"individualContactLinks"> | null> {
  const forward = await ctx.db
    .query("individualContactLinks")
    .withIndex("by_contact_pair", (q) =>
      q.eq("contactId1", contactId1).eq("contactId2", contactId2),
    )
    .first();
  if (forward) return forward;

  return await ctx.db
    .query("individualContactLinks")
    .withIndex("by_contact_pair", (q) =>
      q.eq("contactId1", contactId2).eq("contactId2", contactId1),
    )
    .first();
}

export const listByContact = query({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);

    const fromFirst = await ctx.db
      .query("individualContactLinks")
      .withIndex("by_org_contact1", (q) =>
        q.eq("organizationId", args.organizationId).eq("contactId1", args.contactId),
      )
      .collect();
    const fromSecond = await ctx.db
      .query("individualContactLinks")
      .withIndex("by_org_contact2", (q) =>
        q.eq("organizationId", args.organizationId).eq("contactId2", args.contactId),
      )
      .collect();

    const seen = new Set<string>();
    const links = [...fromFirst, ...fromSecond].filter((link) => {
      const key = String(link._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const out: Array<{
      link: Doc<"individualContactLinks">;
      relatedContact: Doc<"contacts"> | null;
      direction: "outgoing" | "incoming";
    }> = [];

    for (const link of links) {
      const isOutgoing = link.contactId1 === args.contactId;
      const relatedId = isOutgoing ? link.contactId2 : link.contactId1;
      const relatedContact = await ctx.db.get(relatedId);
      if (relatedContact) {
        try {
          await assertCanReadContactRow(ctx, relatedContact, args.memberUserKey);
        } catch {
          continue;
        }
      }
      out.push({
        link,
        relatedContact,
        direction: isOutgoing ? "outgoing" : "incoming",
      });
    }

    return out.sort((a, b) => b.link.updatedAt - a.link.updatedAt);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId1: v.id("contacts"),
    contactId2: v.id("contacts"),
    relationshipType: v.string(),
    notes: v.optional(v.string()),
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

    if (args.contactId1 === args.contactId2) {
      throw new Error("A contact cannot be linked to themselves.");
    }

    const contact1 = await ctx.db.get(args.contactId1);
    const contact2 = await ctx.db.get(args.contactId2);
    if (!contact1 || !contact2) {
      throw new Error("One or both contacts were not found.");
    }
    await assertContactsInOrg(contact1, contact2, args.organizationId);
    await assertCanMutateContactRow(ctx, contact1, args.memberUserKey);
    await assertCanMutateContactRow(ctx, contact2, args.memberUserKey);

    const relationshipType = normalizeRelationshipType(args.relationshipType);
    const notes = normalizeNotes(args.notes);

    const existing = await findExistingPairLink(
      ctx,
      args.contactId1,
      args.contactId2,
    );
    if (existing) {
      throw new Error("These contacts are already linked.");
    }

    const now = Date.now();
    return await ctx.db.insert("individualContactLinks", {
      organizationId: args.organizationId,
      contactId1: args.contactId1,
      contactId2: args.contactId2,
      relationshipType,
      ...(notes !== undefined ? { notes } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    linkId: v.id("individualContactLinks"),
    relationshipType: v.optional(v.string()),
    notes: v.optional(v.string()),
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

    const contact1 = await ctx.db.get(link.contactId1);
    const contact2 = await ctx.db.get(link.contactId2);
    if (!contact1 || !contact2) {
      throw new Error("Link references missing contacts.");
    }
    await assertCanMutateContactRow(ctx, contact1, args.memberUserKey);
    await assertCanMutateContactRow(ctx, contact2, args.memberUserKey);

    const patch: Partial<Doc<"individualContactLinks">> = {
      updatedAt: Date.now(),
    };
    if (args.relationshipType !== undefined) {
      patch.relationshipType = normalizeRelationshipType(args.relationshipType);
    }
    if (args.notes !== undefined) {
      const notes = normalizeNotes(args.notes);
      patch.notes = notes;
    }

    await ctx.db.patch(args.linkId, patch);
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    linkId: v.id("individualContactLinks"),
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

    const contact1 = await ctx.db.get(link.contactId1);
    const contact2 = await ctx.db.get(link.contactId2);
    if (contact1) {
      await assertCanMutateContactRow(ctx, contact1, args.memberUserKey);
    }
    if (contact2) {
      await assertCanMutateContactRow(ctx, contact2, args.memberUserKey);
    }

    await ctx.db.delete(args.linkId);
    return { ok: true as const };
  },
});
