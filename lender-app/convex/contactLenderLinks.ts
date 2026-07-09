import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
  assertContactAndLenderOrgCompatible,
} from "./organizationAccess";
import { insertContactActivity } from "./contactActivity";

import { DEFAULT_CONTACT_ROLE_IDS } from "../lib/contact/contactRoles";

function normalizeRole(role: string): string {
  return role.trim().replace(/\s+/g, " ");
}

function normalizeNotes(notes: string | undefined): string | undefined {
  const t = notes?.trim();
  return t ? t : undefined;
}

export const listByContact = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, memberUserKey }) => {
    const c = await ctx.db.get(contactId);
    if (c) await assertCanReadContactRow(ctx, c, memberUserKey);
    return await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .collect();
  },
});

/** Links plus lender rows for CRM contact detail. */
export const listByContactWithLenders = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, memberUserKey }) => {
    const c = await ctx.db.get(contactId);
    if (c) await assertCanReadContactRow(ctx, c, memberUserKey);
    const links = await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .collect();
    const out: Array<{
      link: (typeof links)[number];
      lender: Doc<"lenders"> | null;
    }> = [];
    for (const link of links) {
      const lender = await ctx.db.get(link.lenderId);
      out.push({ link, lender });
    }
    return out;
  },
});

export const listByLender = query({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, { lenderId }) => {
    return await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
      .order("desc")
      .collect();
  },
});

export const listByLenderWithContacts = query({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, { lenderId }) => {
    const links = await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
      .order("desc")
      .collect();
    const out: Array<{
      link: (typeof links)[number];
      contact: Doc<"contacts"> | null;
    }> = [];
    for (const link of links) {
      const contact = await ctx.db.get(link.contactId);
      out.push({ link, contact });
    }
    return out;
  },
});

export const getByContactAndLender = query({
  args: { contactId: v.id("contacts"), lenderId: v.id("lenders") },
  handler: async (ctx, { contactId, lenderId }) => {
    return await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact_lender", (q) =>
        q.eq("contactId", contactId).eq("lenderId", lenderId),
      )
      .first();
  },
});

export const upsert = mutation({
  args: {
    contactId: v.id("contacts"),
    lenderId: v.id("lenders"),
    role: v.string(),
    notes: v.optional(v.string()),
    contactRoleId: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { contactId, lenderId, role, notes, contactRoleId, memberUserKey } =
      args;
    const roleNorm = normalizeRole(role);
    if (!roleNorm) throw new Error("Role is required");

    const [contact, lender] = await Promise.all([
      ctx.db.get(contactId),
      ctx.db.get(lenderId),
    ]);
    if (!contact) throw new Error("Contact not found");
    if (!lender) throw new Error("Lender not found");
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
    assertContactAndLenderOrgCompatible(contact, lender);

    const now = Date.now();
    const actor = memberUserKey?.trim();
    const resolvedContactRoleId =
      contactRoleId?.trim() ||
      contact.contactRoleId ||
      DEFAULT_CONTACT_ROLE_IDS.lenderRep;

    const existing = await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact_lender", (q) =>
        q.eq("contactId", contactId).eq("lenderId", lenderId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: roleNorm,
        notes: normalizeNotes(notes),
        contactRoleId: resolvedContactRoleId,
        updatedAt: now,
      });
      await insertContactActivity(ctx, {
        contactId,
        kind: "system",
        summary: `Lender link updated: ${lender.company?.trim() || "Lender"} (${roleNorm})`,
        actorUserKey: actor,
        relatedLenderId: lenderId,
        at: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("contactLenderLinks", {
      contactId,
      lenderId,
      role: roleNorm,
      notes: normalizeNotes(notes),
      contactRoleId: resolvedContactRoleId,
      createdAt: now,
      updatedAt: now,
    });

    await insertContactActivity(ctx, {
      contactId,
      kind: "lender_linked",
      summary: `Linked to lender: ${lender.company?.trim() || "Lender"}`,
      detail: `Role: ${roleNorm} · CRM role: ${resolvedContactRoleId}`,
      actorUserKey: actor,
      relatedLenderId: lenderId,
      at: now,
    });

    return id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("contactLenderLinks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Link not found");
    const [contact, lender] = await Promise.all([
      ctx.db.get(row.contactId),
      ctx.db.get(row.lenderId),
    ]);
    if (!contact || !lender) throw new Error("Contact or lender not found");
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
    const now = Date.now();
    const actor = memberUserKey?.trim();
    await insertContactActivity(ctx, {
      contactId: row.contactId,
      kind: "lender_unlinked",
      summary: `Unlinked lender: ${lender.company?.trim() || "Lender"}`,
      actorUserKey: actor,
      relatedLenderId: row.lenderId,
      at: now,
    });
    await ctx.db.delete(id);
  },
});

export const removeByContactAndLender = mutation({
  args: {
    contactId: v.id("contacts"),
    lenderId: v.id("lenders"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { contactId, lenderId, memberUserKey }) => {
    const [contact, lender] = await Promise.all([
      ctx.db.get(contactId),
      ctx.db.get(lenderId),
    ]);
    if (!contact || !lender) return null;
    await assertCanMutateContactRow(ctx, contact, memberUserKey);
    const existing = await ctx.db
      .query("contactLenderLinks")
      .withIndex("by_contact_lender", (q) =>
        q.eq("contactId", contactId).eq("lenderId", lenderId),
      )
      .first();
    if (!existing) return null;
    const now = Date.now();
    const actor = memberUserKey?.trim();
    await insertContactActivity(ctx, {
      contactId,
      kind: "lender_unlinked",
      summary: `Unlinked lender: ${lender.company?.trim() || "Lender"}`,
      actorUserKey: actor,
      relatedLenderId: lenderId,
      at: now,
    });
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
