/**
 * Phase CRM-1 — unified name search for contact hub ingestion / duplicate prevention.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanReadContactRow,
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";
import { resolveClientAccessLevel } from "./resourceAccess";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const searchKindV = v.union(
  v.literal("entity"),
  v.literal("individual"),
  v.literal("both"),
);

export type CrmIngestionSearchKind = "entity" | "individual" | "both";

export type CrmIngestionEntityHit = {
  kind: "entity";
  entityId: Id<"clients">;
  displayName: string;
  companyName?: string;
  primaryContactName?: string;
};

export type CrmIngestionIndividualHit = {
  kind: "individual";
  contactId: Id<"contacts">;
  name: string;
  email?: string;
  companyName?: string;
};

function tokenMatches(haystacks: string[], needle: string): boolean {
  const tokens = needle.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const blob = haystacks.join(" ").toLowerCase();
  return tokens.every((t) => blob.includes(t));
}

/**
 * Search business entities (`clients`) and/or individuals (`contacts`) by name.
 * Used by UniversalContactModal duplicate prevention.
 */
export const searchIngestionByName = query({
  args: {
    organizationId: v.id("organizations"),
    query: v.string(),
    kind: searchKindV,
    limit: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.view",
    );

    const needle = args.query.trim();
    const cap = Math.min(Math.max(args.limit ?? 8, 1), 20);
    const entities: CrmIngestionEntityHit[] = [];
    const individuals: CrmIngestionIndividualHit[] = [];

    if (!needle) {
      return { entities, individuals };
    }

    if (args.kind === "entity" || args.kind === "both") {
      const clientRows = await ctx.db
        .query("clients")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .collect();
      for (const client of clientRows) {
        if (entities.length >= cap) break;
        const level = await resolveClientAccessLevel(
          ctx,
          client,
          args.memberUserKey,
        );
        if (level === "none") continue;
        const haystacks = [
          client.displayName,
          client.normalizedName,
          client.companyName ?? "",
          client.primaryContactName ?? "",
        ];
        if (!tokenMatches(haystacks, needle)) continue;
        entities.push({
          kind: "entity",
          entityId: client._id,
          displayName: client.displayName.trim() || "Unnamed entity",
          ...(client.companyName?.trim()
            ? { companyName: client.companyName.trim() }
            : {}),
          ...(client.primaryContactName?.trim()
            ? { primaryContactName: client.primaryContactName.trim() }
            : {}),
        });
      }
      entities.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    if (args.kind === "individual" || args.kind === "both") {
      const contactRows = await ctx.db
        .query("contacts")
        .withIndex("by_organization_updatedAt", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .collect();
      for (const contact of contactRows) {
        if (individuals.length >= cap) break;
        try {
          await assertCanReadContactRow(ctx, contact, args.memberUserKey);
        } catch {
          continue;
        }
        const haystacks = [
          contact.name,
          contact.companyName ?? "",
          contact.email ?? "",
        ];
        if (!tokenMatches(haystacks, needle)) continue;
        individuals.push({
          kind: "individual",
          contactId: contact._id,
          name: contact.name.trim() || "Unnamed contact",
          ...(contact.email?.trim() ? { email: contact.email.trim() } : {}),
          ...(contact.companyName?.trim()
            ? { companyName: contact.companyName.trim() }
            : {}),
        });
      }
      individuals.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      entities: entities.slice(0, cap),
      individuals: individuals.slice(0, cap),
    };
  },
});
