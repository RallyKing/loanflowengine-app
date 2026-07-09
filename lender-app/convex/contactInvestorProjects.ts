/**
 * Phase Modular-C — investor track record rows for the `investorExperience`
 * pipeline block. Contact-scoped sticky data: the project history travels
 * across files with the borrower like REO / PFS rows.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  assertCanMutateContactRow,
  assertCanReadContactRow,
} from "./organizationAccess";

const projectPatchFields = {
  address: v.optional(v.string()),
  projectType: v.optional(v.string()),
  role: v.optional(v.string()),
  purchaseAmount: v.optional(v.string()),
  purchaseDate: v.optional(v.string()),
  saleAmount: v.optional(v.string()),
  saleDate: v.optional(v.string()),
  outcome: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const listByContact = query({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await assertCanReadContactRow(ctx, contact, args.memberUserKey);
    const rows = await ctx.db
      .query("contactInvestorProjects")
      .withIndex("by_contact_sort", (q) => q.eq("contactId", args.contactId))
      .collect();
    if (args.includeArchived) return rows;
    return rows.filter((r) => r.archivedAt == null);
  },
});

export const upsertProject = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
    projectId: v.optional(v.id("contactInvestorProjects")),
    ...projectPatchFields,
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const now = Date.now();
    const patch = {
      address: args.address?.trim() || undefined,
      projectType: args.projectType?.trim() || undefined,
      role: args.role?.trim() || undefined,
      purchaseAmount: args.purchaseAmount?.trim() || undefined,
      purchaseDate: args.purchaseDate?.trim() || undefined,
      saleAmount: args.saleAmount?.trim() || undefined,
      saleDate: args.saleDate?.trim() || undefined,
      outcome: args.outcome?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    };

    if (args.projectId) {
      const existing = await ctx.db.get(args.projectId);
      if (!existing || String(existing.contactId) !== String(args.contactId)) {
        throw new Error("Investor project not found for this contact");
      }
      await ctx.db.patch(args.projectId, { ...patch, updatedAt: now });
      return args.projectId;
    }

    const siblings = await ctx.db
      .query("contactInvestorProjects")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    const sortOrder =
      siblings.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    return await ctx.db.insert("contactInvestorProjects", {
      organizationId: contact.organizationId,
      contactId: args.contactId,
      ...patch,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const archiveProject = mutation({
  args: {
    contactId: v.id("contacts"),
    memberUserKey: v.optional(v.string()),
    projectId: v.id("contactInvestorProjects"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);
    const existing = await ctx.db.get(args.projectId);
    if (!existing || String(existing.contactId) !== String(args.contactId)) {
      throw new Error("Investor project not found for this contact");
    }
    const now = Date.now();
    await ctx.db.patch(args.projectId, { archivedAt: now, updatedAt: now });
    return { ok: true as const };
  },
});
