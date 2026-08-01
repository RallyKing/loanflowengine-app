import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  hashPassword,
  normalizePortalToken,
  randomHex,
  sha256Hex,
  verifyPassword,
} from "./clientPortalCrypto";
import { loadLinkByTokenHash } from "./clientPortalLinks";
import { internal } from "./_generated/api";

const PROOF_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 15 * 60 * 1000;

function generateOtpCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

export async function isAccessProofValid(
  ctx: { db: QueryCtx["db"] },
  tokenHash: string,
  accessProof?: string,
): Promise<boolean> {
  const proof = accessProof?.trim();
  if (!proof) return false;
  const row = await ctx.db
    .query("portalLinkAccessProofs")
    .withIndex("by_proofToken", (q) => q.eq("proofToken", proof))
    .first();
  if (!row || row.tokenHash !== tokenHash) return false;
  return row.expiresAt >= Date.now();
}

export async function assertLinkAccessAllowed(
  ctx: { db: QueryCtx["db"] },
  link: Doc<"clientPortalLinks">,
  accessProof?: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "verification_required"; verificationType: "passcode" | "email_otp" }
> {
  if (!link.requiresVerification) return { ok: true };
  const valid = await isAccessProofValid(ctx, link.tokenHash, accessProof);
  if (valid) return { ok: true };
  return {
    ok: false,
    reason: "verification_required",
    verificationType: link.verificationType ?? "passcode",
  };
}

async function createAccessProof(
  ctx: MutationCtx,
  tokenHash: string,
): Promise<string> {
  const now = Date.now();
  const proofToken = randomHex(32);
  const existing = await ctx.db
    .query("portalLinkAccessProofs")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.insert("portalLinkAccessProofs", {
    tokenHash,
    proofToken,
    expiresAt: now + PROOF_TTL_MS,
    createdAt: now,
  });
  return proofToken;
}

export const getLinkVerificationGate = query({
  args: {
    token: v.string(),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { token, accessProof }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const };
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link) return { status: "not_found" as const };
    if (link.status === "revoked") return { status: "revoked" as const };
    if (link.expiresAt < Date.now()) return { status: "expired" as const };
    if (!link.requiresVerification) {
      return { status: "ok" as const, requiresVerification: false as const };
    }
    const gate = await assertLinkAccessAllowed(ctx, link, accessProof);
    if (!gate.ok) {
      return {
        status: "verification_required" as const,
        verificationType: gate.verificationType,
        maskedEmail: link.verificationEmail || link.emailKey
          ? maskEmail(link.verificationEmail ?? link.emailKey ?? "")
          : undefined,
      };
    }
    return { status: "ok" as const, requiresVerification: true as const };
  },
});

export const verifyLinkPasscode = mutation({
  args: {
    token: v.string(),
    passcode: v.string(),
  },
  handler: async (ctx, { token, passcode }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) throw new Error("Invalid link.");
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link || link.status !== "active") {
      throw new Error("This link is no longer valid.");
    }
    if (!link.requiresVerification || link.verificationType !== "passcode") {
      throw new Error("Passcode verification is not enabled for this link.");
    }
    const salt = link.verificationPasscodeSalt?.trim();
    const expected = link.verificationPasscodeHash?.trim();
    if (!salt || !expected) {
      throw new Error("Passcode is not configured for this link.");
    }
    const ok = await verifyPassword(passcode.trim(), salt, expected);
    if (!ok) throw new Error("Incorrect passcode.");
    const proofToken = await createAccessProof(ctx, tokenHash);
    return { ok: true as const, proofToken, expiresAt: Date.now() + PROOF_TTL_MS };
  },
});

export const sendLinkEmailOtp = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) throw new Error("Invalid link.");
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link || link.status !== "active") {
      throw new Error("This link is no longer valid.");
    }
    if (!link.requiresVerification || link.verificationType !== "email_otp") {
      throw new Error("Email verification is not enabled for this link.");
    }
    const email = (link.verificationEmail ?? link.emailKey)?.trim();
    if (!email?.includes("@")) {
      throw new Error("No verification email is configured for this link.");
    }
    const now = Date.now();
    const code = generateOtpCode();
    const otpHash = await sha256Hex(code);
    const existing = await ctx.db
      .query("portalVerificationOtps")
      .withIndex("by_link", (q) => q.eq("linkId", link._id))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("portalVerificationOtps", {
      linkId: link._id,
      emailKey: email,
      otpHash,
      expiresAt: now + OTP_TTL_MS,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.clientPortalEmails.deliverPortalLinkOtp, {
      to: email,
      code,
      linkTitle: link.title ?? "Secure portal link",
    });
    return {
      ok: true as const,
      maskedEmail: maskEmail(email),
      expiresAt: now + OTP_TTL_MS,
    };
  },
});

export const verifyLinkEmailOtp = mutation({
  args: {
    token: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { token, code }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) throw new Error("Invalid link.");
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link || link.status !== "active") {
      throw new Error("This link is no longer valid.");
    }
    const otpRow = await ctx.db
      .query("portalVerificationOtps")
      .withIndex("by_link", (q) => q.eq("linkId", link._id))
      .first();
    if (!otpRow || otpRow.expiresAt < Date.now()) {
      throw new Error("Verification code expired. Request a new code.");
    }
    const submitted = await sha256Hex(code.trim());
    if (submitted !== otpRow.otpHash) {
      throw new Error("Incorrect verification code.");
    }
    await ctx.db.delete(otpRow._id);
    const proofToken = await createAccessProof(ctx, tokenHash);
    return { ok: true as const, proofToken, expiresAt: Date.now() + PROOF_TTL_MS };
  },
});

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}•••@${domain}`;
}
