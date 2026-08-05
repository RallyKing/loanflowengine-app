/**
 * Partner-portal credential vault for lender profiles.
 * Username/password sealed with portalFieldCrypto when encryption key is set.
 */
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgScopeArgs, resolveMemberUserKey } from "./organizationAccess";
import { assertOrgPermission } from "./organizationRbac";
import { callerHasUnrestrictedOrgDataAccess } from "./viewerOrgAccess";
import {
  openOptionalPortalCiphertext,
  sealOptionalPortalPlaintext,
} from "./portalFieldCrypto";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

async function assertLenderReader(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
) {
  await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
}

async function assertLenderEditor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
) {
  await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
  const key = await resolveMemberUserKey(ctx, memberUserKey);
  await assertOrgPermission(ctx, organizationId, key, "lenders.edit");
  return key;
}

async function loadLenderInOrg(
  ctx: QueryCtx | MutationCtx,
  lenderId: Id<"lenders">,
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<Doc<"lenders">> {
  const lender = await ctx.db.get(lenderId);
  if (!lender) throw new Error("Lender not found");
  const god = await callerHasUnrestrictedOrgDataAccess(ctx, memberUserKey);
  if (
    !god &&
    lender.organizationId &&
    lender.organizationId !== organizationId
  ) {
    throw new Error("Lender belongs to a different organization.");
  }
  return lender;
}

async function findCredentialRow(
  ctx: QueryCtx | MutationCtx,
  lenderId: Id<"lenders">,
) {
  return await ctx.db
    .query("lenderPortalCredentials")
    .withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
    .first();
}

/** Public profile view — never includes password plaintext unless revealPassword. */
export const get = query({
  args: {
    ...orgArgs,
    lenderId: v.id("lenders"),
    revealPassword: v.optional(v.boolean()),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("lenderPortalCredentials"),
      lenderId: v.id("lenders"),
      portalUrl: v.optional(v.string()),
      username: v.optional(v.string()),
      hasPassword: v.boolean(),
      password: v.optional(v.string()),
      notes: v.optional(v.string()),
      updatedAt: v.number(),
      encryptionConfigured: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await assertLenderReader(ctx, args.organizationId, args.memberUserKey);
    await loadLenderInOrg(
      ctx,
      args.lenderId,
      args.organizationId,
      args.memberUserKey,
    );
    const row = await findCredentialRow(ctx, args.lenderId);
    if (!row) return null;
    const god = await callerHasUnrestrictedOrgDataAccess(
      ctx,
      args.memberUserKey,
    );
    if (!god && row.organizationId !== args.organizationId) {
      return null;
    }
    const username = await openOptionalPortalCiphertext(row.usernameEnc);
    const hasPassword = Boolean(row.passwordEnc && row.passwordEnc.length > 0);
    let password: string | undefined;
    if (args.revealPassword && hasPassword) {
      password = await openOptionalPortalCiphertext(row.passwordEnc);
    }
    return {
      _id: row._id,
      lenderId: row.lenderId,
      portalUrl: row.portalUrl,
      username,
      hasPassword,
      ...(password !== undefined ? { password } : {}),
      notes: row.notes,
      updatedAt: row.updatedAt,
      encryptionConfigured: Boolean(
        process.env.CLIENT_PORTAL_FIELD_ENCRYPTION_KEY?.trim(),
      ),
    };
  },
});

export const upsert = mutation({
  args: {
    ...orgArgs,
    lenderId: v.id("lenders"),
    portalUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    /** Omit to leave existing password unchanged; empty string clears. */
    password: v.optional(v.string()),
    notes: v.optional(v.string()),
    clearPassword: v.optional(v.boolean()),
  },
  returns: v.object({ id: v.id("lenderPortalCredentials") }),
  handler: async (ctx, args) => {
    const actor = await assertLenderEditor(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    await loadLenderInOrg(
      ctx,
      args.lenderId,
      args.organizationId,
      args.memberUserKey,
    );
    const now = Date.now();
    const portalUrl = args.portalUrl?.trim() || undefined;
    const usernameEnc =
      args.username !== undefined
        ? await sealOptionalPortalPlaintext(args.username.trim() || undefined)
        : undefined;
    const notes = args.notes?.trim() || undefined;

    let passwordEncPatch: { passwordEnc?: string } = {};
    if (args.clearPassword) {
      passwordEncPatch = { passwordEnc: undefined };
    } else if (args.password !== undefined) {
      const sealed = await sealOptionalPortalPlaintext(
        args.password.trim() || undefined,
      );
      passwordEncPatch = { passwordEnc: sealed };
    }

    const existing = await findCredentialRow(ctx, args.lenderId);
    if (existing) {
      if (
        existing.organizationId !== args.organizationId &&
        !(await callerHasUnrestrictedOrgDataAccess(ctx, args.memberUserKey))
      ) {
        throw new Error("Credential belongs to a different organization.");
      }
      await ctx.db.patch(existing._id, {
        portalUrl:
          args.portalUrl !== undefined ? portalUrl : existing.portalUrl,
        ...(args.username !== undefined ? { usernameEnc } : {}),
        ...passwordEncPatch,
        notes: args.notes !== undefined ? notes : existing.notes,
        updatedAt: now,
        updatedByUserKey: actor,
      });
      return { id: existing._id };
    }

    const id = await ctx.db.insert("lenderPortalCredentials", {
      lenderId: args.lenderId,
      organizationId: args.organizationId,
      portalUrl,
      usernameEnc:
        args.username !== undefined
          ? usernameEnc
          : await sealOptionalPortalPlaintext(undefined),
      ...(args.clearPassword
        ? {}
        : args.password !== undefined
          ? {
              passwordEnc: await sealOptionalPortalPlaintext(
                args.password.trim() || undefined,
              ),
            }
          : {}),
      notes,
      updatedAt: now,
      updatedByUserKey: actor,
    });
    return { id };
  },
});

export const remove = mutation({
  args: {
    ...orgArgs,
    lenderId: v.id("lenders"),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await assertLenderEditor(ctx, args.organizationId, args.memberUserKey);
    await loadLenderInOrg(
      ctx,
      args.lenderId,
      args.organizationId,
      args.memberUserKey,
    );
    const row = await findCredentialRow(ctx, args.lenderId);
    if (!row) return { ok: false };
    if (
      row.organizationId !== args.organizationId &&
      !(await callerHasUnrestrictedOrgDataAccess(ctx, args.memberUserKey))
    ) {
      throw new Error("Credential belongs to a different organization.");
    }
    await ctx.db.delete(row._id);
    return { ok: true };
  },
});
