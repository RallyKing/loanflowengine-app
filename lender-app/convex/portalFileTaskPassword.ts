/**
 * Per-vault-task portal passwords (e.g. one PFS per borrower).
 * Reuses portal PBKDF2 hashing — never store or log plaintext.
 */
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  hashPassword,
  normalizePortalToken,
  randomHex,
  sha256Hex,
  verifyPassword,
} from "./clientPortalCrypto";
import { bundleIncludesFileTask } from "./portalBundleTaskScope";

const TASK_PROOF_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PASSWORD_LEN = 128;

export function fileTaskRequiresPassword(
  task: Pick<
    Doc<"documentVaultFileTasks">,
    "accessPasswordHash" | "accessPasswordSalt"
  >,
): boolean {
  return Boolean(
    task.accessPasswordHash?.trim() && task.accessPasswordSalt?.trim(),
  );
}

export async function isFileTaskAccessProofValid(
  ctx: { db: QueryCtx["db"] },
  args: {
    fileTaskId: Id<"documentVaultFileTasks">;
    tokenHash: string;
    taskAccessProof?: string;
  },
): Promise<boolean> {
  const proof = args.taskAccessProof?.trim();
  if (!proof) return false;
  const row = await ctx.db
    .query("portalFileTaskAccessProofs")
    .withIndex("by_proofToken", (q) => q.eq("proofToken", proof))
    .first();
  if (!row) return false;
  if (String(row.fileTaskId) !== String(args.fileTaskId)) return false;
  if (row.tokenHash !== args.tokenHash) return false;
  return row.expiresAt >= Date.now();
}

export async function assertFileTaskPasswordAllowed(
  ctx: { db: QueryCtx["db"] },
  args: {
    task: Doc<"documentVaultFileTasks">;
    tokenHash: string;
    taskAccessProof?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: "password_required" }> {
  if (!fileTaskRequiresPassword(args.task)) return { ok: true };
  const valid = await isFileTaskAccessProofValid(ctx, {
    fileTaskId: args.task._id,
    tokenHash: args.tokenHash,
    taskAccessProof: args.taskAccessProof,
  });
  if (valid) return { ok: true };
  return { ok: false, reason: "password_required" };
}

async function createFileTaskAccessProof(
  ctx: MutationCtx,
  args: {
    fileTaskId: Id<"documentVaultFileTasks">;
    tokenHash: string;
  },
): Promise<string> {
  const now = Date.now();
  const proofToken = randomHex(32);
  const existing = await ctx.db
    .query("portalFileTaskAccessProofs")
    .withIndex("by_fileTask_tokenHash", (q) =>
      q.eq("fileTaskId", args.fileTaskId).eq("tokenHash", args.tokenHash),
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.insert("portalFileTaskAccessProofs", {
    fileTaskId: args.fileTaskId,
    tokenHash: args.tokenHash,
    proofToken,
    expiresAt: now + TASK_PROOF_TTL_MS,
    createdAt: now,
  });
  return proofToken;
}

export const getFileTaskPasswordGate = query({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    taskAccessProof: v.optional(v.string()),
  },
  handler: async (ctx, { bundleToken, fileTaskId, taskAccessProof }) => {
    const trimmed = normalizePortalToken(bundleToken);
    if (!trimmed) return { status: "not_found" as const };
    const tokenHash = await sha256Hex(trimmed);
    const task = await ctx.db.get(fileTaskId);
    if (!task || task.isArchived) return { status: "not_found" as const };
    if (!fileTaskRequiresPassword(task)) {
      return { status: "ok" as const, passwordProtected: false };
    }
    const unlocked = await isFileTaskAccessProofValid(ctx, {
      fileTaskId,
      tokenHash,
      taskAccessProof,
    });
    return {
      status: unlocked ? ("ok" as const) : ("password_required" as const),
      passwordProtected: true,
    };
  },
});

export const verifyFileTaskPassword = mutation({
  args: {
    bundleToken: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
    password: v.string(),
  },
  handler: async (ctx, { bundleToken, fileTaskId, password }) => {
    const trimmed = normalizePortalToken(bundleToken);
    if (!trimmed) throw new Error("This portal link is invalid.");
    const tokenHash = await sha256Hex(trimmed);
    const task = await ctx.db.get(fileTaskId);
    if (!task || task.isArchived || !task.isPortalVisible) {
      throw new Error("This request is not available.");
    }
    const bundle = await ctx.db
      .query("documentVaultClientBundleTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!bundle || bundle.status !== "active") {
      throw new Error("This portal link is invalid.");
    }
    const allTasks = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) =>
        q.eq("pipelineFileId", bundle.pipelineFileId),
      )
      .collect();
    if (!bundleIncludesFileTask(bundle, allTasks, fileTaskId)) {
      throw new Error("This request is not available.");
    }
    if (!fileTaskRequiresPassword(task)) {
      return { ok: true as const, proofToken: "" };
    }
    const plain = password.trim();
    if (!plain || plain.length > MAX_PASSWORD_LEN) {
      throw new Error("Incorrect password.");
    }
    const ok = await verifyPassword(
      plain,
      task.accessPasswordSalt!,
      task.accessPasswordHash!,
    );
    if (!ok) {
      throw new Error("Incorrect password.");
    }
    const proofToken = await createFileTaskAccessProof(ctx, {
      fileTaskId,
      tokenHash,
    });
    return { ok: true as const, proofToken };
  },
});
