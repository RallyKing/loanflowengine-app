/**
 * Phase 55.4 — client-tier entity + additional contact link helpers.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  compareClientLinks,
  type ClientRelationshipType,
  type LinkedClientSummary,
} from "../lib/pipelineClientRelationships";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";
import { contactRoleDisplayName } from "../lib/contact/contactRoles";
import { readContactRolesForOrg } from "./organizationSettings";

export type ClientAdditionalContactSummary = {
  linkId: Id<"clientContactLinks">;
  contactId: Id<"contacts">;
  name: string;
  email?: string;
  phone?: string;
  contactRoleId?: string;
  role: string;
  notes?: string;
  sortOrder: number;
};

export async function findClientEntityLink(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
  linkedClientId: Id<"clients">,
): Promise<Doc<"clientEntityLinks"> | null> {
  return (
    (await ctx.db
      .query("clientEntityLinks")
      .withIndex("by_client_linked", (q) =>
        q.eq("clientId", clientId).eq("linkedClientId", linkedClientId),
      )
      .first()) ?? null
  );
}

export async function listClientEntityLinks(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
): Promise<Doc<"clientEntityLinks">[]> {
  return await ctx.db
    .query("clientEntityLinks")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
}

export async function resolveClientEntityLinks(
  ctx: QueryCtx | MutationCtx,
  client: Doc<"clients">,
): Promise<LinkedClientSummary[]> {
  const links = await listClientEntityLinks(ctx, client._id);
  const summaries: LinkedClientSummary[] = [];
  for (const link of links) {
    const linked = await ctx.db.get(link.linkedClientId);
    if (!linked) continue;
    summaries.push({
      clientId: String(linked._id),
      displayName: linked.displayName,
      normalizedName: linked.normalizedName,
      relationshipType: link.relationshipType as ClientRelationshipType,
      sortOrder: link.sortOrder,
      isAuthoritativePrimary: false,
    });
  }
  return summaries.sort(compareClientLinks);
}

export async function listClientContactLinks(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
): Promise<Doc<"clientContactLinks">[]> {
  return await ctx.db
    .query("clientContactLinks")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
}

export async function resolveClientAdditionalContacts(
  ctx: QueryCtx | MutationCtx,
  client: Doc<"clients">,
  organizationId: Id<"organizations">,
): Promise<ClientAdditionalContactSummary[]> {
  const links = await listClientContactLinks(ctx, client._id);
  const roles = await readContactRolesForOrg(ctx, organizationId);
  const primaryId = client.primaryContactId
    ? String(client.primaryContactId)
    : null;

  const rows: ClientAdditionalContactSummary[] = [];
  for (const link of links) {
    if (primaryId && String(link.contactId) === primaryId) continue;
    const contact = await ctx.db.get(link.contactId);
    if (!contact) continue;
    const contactRoleId = link.contactRoleId?.trim();
    rows.push({
      linkId: link._id,
      contactId: link.contactId,
      name: contact.name,
      email: primaryContactEmail(contact) || undefined,
      phone: primaryContactPhone(contact) || undefined,
      contactRoleId,
      role:
        link.role.trim() ||
        (contactRoleId
          ? contactRoleDisplayName(roles, contactRoleId) ?? contactRoleId
          : "Contact"),
      notes: link.notes,
      sortOrder: link.sortOrder,
    });
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function nextClientLinkSortOrder(
  links: Array<{ sortOrder: number }>,
): number {
  if (links.length === 0) return 0;
  return Math.max(...links.map((l) => l.sortOrder)) + 1;
}
