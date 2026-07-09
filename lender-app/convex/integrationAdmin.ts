import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission } from "./organizationAccess";
import { assertOrgPlanFeature } from "./organizationPlan";
import { sha256Hex, randomHexSync } from "./integrationCrypto";
import {
  formatApiKey,
  formatOAuthClientId,
} from "./integrationTokenFormat";
import { sanitizeIntegrationScopes } from "./integrationScopes";

function newPublicId16(): string {
  return randomHexSync(8);
}

function newSecretHex64(): string {
  return randomHexSync(32);
}

export const createIntegrationApiKey = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    name: v.string(),
    /** Act-as user for Convex RLS (`memberUserKey` on org queries). */
    actorUserKey: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const scopes = sanitizeIntegrationScopes(args.scopes);
    if (!scopes.length) {
      throw new Error("At least one valid scope is required.");
    }
    const label = args.name.trim();
    if (!label) throw new Error("Name is required.");

    await assertOrgPlanFeature(ctx, args.organizationId, "integrations");

    const actor = args.actorUserKey.trim();
    if (!actor) throw new Error("actorUserKey is required.");

    const publicId = newPublicId16();
    const secretHex = newSecretHex64();
    const salt = newSecretHex64();
    const secretHash = await sha256Hex(`${salt}:${secretHex}`);
    const now = Date.now();

    await ctx.db.insert("integrationApiKeys", {
      publicId,
      secretSalt: salt,
      secretHash,
      organizationId: args.organizationId,
      actorUserKey: actor,
      name: label,
      scopes,
      createdAt: now,
    });

    return {
      publicId,
      apiKey: formatApiKey(publicId, secretHex),
      name: label,
      scopes,
      actorUserKey: actor,
      organizationId: args.organizationId,
    };
  },
});

export const listIntegrationApiKeys = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const rows = await ctx.db
      .query("integrationApiKeys")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    return rows
      .map((r) => ({
        publicId: r.publicId,
        name: r.name,
        scopes: r.scopes,
        actorUserKey: r.actorUserKey,
        createdAt: r.createdAt,
        revokedAt: r.revokedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revokeIntegrationApiKey = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    publicId: v.string(),
  },
  handler: async (ctx, { organizationId, memberUserKey, publicId }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const row = await ctx.db
      .query("integrationApiKeys")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId.trim().toLowerCase()))
      .first();
    if (!row || row.organizationId !== organizationId) {
      throw new Error("API key not found.");
    }
    if (row.revokedAt == null) {
      await ctx.db.patch(row._id, { revokedAt: Date.now() });
    }
    return { ok: true as const };
  },
});

export const createIntegrationOAuthClient = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    name: v.string(),
    actorUserKey: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const scopes = sanitizeIntegrationScopes(args.scopes);
    if (!scopes.length) {
      throw new Error("At least one valid scope is required.");
    }
    const label = args.name.trim();
    if (!label) throw new Error("Name is required.");
    await assertOrgPlanFeature(ctx, args.organizationId, "integrations");
    const actor = args.actorUserKey.trim();
    if (!actor) throw new Error("actorUserKey is required.");

    const publicId = newPublicId16();
    const secretHex = newSecretHex64();
    const salt = newSecretHex64();
    const secretHash = await sha256Hex(`${salt}:${secretHex}`);
    const now = Date.now();

    await ctx.db.insert("integrationOAuthClients", {
      publicId,
      secretSalt: salt,
      secretHash,
      organizationId: args.organizationId,
      actorUserKey: actor,
      name: label,
      scopes,
      createdAt: now,
    });

    return {
      publicId,
      clientId: formatOAuthClientId(publicId),
      clientSecret: secretHex,
      name: label,
      scopes,
      actorUserKey: actor,
      organizationId: args.organizationId,
    };
  },
});

export const listIntegrationOAuthClients = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const rows = await ctx.db
      .query("integrationOAuthClients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    return rows
      .map((r) => ({
        publicId: r.publicId,
        clientId: formatOAuthClientId(r.publicId),
        name: r.name,
        scopes: r.scopes,
        actorUserKey: r.actorUserKey,
        createdAt: r.createdAt,
        revokedAt: r.revokedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revokeIntegrationOAuthClient = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    publicId: v.string(),
  },
  handler: async (ctx, { organizationId, memberUserKey, publicId }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const row = await ctx.db
      .query("integrationOAuthClients")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId.trim().toLowerCase()))
      .first();
    if (!row || row.organizationId !== organizationId) {
      throw new Error("OAuth client not found.");
    }
    const now = Date.now();
    if (row.revokedAt == null) {
      await ctx.db.patch(row._id, { revokedAt: now });
    }
    const tokens = await ctx.db
      .query("integrationAccessTokens")
      .withIndex("by_oauth_client", (q) =>
        q.eq("oauthClientPublicId", row.publicId),
      )
      .collect();
    for (const t of tokens) {
      if (t.revokedAt == null) {
        await ctx.db.patch(t._id, { revokedAt: now });
      }
    }
    return { ok: true as const };
  },
});
