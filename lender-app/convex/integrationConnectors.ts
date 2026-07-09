import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission } from "./organizationAccess";
import { assertOrgPlanFeature } from "./organizationPlan";
import { sha256Hex, randomHexSync } from "./integrationCrypto";
import {
  CONNECTOR_CATALOG,
  type IntegrationCategory,
  isKnownProvider,
} from "../lib/integrations/catalog";

const categoryV = v.union(
  v.literal("crm"),
  v.literal("email"),
  v.literal("messaging"),
);

export const getConnectorByPublicId = internalQuery({
  args: { publicId: v.string() },
  handler: async (ctx, { publicId }) => {
    const row = await ctx.db
      .query("integrationConnectors")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId.toLowerCase()))
      .first();
    return row ?? null;
  },
});

export const getConnectorInternal = internalQuery({
  args: { connectorId: v.id("integrationConnectors") },
  handler: async (ctx, { connectorId }) => ctx.db.get(connectorId),
});

export const getConnectorCatalog = query({
  args: {},
  handler: async () => CONNECTOR_CATALOG,
});

export const listConnectors = query({
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
      .query("integrationConnectors")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    return rows
      .map((r) => ({
        id: r._id,
        publicId: r.publicId,
        name: r.name,
        category: r.category,
        providerKey: r.providerKey,
        status: r.status,
        webhookPath: `/api/v1/integrations/webhook?connector=${r.publicId}`,
        inboundVerificationEnabled: r.inboundVerifyHash != null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createConnector = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    name: v.string(),
    category: categoryV,
    providerKey: v.string(),
    config: v.optional(v.any()),
    /** When true, generates a one-time inbound token (same shape as API secrets). */
    enableInboundToken: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const cat = args.category as IntegrationCategory;
    const pk = args.providerKey.trim();
    if (!isKnownProvider(cat, pk)) {
      throw new Error(`Unknown provider "${pk}" for category ${cat}.`);
    }
    const label = args.name.trim();
    if (!label) throw new Error("Name is required.");

    await assertOrgPlanFeature(ctx, args.organizationId, "integrations");

    const publicId = randomHexSync(8);
    const now = Date.now();

    let inboundVerifySalt: string | undefined;
    let inboundVerifyHash: string | undefined;
    let inboundTokenPlain: string | undefined;
    if (args.enableInboundToken) {
      inboundTokenPlain = randomHexSync(32);
      inboundVerifySalt = randomHexSync(32);
      inboundVerifyHash = await sha256Hex(
        `${inboundVerifySalt}:${inboundTokenPlain}`,
      );
    }

    const id = await ctx.db.insert("integrationConnectors", {
      publicId,
      organizationId: args.organizationId,
      name: label,
      category: args.category,
      providerKey: pk,
      status: "active",
      config: args.config,
      inboundVerifySalt,
      inboundVerifyHash,
      createdByUserKey: (args.memberUserKey ?? "").trim(),
      createdAt: now,
      updatedAt: now,
    });

    return {
      connectorId: id,
      publicId,
      webhookPath: `/api/v1/integrations/webhook?connector=${publicId}`,
      inboundToken: inboundTokenPlain,
    };
  },
});

export const setConnectorStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    connectorId: v.id("integrationConnectors"),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.connectorId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Connector not found.");
    }
    await ctx.db.patch(args.connectorId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Replace inbound verification secret; returns plaintext once. */
export const rotateInboundToken = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    connectorId: v.id("integrationConnectors"),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.connectorId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Connector not found.");
    }
    const inboundTokenPlain = randomHexSync(32);
    const inboundVerifySalt = randomHexSync(32);
    const inboundVerifyHash = await sha256Hex(
      `${inboundVerifySalt}:${inboundTokenPlain}`,
    );
    await ctx.db.patch(args.connectorId, {
      inboundVerifySalt,
      inboundVerifyHash,
      updatedAt: Date.now(),
    });
    return { inboundToken: inboundTokenPlain };
  },
});
