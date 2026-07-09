/**
 * Phase CRM-4 — resolve primary company entity for contacts via entityContactLinks.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { EntityContactRelationshipRole } from "./entityContactLinks";

export type PrimaryEntitySummary = {
  linkId: Id<"entityContactLinks">;
  entityId: Id<"clients">;
  displayName: string;
  position: string;
  relationshipRole: EntityContactRelationshipRole;
};

function pickPrimaryLink(
  links: Doc<"entityContactLinks">[],
): Doc<"entityContactLinks"> | null {
  if (links.length === 0) return null;
  const flagged = links.find((l) => l.isPrimaryCompany === true);
  if (flagged) return flagged;
  return [...links].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.createdAt - b.createdAt,
  )[0];
}

export async function resolvePrimaryEntityForContact(
  ctx: QueryCtx | MutationCtx,
  contactId: Id<"contacts">,
): Promise<PrimaryEntitySummary | null> {
  const links = await ctx.db
    .query("entityContactLinks")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .collect();
  const primaryLink = pickPrimaryLink(links);
  if (!primaryLink) return null;
  const entity = await ctx.db.get(primaryLink.entityId);
  if (!entity) return null;
  return {
    linkId: primaryLink._id,
    entityId: entity._id,
    displayName:
      entity.displayName?.trim() ||
      entity.companyName?.trim() ||
      "Business entity",
    position: primaryLink.position,
    relationshipRole: primaryLink.relationshipRole,
  };
}

export async function batchPrimaryEntitiesForContacts(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | undefined,
  contactIds: Id<"contacts">[],
): Promise<Map<Id<"contacts">, PrimaryEntitySummary>> {
  const out = new Map<Id<"contacts">, PrimaryEntitySummary>();
  if (contactIds.length === 0) return out;

  const contactIdSet = new Set(contactIds.map((id) => String(id)));
  const links = organizationId
    ? await ctx.db
        .query("entityContactLinks")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect()
    : [];

  const linksByContact = new Map<string, Doc<"entityContactLinks">[]>();
  for (const link of links) {
    if (!contactIdSet.has(String(link.contactId))) continue;
    const key = String(link.contactId);
    const bucket = linksByContact.get(key) ?? [];
    bucket.push(link);
    linksByContact.set(key, bucket);
  }

  const entityCache = new Map<string, Doc<"clients"> | null>();
  for (const contactId of contactIds) {
    const primaryLink = pickPrimaryLink(
      linksByContact.get(String(contactId)) ?? [],
    );
    if (!primaryLink) continue;
    let entity = entityCache.get(String(primaryLink.entityId));
    if (entity === undefined) {
      entity = await ctx.db.get(primaryLink.entityId);
      entityCache.set(String(primaryLink.entityId), entity);
    }
    if (!entity) continue;
    out.set(contactId, {
      linkId: primaryLink._id,
      entityId: entity._id,
      displayName:
        entity.displayName?.trim() ||
        entity.companyName?.trim() ||
        "Business entity",
      position: primaryLink.position,
      relationshipRole: primaryLink.relationshipRole,
    });
  }
  return out;
}

export async function primaryEntityDisplayNameForContact(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<string | undefined> {
  const primary = await resolvePrimaryEntityForContact(ctx, contactId);
  return primary?.displayName;
}
