/**
 * Hierarchy create — strict lookup-before-insert for clients/contacts.
 * Prevents duplicate registry clients when the same contact or normalized
 * name already exists in the organization.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import { findClientForOrg } from "./entityCanonicalization";
import { ownerFieldsForInsert } from "./resourceAccess";

export type ResolveClientForHierarchyArgs = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  clientDisplayName: string;
  /** When set, bind/reuse the client whose primary contact is this person. */
  primaryContactId?: Id<"contacts">;
  /** Explicit client reuse (entity party or pre-resolved client). */
  existingClientId?: Id<"clients">;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  companyName?: string;
};

async function findClientByPrimaryContact(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  contactId: Id<"contacts">,
): Promise<Doc<"clients"> | null> {
  const rows = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  return (
    rows.find(
      (c) =>
        c.primaryContactId != null &&
        String(c.primaryContactId) === String(contactId),
    ) ?? null
  );
}

async function findClientByNormalizedName(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  displayName: string,
): Promise<Doc<"clients"> | null> {
  const key = normalizeHierarchyName(displayName);
  if (!key) return null;
  return await ctx.db
    .query("clients")
    .withIndex("by_org_normalized", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", key),
    )
    .first();
}

/**
 * Resolve an existing client or create one when no match exists.
 * Never duplicates when primaryContactId or normalized name matches.
 */
export async function resolveOrCreateClientForHierarchy(
  ctx: MutationCtx,
  args: ResolveClientForHierarchyArgs,
): Promise<Id<"clients">> {
  const displayName = args.clientDisplayName.trim();
  if (!displayName) throw new Error("Client display name is required.");

  if (args.existingClientId) {
    const existing = await ctx.db.get(args.existingClientId);
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Client not found.");
    }
    return existing._id;
  }

  if (args.primaryContactId) {
    const byContact = await findClientByPrimaryContact(
      ctx,
      args.organizationId,
      args.primaryContactId,
    );
    if (byContact) {
      const now = Date.now();
      const patch: Partial<Doc<"clients">> = { updatedAt: now };
      if (args.primaryContactName?.trim()) {
        patch.primaryContactName = args.primaryContactName.trim();
      }
      if (args.primaryContactEmail?.trim()) {
        patch.primaryContactEmail = args.primaryContactEmail.trim();
      }
      if (args.primaryContactPhone?.trim()) {
        patch.primaryContactPhone = args.primaryContactPhone.trim();
      }
      if (Object.keys(patch).length > 1) {
        await ctx.db.patch(byContact._id, patch);
      }
      return byContact._id;
    }
  }

  const byName = await findClientByNormalizedName(
    ctx,
    args.organizationId,
    displayName,
  );
  if (byName) {
    if (args.primaryContactId && !byName.primaryContactId) {
      await ctx.db.patch(byName._id, {
        primaryContactId: args.primaryContactId,
        ...(args.primaryContactName?.trim()
          ? { primaryContactName: args.primaryContactName.trim() }
          : {}),
        ...(args.primaryContactEmail?.trim()
          ? { primaryContactEmail: args.primaryContactEmail.trim() }
          : {}),
        ...(args.primaryContactPhone?.trim()
          ? { primaryContactPhone: args.primaryContactPhone.trim() }
          : {}),
        updatedAt: Date.now(),
      });
    }
    return byName._id;
  }

  const now = Date.now();
  return await ctx.db.insert("clients", {
    organizationId: args.organizationId,
    displayName,
    normalizedName: normalizeHierarchyName(displayName),
    primaryContactId: args.primaryContactId,
    primaryContactName: args.primaryContactName?.trim() || undefined,
    primaryContactEmail: args.primaryContactEmail?.trim() || undefined,
    primaryContactPhone: args.primaryContactPhone?.trim() || undefined,
    companyName: args.companyName?.trim() || undefined,
    inheritOrgSharingDefaults: undefined,
    ...ownerFieldsForInsert(args.memberUserKey),
    createdAt: now,
    updatedAt: now,
  });
}

/** Entity ingest — find-or-create via EIN / normalized legal name. */
export async function resolveOrCreateEntityClientForHierarchy(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    legalName: string;
    ein?: string;
    dba?: string;
    primaryContactId?: Id<"contacts">;
  },
): Promise<Id<"clients">> {
  const legalName = args.legalName.trim();
  if (!legalName) throw new Error("Entity name is required.");

  const existing = await findClientForOrg(
    ctx,
    args.organizationId,
    legalName,
    args.ein,
  );
  if (existing) return existing._id;

  return await resolveOrCreateClientForHierarchy(ctx, {
    organizationId: args.organizationId,
    memberUserKey: args.memberUserKey,
    clientDisplayName: legalName,
    companyName: args.dba?.trim() || legalName,
    primaryContactId: args.primaryContactId,
  });
}
