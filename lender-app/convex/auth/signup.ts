import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { assertAuthBridgeProofWithSkew } from "./bridge";
import {
  assertCanonicalAuthAvailable,
  normalizeAuthEmail,
  normalizeUsername,
} from "./canonicalIdentity";
import { bootstrapCleanNewTenant } from "./cleanTenantBootstrap";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";

const SIGNUP_RL_MAX = 10;

export const signup = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    organizationName: v.string(),
    email: v.optional(v.string()),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
    ipHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      120_000,
    );

    const usernameLower = normalizeUsername(args.username);
    if (!usernameLower.length || usernameLower.length > 64) {
      throw new Error("Invalid username.");
    }
    const hashErr = validateStoredArgon2PasswordHash(args.passwordHash);
    if (hashErr) {
      throw new Error(hashErr);
    }

    const rlKey = `signup:${args.ipHint ?? "na"}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000);
    const row = await ctx.db
      .query("authRateBuckets")
      .withIndex("by_key_window", (q) =>
        q.eq("key", rlKey).eq("windowStartMs", windowStart),
      )
      .first();
    if (!row) {
      await ctx.db.insert("authRateBuckets", {
        key: rlKey,
        windowStartMs: windowStart,
        count: 1,
      });
    } else if (row.count >= SIGNUP_RL_MAX) {
      throw new Error("RATE_LIMITED");
    } else {
      await ctx.db.patch(row._id, { count: row.count + 1 });
    }

    await assertCanonicalAuthAvailable(ctx, {
      loginIdentifier: args.username,
      email: args.email,
    });

    const emailNorm = normalizeAuthEmail(args.email);
    const displayLabel = args.username.trim() || usernameLower;

    const bootstrap = await bootstrapCleanNewTenant(ctx, {
      organizationName: args.organizationName,
      ownerUserKey: "__signup_bootstrap__",
    });

    const userId = await ctx.db.insert("authUsers", {
      normalizedUsername: usernameLower,
      usernameNormalized: usernameLower,
      displayUsername: displayLabel,
      passwordHash: args.passwordHash,
      email: emailNorm,
      emailVerificationRequired: false,
      credentialVersion: 1,
      defaultOrganizationId: bootstrap.organizationId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMembers", {
      organizationId: bootstrap.organizationId,
      userKey: userId as unknown as string,
      role: "owner",
      assignedRoleId: bootstrap.adminRoleId,
      createdAt: now,
    });

    return {
      ok: true as const,
      userId,
      organizationId: bootstrap.organizationId,
      pipelineStagesSeeded: bootstrap.pipelineStagesSeeded,
    };
  },
});
