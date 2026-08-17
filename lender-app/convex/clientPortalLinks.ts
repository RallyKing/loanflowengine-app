import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import { slugifyCompanySlug } from "../lib/clientPortalUrl";
import { hashPassword, normalizePortalToken, randomHex, sha256Hex } from "./clientPortalCrypto";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import { buildClientPortalUrl } from "../lib/clientPortalUrl";
import { invalidateSessionsForGrant } from "./clientPortalShared";
import { resolveTriageEvaluationTime } from "../lib/triageClock";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

export type PortalLinkType = "client" | "lender" | "task_upload" | "portal_grant";

export function resolvePortalLinkType(
  row: Doc<"clientPortalLinks">,
): PortalLinkType {
  if (row.linkType === "task_upload" || row.fileTaskUploadTokenId) {
    return "task_upload";
  }
  if (row.linkType === "portal_grant" || row.grantId) {
    return "portal_grant";
  }
  if (row.linkType === "lender" || row.lenderDeliveryTokenId) {
    return "lender";
  }
  return "client";
}

export async function grantRegistryTokenHash(
  grantId: Id<"clientPortalGrants">,
): Promise<string> {
  return await sha256Hex(`grant:${grantId}`);
}

export async function resolveCompanySlugForPipeline(
  ctx: { db: MutationCtx["db"] },
  pipeline: Doc<"pipeline">,
): Promise<string> {
  if (!pipeline.organizationId) return "portal";
  const org = await ctx.db.get(pipeline.organizationId);
  if (!org) return "portal";
  if (org.slug?.trim()) return slugifyCompanySlug(org.slug);
  if (org.name?.trim()) return slugifyCompanySlug(org.name);
  return "portal";
}

export async function registerClientPortalLink(
  ctx: MutationCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    organizationId?: Id<"organizations">;
    bundleTokenId: Id<"documentVaultClientBundleTokens">;
    companySlug: string;
    tokenHash: string;
    title?: string;
    linkKind: NonNullable<Doc<"clientPortalLinks">["linkKind"]>;
    expiresAt: number;
    createdByUserKey: string;
    createdAt: number;
    targetName?: string;
    issuedUrl?: string;
  },
): Promise<Id<"clientPortalLinks">> {
  return await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: args.pipelineFileId,
    organizationId: args.organizationId,
    linkType: "client",
    bundleTokenId: args.bundleTokenId,
    companySlug: slugifyCompanySlug(args.companySlug),
    title: args.title,
    targetName: args.targetName,
    tokenHash: args.tokenHash,
    status: "active",
    linkKind: args.linkKind,
    issuedUrl: args.issuedUrl?.trim() || undefined,
    expiresAt: args.expiresAt,
    createdByUserKey: args.createdByUserKey,
    createdAt: args.createdAt,
  });
}

export async function registerLenderPortalLink(
  ctx: MutationCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    organizationId?: Id<"organizations">;
    lenderDeliveryTokenId: Id<"lenderDeliveryTokens">;
    lenderId: Id<"lenders">;
    targetName: string;
    companySlug: string;
    tokenHash: string;
    title?: string;
    expiresAt: number;
    createdByUserKey: string;
    createdAt: number;
    issuedUrl?: string;
  },
): Promise<Id<"clientPortalLinks">> {
  return await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: args.pipelineFileId,
    organizationId: args.organizationId,
    linkType: "lender",
    lenderDeliveryTokenId: args.lenderDeliveryTokenId,
    lenderId: args.lenderId,
    targetName: args.targetName,
    companySlug: slugifyCompanySlug(args.companySlug),
    title: args.title ?? `Lender: ${args.targetName}`,
    tokenHash: args.tokenHash,
    status: "active",
    linkKind: "lender_delivery",
    issuedUrl: args.issuedUrl?.trim() || undefined,
    expiresAt: args.expiresAt,
    createdByUserKey: args.createdByUserKey,
    createdAt: args.createdAt,
  });
}

