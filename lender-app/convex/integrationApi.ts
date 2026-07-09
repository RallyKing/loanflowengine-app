import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { sha256Hex, randomHexSync } from "./integrationCrypto";
import {
  parseAccessTokenBearer,
  parseApiKeyBearer,
  parseOAuthClientId,
  formatAccessToken,
} from "./integrationTokenFormat";

const authContextValidator = v.union(
  v.object({
    kind: v.literal("api_key"),
    credentialPublicId: v.string(),
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    scopes: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("access_token"),
    credentialPublicId: v.string(),
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    scopes: v.array(v.string()),
  }),
);

function parseRpm(): number {
  const raw = process.env.INTEGRATION_API_RPM?.trim();
  const n = raw ? parseInt(raw, 10) : 120;
  if (!Number.isFinite(n) || n < 1) return 120;
  return Math.min(n, 10_000);
}

/**
 * Resolve `Authorization: Bearer …` to org + actor + scopes, or `null`.
 */
export const resolveIntegrationBearer = internalQuery({
  args: { bearer: v.string() },
  returns: v.union(v.null(), authContextValidator),
  handler: async (ctx, { bearer }) => {
    const trimmed = bearer.trim();
    if (!trimmed) return null;

    const asKey = parseApiKeyBearer(trimmed);
    if (asKey) {
      const row = await ctx.db
        .query("integrationApiKeys")
        .withIndex("by_publicId", (q) => q.eq("publicId", asKey.publicId))
        .first();
      if (!row || row.revokedAt != null) return null;
      const got = await sha256Hex(`${row.secretSalt}:${asKey.secretHex}`);
      if (got !== row.secretHash) return null;
      return {
        kind: "api_key" as const,
        credentialPublicId: row.publicId,
        organizationId: row.organizationId,
        actorUserKey: row.actorUserKey,
        scopes: row.scopes,
      };
    }

    const asTok = parseAccessTokenBearer(trimmed);
    if (asTok) {
      const row = await ctx.db
        .query("integrationAccessTokens")
        .withIndex("by_publicId", (q) => q.eq("publicId", asTok.publicId))
        .first();
      if (!row || row.revokedAt != null) return null;
      if (row.expiresAt <= Date.now()) return null;
      const got = await sha256Hex(`${row.secretSalt}:${asTok.secretHex}`);
      if (got !== row.secretHash) return null;
      return {
        kind: "access_token" as const,
        credentialPublicId: row.publicId,
        organizationId: row.organizationId,
        actorUserKey: row.actorUserKey,
        scopes: row.scopes,
      };
    }

    return null;
  },
});

export const consumeIntegrationRateLimit = internalMutation({
  args: { credentialPublicId: v.string() },
  returns: v.object({
    ok: v.boolean(),
    retryAfterSec: v.optional(v.number()),
  }),
  handler: async (ctx, { credentialPublicId }) => {
    const rpm = parseRpm();
    const windowMinute = Math.floor(Date.now() / 60_000);
    const existing = await ctx.db
      .query("integrationRateLimitBuckets")
      .withIndex("by_cred_window", (q) =>
        q
          .eq("credentialPublicId", credentialPublicId)
          .eq("windowMinute", windowMinute),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("integrationRateLimitBuckets", {
        credentialPublicId,
        windowMinute,
        count: 1,
      });
      return { ok: true };
    }

    if (existing.count >= rpm) {
      const msIntoWindow = Date.now() % 60_000;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((60_000 - msIntoWindow) / 1000),
      );
      return { ok: false, retryAfterSec };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { ok: true };
  },
});

/**
 * OAuth2 client_credentials — returns one-time access token string (include `int_at_…` in response).
 */
export const oauthClientCredentials = internalMutation({
  args: {
    clientId: v.string(),
    clientSecret: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      accessToken: v.string(),
      expiresInSec: v.number(),
    }),
  ),
  handler: async (ctx, { clientId, clientSecret }) => {
    const pub = parseOAuthClientId(clientId);
    if (!pub) return null;
    const secretHex = clientSecret.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(secretHex)) return null;

    const client = await ctx.db
      .query("integrationOAuthClients")
      .withIndex("by_publicId", (q) => q.eq("publicId", pub))
      .first();
    if (!client || client.revokedAt != null) return null;

    const got = await sha256Hex(`${client.secretSalt}:${secretHex}`);
    if (got !== client.secretHash) return null;

    const tokenPublic = randomHexSync(8);
    const tokenSecret = randomHexSync(32);
    const tokenSalt = randomHexSync(32);
    const tokenHash = await sha256Hex(`${tokenSalt}:${tokenSecret}`);

    const ttlMs = 3600 * 1000;
    const now = Date.now();
    await ctx.db.insert("integrationAccessTokens", {
      publicId: tokenPublic,
      secretSalt: tokenSalt,
      secretHash: tokenHash,
      oauthClientPublicId: client.publicId,
      organizationId: client.organizationId,
      actorUserKey: client.actorUserKey,
      scopes: client.scopes,
      expiresAt: now + ttlMs,
      createdAt: now,
    });

    return {
      accessToken: formatAccessToken(tokenPublic, tokenSecret),
      expiresInSec: Math.floor(ttlMs / 1000),
    };
  },
});
