/**
 * Org-scoped AI API providers (Settings → AI API keys).
 * Secrets are sealed with portalFieldCrypto; list/get never return the full key.
 */
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission, resolveMemberUserKey } from "./organizationAccess";
import {
  isPortalFieldEncryptionConfigured,
  openOptionalPortalCiphertext,
  sealOptionalPortalPlaintext,
} from "./portalFieldCrypto";
import {
  ORG_AI_DEFAULT_MODELS,
  maskAiApiKeyLast4,
  normalizeOrgAiBaseUrl,
  validateOrgAiProviderUpsert,
  type OrgAiProviderKind,
} from "../lib/ai/orgAiProviders";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const providerKindV = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("google"),
  v.literal("custom"),
);

const providerPublicV = v.object({
  _id: v.id("orgAiProviders"),
  name: v.string(),
  kind: providerKindV,
  model: v.string(),
  baseUrl: v.optional(v.string()),
  apiKeyLast4: v.string(),
  hasApiKey: v.boolean(),
  enabled: v.boolean(),
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastTestedAt: v.optional(v.number()),
  lastTestOk: v.optional(v.boolean()),
  lastTestError: v.optional(v.string()),
  encryptionConfigured: v.boolean(),
});

function toPublic(row: Doc<"orgAiProviders">) {
  return {
    _id: row._id,
    name: row.name,
    kind: row.kind,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKeyLast4: row.apiKeyLast4,
    hasApiKey: Boolean(row.apiKeyLast4 || row.apiKeyEnc),
    enabled: row.enabled,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
    encryptionConfigured: isPortalFieldEncryptionConfigured(),
  };
}

async function assertSettingsAccess(
  ctx: Parameters<typeof assertOrgPermission>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
) {
  await assertOrgPermission(
    ctx,
    organizationId,
    memberUserKey,
    "settings.access",
  );
  return resolveMemberUserKey(ctx, memberUserKey);
}

async function listOrgProviders(
  ctx: { db: QueryCtx["db"] },
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("orgAiProviders")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
}

async function clearDefaultFlags(
  ctx: { db: MutationCtx["db"] },
  organizationId: Id<"organizations">,
  exceptId?: Id<"orgAiProviders">,
) {
  const rows = await ctx.db
    .query("orgAiProviders")
    .withIndex("by_organization_default", (q) =>
      q.eq("organizationId", organizationId).eq("isDefault", true),
    )
    .collect();
  for (const row of rows) {
    if (exceptId && row._id === exceptId) continue;
    if (row.isDefault) {
      await ctx.db.patch(row._id, { isDefault: false });
    }
  }
}

export const listProviders = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  returns: v.array(providerPublicV),
  handler: async (ctx, args) => {
    try {
      await assertSettingsAccess(
        ctx,
        args.organizationId,
        args.memberUserKey,
      );
    } catch (err) {
      console.warn("[orgAiProviders.listProviders] denied", {
        organizationId: String(args.organizationId),
        reason: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
    const rows = await listOrgProviders(ctx, args.organizationId);
    return rows
      .map(toPublic)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt - a.updatedAt);
  },
});

/** Vault / due diligence picker — enabled providers only; still no secrets. */
export const listEnabledProviders = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  returns: v.array(providerPublicV),
  handler: async (ctx, args) => {
    try {
      await assertOrgPermission(
        ctx,
        args.organizationId,
        args.memberUserKey,
        "files.edit",
      );
    } catch {
      return [];
    }
    const rows = await listOrgProviders(ctx, args.organizationId);
    return rows
      .filter((r) => r.enabled)
      .map(toPublic)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt - a.updatedAt);
  },
});