export async function registerTaskUploadPortalLink(
  ctx: MutationCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    organizationId?: Id<"organizations">;
    fileTaskUploadTokenId: Id<"documentVaultFileTaskUploadTokens">;
    fileTaskId: Id<"documentVaultFileTasks">;
    tokenHash: string;
    title: string;
    expiresAt: number;
    createdByUserKey: string;
    createdAt: number;
    issuedUrl?: string;
  },
): Promise<Id<"clientPortalLinks">> {
  return await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: args.pipelineFileId,
    organizationId: args.organizationId,
    linkType: "task_upload",
    fileTaskUploadTokenId: args.fileTaskUploadTokenId,
    fileTaskId: args.fileTaskId,
    title: args.title,
    tokenHash: args.tokenHash,
    status: "active",
    linkKind: "task_upload",
    legacyPath: true,
    issuedUrl: args.issuedUrl?.trim() || undefined,
    expiresAt: args.expiresAt,
    createdByUserKey: args.createdByUserKey,
    createdAt: args.createdAt,
  });
}

export async function registerPortalGrantLink(
  ctx: MutationCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    organizationId?: Id<"organizations">;
    grantId: Id<"clientPortalGrants">;
    emailKey: string;
    title?: string;
    targetName?: string;
    expiresAt: number;
    createdByUserKey: string;
    createdAt: number;
    issuedUrl?: string;
  },
): Promise<Id<"clientPortalLinks">> {
  const tokenHash = await grantRegistryTokenHash(args.grantId);
  return await ctx.db.insert("clientPortalLinks", {
    pipelineFileId: args.pipelineFileId,
    organizationId: args.organizationId,
    linkType: "portal_grant",
    grantId: args.grantId,
    emailKey: args.emailKey,
    title: args.title ?? `Portal grant: ${args.emailKey}`,
    targetName: args.targetName ?? args.emailKey,
    tokenHash,
    status: "active",
    linkKind: "portal_grant",
    issuedUrl: args.issuedUrl?.trim() || undefined,
    expiresAt: args.expiresAt,
    createdByUserKey: args.createdByUserKey,
    createdAt: args.createdAt,
  });
}

export async function loadLinkByGrantId(
  ctx: { db: QueryCtx["db"] },
  grantId: Id<"clientPortalGrants">,
): Promise<Doc<"clientPortalLinks"> | null> {
  return await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_grant", (q) => q.eq("grantId", grantId))
    .first();
}

export async function loadLinkByTokenHash(
  ctx: { db: QueryCtx["db"] },
  tokenHash: string,
): Promise<Doc<"clientPortalLinks"> | null> {
  return await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

function mapLinkRow(row: Doc<"clientPortalLinks">, now: number) {
  const effectiveStatus =
    row.status === "active" && row.expiresAt < now
      ? ("expired" as const)
      : row.status;
  const linkType = resolvePortalLinkType(row);
  return {
    _id: row._id,
    linkType,
    companySlug: row.companySlug,
    title: row.title,
    targetName: row.targetName,
    lenderId: row.lenderId,
    status: effectiveStatus,
    linkKind: row.linkKind,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    bundleTokenId: row.bundleTokenId,
    lenderDeliveryTokenId: row.lenderDeliveryTokenId,
    fileTaskUploadTokenId: row.fileTaskUploadTokenId,
    fileTaskId: row.fileTaskId,
    grantId: row.grantId,
    emailKey: row.emailKey,
    legacyPath: row.legacyPath === true,
    issuedUrl: row.issuedUrl,
    requiresVerification: row.requiresVerification === true,
    verificationType: row.verificationType,
    verificationEmail: row.verificationEmail,
  };
}

/** Public route resolver for middleware slug URLs (client vs lender portal). */
export const resolvePortalLinkRoute = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const };
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link) return { status: "not_found" as const };
    if (link.status === "revoked") return { status: "revoked" as const };
    if (link.expiresAt < Date.now()) return { status: "expired" as const };
    return {
      status: "ok" as const,
      linkType: resolvePortalLinkType(link),
      companySlug: link.companySlug,
    };
  },
});

export const listLinksForPipeline = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    linkType: v.optional(
      v.union(
        v.literal("client"),
        v.literal("lender"),
        v.literal("access"),
      ),
    ),
    /** Minute bucket from `TriageClockProvider` — never Date.now() in this query. */
    nowBucket: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, linkType, memberUserKey, nowBucket }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return [];
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);

    const now = resolveTriageEvaluationTime(nowBucket);
    const rows = await ctx.db
      .query("clientPortalLinks")
      .withIndex("by_pipeline_created", (q) =>
        q.eq("pipelineFileId", pipelineFileId),
      )
      .order("desc")
      .collect();

    return rows
      .map((row) => mapLinkRow(row, now))
      .filter((row) => {
        if (!linkType) return true;
        if (linkType === "lender") return row.linkType === "lender";
        if (linkType === "access") {
          return row.linkType === "task_upload" || row.linkType === "portal_grant";
        }
        // Client Links tab — client portal / block-fill only (not access controls).
        return row.linkType === "client";
      });
  },
});

