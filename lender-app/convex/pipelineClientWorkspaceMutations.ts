/**
 * Client workspace — project/file display order + client group link mutations.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutateContactRow,
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";
import {
  filterPipelineRowsForMember,
  ownerFieldsForInsert,
  resolveClientAccessLevel,
  resolveProjectAccessLevel,
} from "./resourceAccess";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import {
  findClientEntityLink,
  listClientContactLinks,
  listClientEntityLinks,
  nextClientLinkSortOrder,
  resolveClientEntityLinks,
} from "./pipelineClientGroupLinks";
import {
  DEFAULT_CONTACT_ROLE_IDS,
  contactRoleDisplayName,
} from "../lib/contact/contactRoles";
import { readContactRolesForOrg } from "./organizationSettings";
import { contactMethodsCreateArgs } from "../lib/contact/contactMethods";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const clientEntityRelationshipArg = v.union(
  v.literal("coborrower"),
  v.literal("guarantor"),
  v.literal("entity"),
  v.literal("sponsor"),
  v.literal("partner"),
  v.literal("other"),
);

async function assertClientEdit(
  ctx: MutationCtx,
  client: Doc<"clients">,
  memberUserKey: string,
) {
  const level = await resolveClientAccessLevel(ctx, client, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this client.");
  }
}

async function loadClientInOrg(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  organizationId: Id<"organizations">,
): Promise<Doc<"clients">> {
  const client = await ctx.db.get(clientId);
  if (!client || client.organizationId !== organizationId) {
    throw new Error("Client not found.");
  }
  return client;
}

async function assertReorderProjectIds(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    clientId: Id<"clients">;
    memberUserKey: string;
    orderedProjectIds: Id<"projects">[];
  },
) {
  const clientProjects = await ctx.db
    .query("projects")
    .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
    .collect();

  const visibleIds = new Set<string>();
  for (const project of clientProjects) {
    if (project.organizationId !== args.organizationId) continue;
    const level = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (level !== "none") visibleIds.add(String(project._id));
  }

  const orderedSet = new Set(args.orderedProjectIds.map(String));
  if (orderedSet.size !== args.orderedProjectIds.length) {
    throw new Error("Duplicate project ids in reorder list.");
  }
  for (const id of orderedSet) {
    if (!visibleIds.has(id)) {
      throw new Error("Invalid project in reorder list.");
    }
  }
  if (orderedSet.size !== visibleIds.size) {
    throw new Error("Reorder list must include all visible projects.");
  }
}

async function assertReorderFileIds(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    memberUserKey: string;
    orderedFileIds: Id<"pipeline">[];
  },
) {
  const projectFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
    .collect();

  const scoped = projectFiles.filter(
    (file) =>
      file.organizationId === args.organizationId && file.archivedAt == null,
  );
  const visibleFiles = await filterPipelineRowsForMember(
    ctx,
    scoped,
    args.organizationId,
    args.memberUserKey,
  );
  const visibleIds = new Set(visibleFiles.map((file) => String(file._id)));

  const orderedSet = new Set(args.orderedFileIds.map(String));
  if (orderedSet.size !== args.orderedFileIds.length) {
    throw new Error("Duplicate file ids in reorder list.");
  }
  for (const id of orderedSet) {
    if (!visibleIds.has(id)) {
      throw new Error("Invalid file in reorder list.");
    }
  }
  if (orderedSet.size !== visibleIds.size) {
    throw new Error("Reorder list must include all visible files.");
  }
}

export const reorderClientProjects = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    orderedProjectIds: v.array(v.id("projects")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      throw new Error("Client not found.");
    }

    const clientLevel = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (clientLevel !== "edit") {
      throw new Error(
        "You do not have permission to reorder projects for this client.",
      );
    }

    await assertReorderProjectIds(ctx, args);

    const now = Date.now();
    let order = 0;
    for (const projectId of args.orderedProjectIds) {
      await ctx.db.patch(projectId, {
        workspaceSortOrder: order++,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

export const reorderProjectFiles = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    orderedFileIds: v.array(v.id("pipeline")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }

    const projectLevel = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (projectLevel !== "edit") {
      throw new Error(
        "You do not have permission to reorder files in this project.",
      );
    }

    await assertReorderFileIds(ctx, args);

    const now = Date.now();
    let order = 0;
    return { ok: true as const };
  },
});

export const getClientEntityEditor = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }
    const accessLevel = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (accessLevel === "none") return null;
    return {
      clientId: String(client._id),
      accessLevel,
      canEdit: accessLevel === "edit",
      linkedClients: await resolveClientEntityLinks(ctx, client),
    };
  },
});

export const addClientEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    linkedClientId: v.id("clients"),
    relationshipType: v.optional(clientEntityRelationshipArg),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    if (String(args.clientId) === String(args.linkedClientId)) {
      throw new Error("A client cannot be linked to itself.");
    }

    const linked = await ctx.db.get(args.linkedClientId);
    if (!linked || linked.organizationId !== args.organizationId) {
      throw new Error("Linked entity not found.");
    }

    const existing = await findClientEntityLink(
      ctx,
      args.clientId,
      args.linkedClientId,
    );
    if (existing) {
      throw new Error("This entity is already linked to the client.");
    }

    const links = await listClientEntityLinks(ctx, args.clientId);
    const now = Date.now();
    await ctx.db.insert("clientEntityLinks", {
      organizationId: args.organizationId,
      clientId: args.clientId,
      linkedClientId: args.linkedClientId,
      relationshipType: args.relationshipType ?? "entity",
      sortOrder: nextClientLinkSortOrder(links),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const removeClientEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    linkedClientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    const link = await findClientEntityLink(
      ctx,
      args.clientId,
      args.linkedClientId,
    );
    if (!link) throw new Error("Entity link not found.");
    await ctx.db.delete(link._id);
    return { ok: true as const };
  },
});

export const updateClientEntityLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    linkedClientId: v.id("clients"),
    relationshipType: clientEntityRelationshipArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    const link = await findClientEntityLink(
      ctx,
      args.clientId,
      args.linkedClientId,
    );
    if (!link) throw new Error("Entity link not found.");
    await ctx.db.patch(link._id, {
      relationshipType: args.relationshipType,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const addClientContact = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    contactId: v.id("contacts"),
    contactRoleId: v.optional(v.string()),
    notes: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    if (
      client.primaryContactId &&
      String(client.primaryContactId) === String(args.contactId)
    ) {
      throw new Error(
        "Primary contact is managed in the client header — pick a different contact.",
      );
    }

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found.");
    await assertCanMutateContactRow(ctx, contact, args.memberUserKey);

    const existing = await ctx.db
      .query("clientContactLinks")
      .withIndex("by_client_contact", (q) =>
        q.eq("clientId", args.clientId).eq("contactId", args.contactId),
      )
      .first();
    if (existing) throw new Error("Contact is already linked to this client.");

    const roles = await readContactRolesForOrg(ctx, args.organizationId);
    const contactRoleId =
      args.contactRoleId?.trim() || DEFAULT_CONTACT_ROLE_IDS.client;
    const role =
      contactRoleDisplayName(roles, contactRoleId) ?? contactRoleId;

    const links = await listClientContactLinks(ctx, args.clientId);
    const now = Date.now();
    const linkId = await ctx.db.insert("clientContactLinks", {
      organizationId: args.organizationId,
      clientId: args.clientId,
      contactId: args.contactId,
      role,
      contactRoleId,
      notes: args.notes?.trim() || undefined,
      sortOrder: nextClientLinkSortOrder(links),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, linkId };
  },
});

export const removeClientContact = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    linkId: v.id("clientContactLinks"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    const link = await ctx.db.get(args.linkId);
    if (!link || link.clientId !== args.clientId) {
      throw new Error("Contact link not found.");
    }
    await ctx.db.delete(args.linkId);
    return { ok: true as const };
  },
});

export const createClientEntityAndLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    displayName: v.string(),
    relationshipType: v.optional(clientEntityRelationshipArg),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    const displayName = args.displayName.trim();
    if (!displayName) throw new Error("Entity name is required.");

    const now = Date.now();
    const linkedClientId = await ctx.db.insert("clients", {
      organizationId: args.organizationId,
      displayName,
      normalizedName: normalizeHierarchyName(displayName),
      ...ownerFieldsForInsert(args.memberUserKey),
      createdAt: now,
      updatedAt: now,
    });

    const links = await listClientEntityLinks(ctx, args.clientId);
    await ctx.db.insert("clientEntityLinks", {
      organizationId: args.organizationId,
      clientId: args.clientId,
      linkedClientId,
      relationshipType: args.relationshipType ?? "entity",
      sortOrder: nextClientLinkSortOrder(links),
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const, linkedClientId };
  },
});

export const createClientContactAndLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    contactRoleId: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertClientEdit(ctx, client, args.memberUserKey);

    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.manage",
    );

    const name = args.name.trim();
    if (!name) throw new Error("Contact name is required.");

    const methods = contactMethodsCreateArgs({
      email: args.email,
      phone: args.phone,
    });
    const roles = await readContactRolesForOrg(ctx, args.organizationId);
    const contactRoleId =
      args.contactRoleId?.trim() || DEFAULT_CONTACT_ROLE_IDS.client;
    const role =
      contactRoleDisplayName(roles, contactRoleId) ?? contactRoleId;

    const now = Date.now();
    const contactId = await ctx.db.insert("contacts", {
      name,
      email: methods.emails?.[0]?.email ?? "",
      phone: methods.phones?.[0]?.number ?? "",
      emails: methods.emails,
      phones: methods.phones,
      notes: args.notes?.trim() ?? "",
      contactRoleIds: [contactRoleId],
      contactRoleId,
      organizationId: args.organizationId,
      createdAt: now,
      updatedAt: now,
    });

    const links = await listClientContactLinks(ctx, args.clientId);
    const linkId = await ctx.db.insert("clientContactLinks", {
      organizationId: args.organizationId,
      clientId: args.clientId,
      contactId,
      role,
      contactRoleId,
      notes: undefined,
      sortOrder: nextClientLinkSortOrder(links),
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const, contactId, linkId };
  },
});