export const upsertProvider = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.optional(v.id("orgAiProviders")),
    name: v.string(),
    kind: providerKindV,
    model: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  returns: v.object({
    providerId: v.id("orgAiProviders"),
    apiKeyLast4: v.string(),
  }),
  handler: async (ctx, args) => {
    const actor = await assertSettingsAccess(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const existing = args.providerId
      ? await ctx.db.get(args.providerId)
      : null;
    if (existing && existing.organizationId !== args.organizationId) {
      throw new Error("Provider belongs to a different organization.");
    }

    const requireApiKey = !existing;
    const errors = validateOrgAiProviderUpsert(
      {
        name: args.name,
        kind: args.kind,
        model: args.model,
        baseUrl: args.baseUrl,
        apiKey: args.apiKey,
        enabled: args.enabled,
        isDefault: args.isDefault,
      },
      { requireApiKey },
    );
    if (errors.length > 0) {
      throw new Error(errors[0]!.message);
    }

    const name = args.name.trim();
    const kind = args.kind as OrgAiProviderKind;
    const model = (args.model?.trim() || ORG_AI_DEFAULT_MODELS[kind]).slice(0, 120);
    const baseUrl = normalizeOrgAiBaseUrl(kind, args.baseUrl);
    const enabled = args.enabled ?? existing?.enabled ?? true;
    const makeDefault = args.isDefault ?? existing?.isDefault ?? false;
    const now = Date.now();

    let apiKeyEnc = existing?.apiKeyEnc ?? "";
    let apiKeyLast4 = existing?.apiKeyLast4 ?? "";
    const incomingKey = args.apiKey?.trim();
    if (incomingKey) {
      const sealed = await sealOptionalPortalPlaintext(incomingKey);
      if (!sealed) throw new Error("API key could not be stored.");
      apiKeyEnc = sealed;
      apiKeyLast4 = maskAiApiKeyLast4(incomingKey);
    }
    if (!apiKeyEnc) {
      throw new Error("API key is required.");
    }

    if (existing) {
      if (makeDefault) {
        await clearDefaultFlags(ctx, args.organizationId, existing._id);
      }
      await ctx.db.patch(existing._id, {
        name,
        kind,
        model,
        baseUrl,
        apiKeyEnc,
        apiKeyLast4,
        enabled,
        isDefault: makeDefault,
        updatedByUserKey: actor,
        updatedAt: now,
      });
      return { providerId: existing._id, apiKeyLast4 };
    }

    if (makeDefault) {
      await clearDefaultFlags(ctx, args.organizationId);
    }
    const providerId = await ctx.db.insert("orgAiProviders", {
      organizationId: args.organizationId,
      name,
      kind,
      model,
      baseUrl,
      apiKeyEnc,
      apiKeyLast4,
      enabled,
      isDefault: makeDefault,
      createdByUserKey: actor,
      updatedByUserKey: actor,
      createdAt: now,
      updatedAt: now,
    });
    return { providerId, apiKeyLast4 };
  },
});

export const setProviderEnabled = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("orgAiProviders"),
    enabled: v.boolean(),
    ...memberKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertSettingsAccess(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.providerId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Provider not found.");
    }
    await ctx.db.patch(args.providerId, {
      enabled: args.enabled,
      updatedAt: Date.now(),
      ...(args.enabled ? {} : { isDefault: false }),
    });
    return { ok: true as const };
  },
});

export const setDefaultProvider = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("orgAiProviders"),
    ...memberKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertSettingsAccess(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.providerId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Provider not found.");
    }
    if (!row.enabled) {
      throw new Error("Enable the provider before marking it default.");
    }
    await clearDefaultFlags(ctx, args.organizationId, args.providerId);
    await ctx.db.patch(args.providerId, {
      isDefault: true,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const deleteProvider = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("orgAiProviders"),
    ...memberKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertSettingsAccess(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.providerId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Provider not found.");
    }
    await ctx.db.delete(args.providerId);
    return { ok: true as const };
  },
});

export const recordTestResult = internalMutation({
  args: {
    providerId: v.id("orgAiProviders"),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.providerId);
    if (!row) return null;
    await ctx.db.patch(args.providerId, {
      lastTestedAt: Date.now(),
      lastTestOk: args.ok,
      lastTestError: args.ok ? undefined : (args.error ?? "Test failed").slice(0, 280),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Internal only — decrypts the key for Convex actions. Never expose publicly. */
export const internalGetDecryptedProvider = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.optional(v.id("orgAiProviders")),
    preferDefault: v.optional(v.boolean()),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("orgAiProviders"),
      organizationId: v.id("organizations"),
      name: v.string(),
      kind: providerKindV,
      model: v.string(),
      baseUrl: v.optional(v.string()),
      apiKey: v.string(),
      enabled: v.boolean(),
      isDefault: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    let row: Doc<"orgAiProviders"> | null = null;
    if (args.providerId) {
      row = await ctx.db.get(args.providerId);
    } else if (args.preferDefault) {
      row =
        (await ctx.db
          .query("orgAiProviders")
          .withIndex("by_organization_default", (q) =>
            q.eq("organizationId", args.organizationId).eq("isDefault", true),
          )
          .first()) ??
        (await ctx.db
          .query("orgAiProviders")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .collect()).find((r) => r.enabled) ??
        null;
    }
    if (!row || row.organizationId !== args.organizationId) return null;
    if (!row.enabled) return null;
    const apiKey = (await openOptionalPortalCiphertext(row.apiKeyEnc))?.trim();
    if (!apiKey || apiKey === "[encrypted]") return null;
    return {
      _id: row._id,
      organizationId: row.organizationId,
      name: row.name,
      kind: row.kind,
      model: row.model,
      baseUrl: row.baseUrl,
      apiKey,
      enabled: row.enabled,
      isDefault: row.isDefault,
    };
  },
});