async function revokePortalLinkImpl(
  ctx: MutationCtx,
  link: Doc<"clientPortalLinks">,
): Promise<{ ok: true; linkId: Id<"clientPortalLinks">; linkType: PortalLinkType }> {
  const now = Date.now();
  if (link.status === "revoked") {
    return {
      ok: true as const,
      linkId: link._id,
      linkType: resolvePortalLinkType(link),
    };
  }

  await ctx.db.patch(link._id, {
    status: "revoked",
    revokedAt: now,
  });

  const linkType = resolvePortalLinkType(link);

  if (linkType === "lender" && link.lenderDeliveryTokenId) {
    const delivery = await ctx.db.get(link.lenderDeliveryTokenId);
    if (delivery && delivery.status === "active") {
      await ctx.db.patch(delivery._id, { status: "revoked" });
    }
  } else if (linkType === "task_upload" && link.fileTaskUploadTokenId) {
    const upload = await ctx.db.get(link.fileTaskUploadTokenId);
    if (upload && upload.status === "active") {
      await ctx.db.patch(upload._id, { status: "revoked" });
    }
  } else if (linkType === "portal_grant" && link.grantId) {
    const grant = await ctx.db.get(link.grantId);
    if (grant && grant.status === "active") {
      await invalidateSessionsForGrant(ctx, link.grantId);
      await ctx.db.patch(link.grantId, {
        status: "revoked",
        updatedAt: now,
      });
    }
  } else if (link.bundleTokenId) {
    const bundle = await ctx.db.get(link.bundleTokenId);
    if (bundle && bundle.status === "active") {
      await ctx.db.patch(bundle._id, { status: "revoked" });
    }
  }

  return { ok: true as const, linkId: link._id, linkType };
}

const EXTEND_DAYS_MS: Record<"7" | "14" | "30", number> = {
  "7": 7 * 24 * 60 * 60 * 1000,
  "14": 14 * 24 * 60 * 60 * 1000,
  "30": 30 * 24 * 60 * 60 * 1000,
};

async function syncSessionExpiry(
  ctx: MutationCtx,
  link: Doc<"clientPortalLinks">,
  expiresAt: number,
): Promise<void> {
  const linkType = resolvePortalLinkType(link);
  if (linkType === "lender" && link.lenderDeliveryTokenId) {
    const delivery = await ctx.db.get(link.lenderDeliveryTokenId);
    if (delivery) await ctx.db.patch(delivery._id, { expiresAt });
  } else if (linkType === "task_upload" && link.fileTaskUploadTokenId) {
    const upload = await ctx.db.get(link.fileTaskUploadTokenId);
    if (upload) await ctx.db.patch(upload._id, { expiresAt });
  } else if (linkType === "portal_grant" && link.grantId) {
    const grant = await ctx.db.get(link.grantId);
    if (grant) {
      await ctx.db.patch(link.grantId, {
        grantExpiresAt: expiresAt,
        updatedAt: Date.now(),
      });
    }
  } else if (link.bundleTokenId) {
    const bundle = await ctx.db.get(link.bundleTokenId);
    if (bundle) await ctx.db.patch(bundle._id, { expiresAt });
  }
}

async function reactivateSession(
  ctx: MutationCtx,
  link: Doc<"clientPortalLinks">,
  expiresAt: number,
): Promise<void> {
  const linkType = resolvePortalLinkType(link);
  if (linkType === "lender" && link.lenderDeliveryTokenId) {
    const delivery = await ctx.db.get(link.lenderDeliveryTokenId);
    if (delivery) {
      await ctx.db.patch(delivery._id, { status: "active", expiresAt });
    }
  } else if (linkType === "task_upload" && link.fileTaskUploadTokenId) {
    const upload = await ctx.db.get(link.fileTaskUploadTokenId);
    if (upload) {
      await ctx.db.patch(upload._id, { status: "active", expiresAt });
    }
  } else if (linkType === "portal_grant" && link.grantId) {
    const grant = await ctx.db.get(link.grantId);
    if (grant) {
      await ctx.db.patch(link.grantId, {
        status: "active",
        grantExpiresAt: expiresAt,
        updatedAt: Date.now(),
      });
    }
  } else if (link.bundleTokenId) {
    const bundle = await ctx.db.get(link.bundleTokenId);
    if (bundle) {
      await ctx.db.patch(bundle._id, { status: "active", expiresAt });
    }
  }
}

