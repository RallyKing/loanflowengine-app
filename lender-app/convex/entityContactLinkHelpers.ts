/**
 * Shared entity ↔ contact junction writes (ingestion, conversion, cap table).
 */
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  coerceRegistryRoleId,
  type RegistryRoleId,
} from "../lib/registry/universalRoles";
import {
  entityContactRelationshipRoleV,
  type EntityContactRelationshipRole,
} from "./crmLinkValidators";
import { registryRoleIdV } from "./registryRoleValidators";

export { entityContactRelationshipRoleV, registryRoleIdV };

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

/** Map registry role → legacy entityContactLinks.relationshipRole (required field). */
export function legacyRelationshipRoleFromRegistry(
  registryRoleId: RegistryRoleId,
): EntityContactRelationshipRole {
  switch (registryRoleId) {
    case "deal_partner":
      return "deal_partner";
    case "referral_partner":
      return "referral_partner";
    case "lender_rep":
    case "account_executive":
      return "lender_rep";
    case "borrower":
    case "primary_borrower":
    case "coborrower":
    case "authorized_signer":
    case "key_principal":
      return "borrower";
    case "guarantor":
      return "guarantor";
    case "client":
      return "client";
    default:
      return "other";
  }
}

export type InsertEntityContactLinkArgs = {
  organizationId: Id<"organizations">;
  entityId: Id<"clients">;
  contactId: Id<"contacts">;
  position: string;
  registryRoleId: RegistryRoleId;
  ownershipPercentage?: number;
  sortOrder?: number;
};

/**
 * Idempotent when the same entity+contact pair already exists — returns existing id.
 */
export async function upsertEntityContactLink(
  ctx: MutationCtx,
  args: InsertEntityContactLinkArgs,
): Promise<Id<"entityContactLinks">> {
  const position = normalizePosition(args.position);
  if (!position) throw new Error("Position is required for each association.");

  const registryRoleId = coerceRegistryRoleId(args.registryRoleId);
  const relationshipRole = legacyRelationshipRoleFromRegistry(registryRoleId);

  const existing = await ctx.db
    .query("entityContactLinks")
    .withIndex("by_entity_contact", (q) =>
      q.eq("entityId", args.entityId).eq("contactId", args.contactId),
    )
    .first();

  const ownershipPercentage = normalizeOwnershipPercentage(
    args.ownershipPercentage,
  );
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      position,
      relationshipRole,
      registryRoleId,
      ...(ownershipPercentage !== undefined ? { ownershipPercentage } : {}),
      updatedAt: now,
    });
    return existing._id;
  }

  let sortOrder = args.sortOrder;
  if (sortOrder === undefined) {
    const siblingLinks = await ctx.db
      .query("entityContactLinks")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .collect();
    sortOrder =
      siblingLinks.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) +
      1;
  }

  return await ctx.db.insert("entityContactLinks", {
    organizationId: args.organizationId,
    entityId: args.entityId,
    contactId: args.contactId,
    position,
    relationshipRole,
    registryRoleId,
    ...(ownershipPercentage !== undefined ? { ownershipPercentage } : {}),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
}

/** Read effective registry role from a junction row (new field or legacy fallback). */
export function effectiveRegistryRoleFromEntityLink(
  link: Pick<
    Doc<"entityContactLinks">,
    "registryRoleId" | "relationshipRole"
  >,
): RegistryRoleId {
  if (link.registryRoleId) {
    return coerceRegistryRoleId(link.registryRoleId);
  }
  return coerceRegistryRoleId(link.relationshipRole);
}