export const extendLinkExpiry = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    extendDays: v.union(v.literal("7"), v.literal("14"), v.literal("30")),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, extendDays, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    if (link.status === "revoked") {
      throw new Error("Revoked links must be reactivated before extending expiry.");
    }

    const now = Date.now();
    const base = Math.max(link.expiresAt, now);
    const expiresAt = base + EXTEND_DAYS_MS[extendDays];

    await ctx.db.patch(linkId, { expiresAt, status: "active" });
    await syncSessionExpiry(ctx, link, expiresAt);

    return {
      ok: true as const,
      linkId,
      expiresAt,
      extendDays,
    };
  },
});

const MAX_LINK_EXPIRY_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/** Set an absolute expiry (increase or decrease). Syncs linked session tokens. */
export const setLinkExpiry = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    expiresAt: v.number(),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, expiresAt, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    if (link.status === "revoked") {
      throw new Error("Revoked links must be reactivated before changing expiry.");
    }

    if (!Number.isFinite(expiresAt)) {
      throw new Error("Invalid expiry date.");
    }

    const now = Date.now();
    if (expiresAt <= now) {
      throw new Error("Expiry must be in the future.");
    }
    if (expiresAt > now + MAX_LINK_EXPIRY_AHEAD_MS) {
      throw new Error("Expiry cannot be more than 5 years from now.");
    }

    await ctx.db.patch(linkId, { expiresAt, status: "active" });
    await syncSessionExpiry(ctx, link, expiresAt);

    return {
      ok: true as const,
      linkId,
      expiresAt,
    };
  },
});

export const reactivateLink = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    extendDays: v.optional(v.union(v.literal("7"), v.literal("14"), v.literal("30"))),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, extendDays, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const now = Date.now();
    const days = extendDays ?? "14";
    const expiresAt = now + EXTEND_DAYS_MS[days];

    await ctx.db.patch(linkId, {
      status: "active",
      expiresAt,
      revokedAt: undefined,
    });
    await reactivateSession(ctx, link, expiresAt);

    return {
      ok: true as const,
      linkId,
      linkType: resolvePortalLinkType(link),
      expiresAt,
    };
  },
});

export const regenerateLinkToken = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    extendDays: v.optional(v.union(v.literal("7"), v.literal("14"), v.literal("30"))),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, extendDays, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const now = Date.now();
    const days = extendDays ?? "14";
    const expiresAt = now + EXTEND_DAYS_MS[days];
    const companySlug =
      link.companySlug?.trim() ||
      slugifyCompanySlug(await resolveCompanySlugForPipeline(ctx, pipeline));

    const linkType = resolvePortalLinkType(link);
    let portalUrl = "";
    let plainToken = "";

    if (linkType === "lender" && link.lenderDeliveryTokenId) {
      const delivery = await ctx.db.get(link.lenderDeliveryTokenId);
      if (!delivery) throw new Error("Lender delivery session not found.");
      plainToken = randomHex(24);
      const tokenHash = await sha256Hex(plainToken);
      portalUrl = buildClientPortalUrl(companySlug, plainToken);
      await ctx.db.patch(delivery._id, {
        tokenHash,
        status: "active",
        expiresAt,
      });
      await ctx.db.patch(linkId, {
        tokenHash,
        status: "active",
        expiresAt,
        revokedAt: undefined,
        companySlug,
        legacyPath: false,
        issuedUrl: portalUrl,
      });
    } else if (linkType === "task_upload" && link.fileTaskUploadTokenId) {
      const upload = await ctx.db.get(link.fileTaskUploadTokenId);
      if (!upload) throw new Error("Task upload session not found.");
      plainToken = randomHex(24);
      const tokenHash = await sha256Hex(plainToken);
      const origin = (
        process.env.CLIENT_PORTAL_ORIGIN?.trim() ||
        process.env.NEXT_PUBLIC_CLIENT_PORTAL_ORIGIN?.trim() ||
        "https://paperworkprocessing.com"
      ).replace(/\/$/, "");
      portalUrl = `${origin}/upload/${encodeURIComponent(plainToken)}`;
      await ctx.db.patch(upload._id, {
        tokenHash,
        status: "active",
        expiresAt,
      });
      await ctx.db.patch(linkId, {
        tokenHash,
        status: "active",
        expiresAt,
        revokedAt: undefined,
        legacyPath: true,
        issuedUrl: portalUrl,
      });
    } else if (link.bundleTokenId) {
      const bundle = await ctx.db.get(link.bundleTokenId);
      if (!bundle) throw new Error("Client bundle session not found.");
      plainToken = randomHex(24);
      const tokenHash = await sha256Hex(plainToken);
      portalUrl = buildClientPortalUrl(companySlug, plainToken);
      await ctx.db.patch(bundle._id, {
        tokenHash,
        status: "active",
        expiresAt,
      });
      await ctx.db.patch(linkId, {
        tokenHash,
        status: "active",
        expiresAt,
        revokedAt: undefined,
        companySlug,
        legacyPath: false,
        issuedUrl: portalUrl,
      });
    } else if (linkType === "portal_grant") {
      throw new Error(
        "Portal grants use magic-link invites. Re-invite the client from the portal invite block.",
      );
    } else {
      throw new Error("Link has no backing session row.");
    }

    return {
      ok: true as const,
      linkId,
      linkType,
      portalUrl,
      plainToken,
      expiresAt,
      companySlug,
    };
  },
});

export const revokeLink = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { linkId, memberUserKey }) => {
    const link = await ctx.db.get(linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    return revokePortalLinkImpl(ctx, link);
  },
});

export const setLinkVerification = mutation({
  args: {
    linkId: v.id("clientPortalLinks"),
    enabled: v.boolean(),
    verificationType: v.optional(
      v.union(v.literal("passcode"), v.literal("email_otp")),
    ),
    passcode: v.optional(v.string()),
    verificationEmail: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Portal link not found.");
    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    if (!args.enabled) {
      await ctx.db.patch(args.linkId, {
        requiresVerification: false,
        verificationType: undefined,
        verificationPasscodeHash: undefined,
        verificationPasscodeSalt: undefined,
        verificationEmail: undefined,
      });
      return { ok: true as const, enabled: false as const };
    }

    const verificationType = args.verificationType ?? "passcode";
    if (verificationType === "passcode") {
      const passcode = args.passcode?.trim();
      if (!passcode || passcode.length < 4) {
        throw new Error("Enter a passcode with at least 4 characters.");
      }
      const salt = randomHex(16);
      const verificationPasscodeHash = await hashPassword(passcode, salt);
      await ctx.db.patch(args.linkId, {
        requiresVerification: true,
        verificationType: "passcode",
        verificationPasscodeHash,
        verificationPasscodeSalt: salt,
        verificationEmail: undefined,
      });
      return { ok: true as const, enabled: true as const, verificationType };
    }

    const email = (
      args.verificationEmail?.trim() ||
      link.verificationEmail?.trim() ||
      link.emailKey?.trim()
    );
    if (!email?.includes("@")) {
      throw new Error("Email OTP requires a valid verification email.");
    }
    await ctx.db.patch(args.linkId, {
      requiresVerification: true,
      verificationType: "email_otp",
      verificationPasscodeHash: undefined,
      verificationPasscodeSalt: undefined,
      verificationEmail: email,
    });
    return { ok: true as const, enabled: true as const, verificationType };
  },
});

/** Operator-only: revoke a client or lender portal link by raw URL token. */
export const operatorRevokeLinkByToken = mutation({
  args: {
    adminSecret: v.string(),
    token: v.string(),
  },
  handler: async (ctx, { adminSecret, token }) => {
    assertDataMigrationAdmin(adminSecret);
    const trimmed = normalizePortalToken(token);
    if (!trimmed) throw new Error("Token is required.");
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link) throw new Error("Portal link not found for this token.");
    const result = await revokePortalLinkImpl(ctx, link);
    return {
      ...result,
      title: link.title,
      targetName: link.targetName,
      pipelineFileId: link.pipelineFileId,
    };
  },
});
