import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanReadLibraryDocument,
  assertProofWrite,
  requireLinkForProof,
} from "./libraryDocuments";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const linkProof = v.union(
  v.object({ kind: v.literal("pipeline"), pipelineFileId: v.id("pipeline") }),
  v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
  v.object({ kind: v.literal("task"), taskId: v.id("tasks") }),
);

const signerInput = v.object({
  name: v.string(),
  email: v.string(),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function defaultProvider(): "internal_demo" | "dropbox_sign" {
  return process.env.DROPBOX_SIGN_API_KEY?.trim()
    ? "dropbox_sign"
    : "internal_demo";
}

export async function appendSignatureAudit(
  ctx: MutationCtx,
  args: {
    envelopeId: Id<"signatureEnvelopes">;
    actorType: Doc<"signatureAuditEvents">["actorType"];
    actorKey: string;
    kind: string;
    detail?: string;
  },
) {
  await ctx.db.insert("signatureAuditEvents", {
    envelopeId: args.envelopeId,
    at: Date.now(),
    actorType: args.actorType,
    actorKey: args.actorKey,
    kind: args.kind,
    detail: args.detail,
  });
}

export const createAndSendSignatureEnvelope = mutation({
  args: {
    libraryDocumentId: v.id("libraryDocuments"),
    libraryVersionId: v.id("libraryDocumentVersions"),
    title: v.string(),
    message: v.optional(v.string()),
    signingMode: v.union(v.literal("sequential"), v.literal("parallel")),
    signers: v.array(signerInput),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (
    ctx,
    {
      libraryDocumentId,
      libraryVersionId,
      title,
      message,
      signingMode,
      signers,
      proof,
      memberUserKey,
    },
  ) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    const doc = await assertCanReadLibraryDocument(
      ctx,
      libraryDocumentId,
      memberUserKey,
    );
    await requireLinkForProof(ctx, libraryDocumentId, proof);

    const version = await ctx.db.get(libraryVersionId);
    if (!version || version.documentId !== libraryDocumentId) {
      throw new Error("Version not found for this document.");
    }

    const cleaned = signers
      .map((s) => ({
        name: s.name.trim().slice(0, 200),
        email: normalizeEmail(s.email),
      }))
      .filter((s) => s.name && s.email.includes("@"));
    if (cleaned.length === 0) {
      throw new Error("Add at least one signer with a valid email.");
    }
    if (cleaned.length > 20) {
      throw new Error("Maximum 20 signers per request.");
    }
    const seen = new Set<string>();
    for (const s of cleaned) {
      if (seen.has(s.email)) throw new Error("Duplicate signer email.");
      seen.add(s.email);
    }

    const subject = title.trim().slice(0, 400);
    if (!subject) throw new Error("Subject / title is required.");

    const broker = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const provider = defaultProvider();

    const envelopeId = await ctx.db.insert("signatureEnvelopes", {
      libraryDocumentId,
      libraryVersionId,
      organizationId: doc.organizationId,
      title: subject,
      message: message?.trim().slice(0, 4000) || undefined,
      signingMode,
      provider,
      status: "sending",
      createdByUserKey: broker,
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < cleaned.length; i++) {
      const initialStatus: Doc<"signatureSigners">["status"] =
        signingMode === "parallel"
          ? "pending"
          : i === 0
            ? "pending"
            : "awaiting_turn";
      await ctx.db.insert("signatureSigners", {
        envelopeId,
        orderIndex: i,
        name: cleaned[i]!.name,
        emailNormalized: cleaned[i]!.email,
        status: initialStatus,
      });
    }

    await appendSignatureAudit(ctx, {
      envelopeId,
      actorType: "broker",
      actorKey: broker,
      kind: "envelope_send_started",
      detail: `provider=${provider}; mode=${signingMode}; signers=${cleaned.length}`,
    });

    await ctx.scheduler.runAfter(0, internal.signatureActions.deliverEnvelope, {
      envelopeId,
    });

    return { envelopeId };
  },
});

export const voidSignatureEnvelope = mutation({
  args: {
    envelopeId: v.id("signatureEnvelopes"),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { envelopeId, proof, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    const env = await ctx.db.get(envelopeId);
    if (!env) throw new Error("Envelope not found.");
    await requireLinkForProof(ctx, env.libraryDocumentId, proof);

    if (
      !["draft", "sending", "sent", "in_progress"].includes(env.status)
    ) {
      throw new Error("This envelope cannot be voided in its current state.");
    }

    const broker = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    await ctx.db.patch(envelopeId, {
      status: "voided",
      updatedAt: now,
    });
    await appendSignatureAudit(ctx, {
      envelopeId,
      actorType: "broker",
      actorKey: broker,
      kind: "envelope_voided",
    });
    return { ok: true as const };
  },
});

export const listEnvelopesForDocument = query({
  args: {
    libraryDocumentId: v.id("libraryDocuments"),
    ...memberKeyArg,
  },
  handler: async (ctx, { libraryDocumentId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, libraryDocumentId, memberUserKey);
    const envs = await ctx.db
      .query("signatureEnvelopes")
      .withIndex("by_document_updatedAt", (q) =>
        q.eq("libraryDocumentId", libraryDocumentId),
      )
      .order("desc")
      .take(40);
    const out: Array<{
      envelope: Doc<"signatureEnvelopes">;
      signers: Array<{
        _id: Id<"signatureSigners">;
        orderIndex: number;
        name: string;
        emailNormalized: string;
        status: Doc<"signatureSigners">["status"];
        signUrl?: string;
        signedAt?: number;
        declinedAt?: number;
      }>;
    }> = [];
    for (const e of envs) {
      const rows = await ctx.db
        .query("signatureSigners")
        .withIndex("by_envelope_order", (q) => q.eq("envelopeId", e._id))
        .collect();
      rows.sort((a, b) => a.orderIndex - b.orderIndex);
      const signers = rows.map((s) => ({
        _id: s._id,
        orderIndex: s.orderIndex,
        name: s.name,
        emailNormalized: s.emailNormalized,
        status: s.status,
        signedAt: s.signedAt,
        declinedAt: s.declinedAt,
        ...(e.provider === "internal_demo" && s.signUrl
          ? { signUrl: s.signUrl }
          : {}),
      }));
      out.push({ envelope: e, signers });
    }
    return out;
  },
});

export const listSignatureAudit = query({
  args: {
    envelopeId: v.id("signatureEnvelopes"),
    ...memberKeyArg,
  },
  handler: async (ctx, { envelopeId, memberUserKey }) => {
    const env = await ctx.db.get(envelopeId);
    if (!env) return [];
    await assertCanReadLibraryDocument(
      ctx,
      env.libraryDocumentId,
      memberUserKey,
    );
    const rows = await ctx.db
      .query("signatureAuditEvents")
      .withIndex("by_envelope_at", (q) => q.eq("envelopeId", envelopeId))
      .order("desc")
      .take(100);
    return rows;
  },
});

export const internalGetSendPayload = internalQuery({
  args: { envelopeId: v.id("signatureEnvelopes") },
  handler: async (ctx, { envelopeId }) => {
    const env = await ctx.db.get(envelopeId);
    if (!env || env.status !== "sending") return null;
    const version = await ctx.db.get(env.libraryVersionId);
    if (!version || version.documentId !== env.libraryDocumentId) return null;
    const signers = await ctx.db
      .query("signatureSigners")
      .withIndex("by_envelope_order", (q) => q.eq("envelopeId", envelopeId))
      .collect();
    signers.sort((a, b) => a.orderIndex - b.orderIndex);
    const downloadUrl = await ctx.storage.getUrl(version.storageId);
    if (!downloadUrl) return null;
    return {
      fileName: version.fileName,
      contentType: version.contentType ?? "application/octet-stream",
      downloadUrl,
      signingMode: env.signingMode,
      provider: env.provider,
      title: env.title,
      message: env.message,
      signers: signers.map((s) => ({
        name: s.name,
        email: s.emailNormalized,
        orderIndex: s.orderIndex,
      })),
    };
  },
});

export const internalApplyDemoDelivery = internalMutation({
  args: { envelopeId: v.id("signatureEnvelopes") },
  handler: async (ctx, { envelopeId }) => {
    const env = await ctx.db.get(envelopeId);
    if (!env || env.provider !== "internal_demo") return;
    const now = Date.now();
    const signers = await ctx.db
      .query("signatureSigners")
      .withIndex("by_envelope_order", (q) => q.eq("envelopeId", envelopeId))
      .collect();
    signers.sort((a, b) => a.orderIndex - b.orderIndex);
    for (const s of signers) {
      if (env.signingMode === "parallel") {
        await ctx.db.patch(s._id, {
          status: "email_sent",
          signUrl: `https://sign.dropbox.com/demo-placeholder?envelope=${envelopeId}&slot=${s.orderIndex}`,
        });
      } else if (s.orderIndex === 0) {
        await ctx.db.patch(s._id, {
          status: "email_sent",
          signUrl: `https://sign.dropbox.com/demo-placeholder?envelope=${envelopeId}&slot=0`,
        });
      } else {
        await ctx.db.patch(s._id, { status: "awaiting_turn" });
      }
    }
    await ctx.db.patch(envelopeId, {
      status: "in_progress",
      updatedAt: now,
    });
    await appendSignatureAudit(ctx, {
      envelopeId,
      actorType: "system",
      actorKey: "internal_demo",
      kind: "provider_demo_send_completed",
      detail: "Demo mode: no external provider call. Configure DROPBOX_SIGN_API_KEY for live e-sign.",
    });
  },
});

export const internalApplyDropboxSendSuccess = internalMutation({
  args: {
    envelopeId: v.id("signatureEnvelopes"),
    externalRequestId: v.string(),
  },
  handler: async (ctx, { envelopeId, externalRequestId }) => {
    const now = Date.now();
    await ctx.db.patch(envelopeId, {
      externalRequestId,
      status: "in_progress",
      updatedAt: now,
    });
    const signers = await ctx.db
      .query("signatureSigners")
      .withIndex("by_envelope_order", (q) => q.eq("envelopeId", envelopeId))
      .collect();
    for (const s of signers) {
      await ctx.db.patch(s._id, { status: "email_sent" });
    }
    await appendSignatureAudit(ctx, {
      envelopeId,
      actorType: "provider",
      actorKey: "dropbox_sign",
      kind: "provider_request_created",
      detail: `signature_request_id=${externalRequestId}`,
    });
  },
});

export const internalApplySendFailure = internalMutation({
  args: {
    envelopeId: v.id("signatureEnvelopes"),
    error: v.string(),
  },
  handler: async (ctx, { envelopeId, error }) => {
    const now = Date.now();
    await ctx.db.patch(envelopeId, {
      status: "error",
      lastError: error.slice(0, 2000),
      updatedAt: now,
    });
    await appendSignatureAudit(ctx, {
      envelopeId,
      actorType: "system",
      actorKey: "delivery",
      kind: "envelope_send_failed",
      detail: error.slice(0, 500),
    });
  },
});

export const applyDropboxSignWebhook = internalMutation({
  args: { rawJson: v.string() },
  handler: async (ctx, { rawJson }) => {
    if (rawJson.length > 2_000_000) return;

    let parsed: {
      event?: {
        event_type?: string;
        signature_request?: {
          signature_request_id?: string;
          signatures?: Array<{
            signer_email_address?: string;
            status_code?: string;
            signed_at?: number | null;
          }>;
        };
      };
    };
    try {
      parsed = JSON.parse(rawJson) as typeof parsed;
    } catch {
      return;
    }

    const ev = parsed.event;
    const type = ev?.event_type;
    const sr = ev?.signature_request;
    const requestId = sr?.signature_request_id;
    if (!requestId) return;

    const env = await ctx.db
      .query("signatureEnvelopes")
      .withIndex("by_external", (q) => q.eq("externalRequestId", requestId))
      .first();
    if (!env) return;

    const now = Date.now();
    await appendSignatureAudit(ctx, {
      envelopeId: env._id,
      actorType: "provider",
      actorKey: "dropbox_sign",
      kind: "webhook_received",
      detail: type?.slice(0, 200),
    });

    const sigs = sr?.signatures ?? [];
    for (const item of sigs) {
      const em = normalizeEmail(item.signer_email_address ?? "");
      if (!em) continue;
      const rows = await ctx.db
        .query("signatureSigners")
        .withIndex("by_envelope_order", (q) => q.eq("envelopeId", env._id))
        .collect();
      const hit = rows.find((r) => r.emailNormalized === em);
      if (!hit) continue;
      const code = (item.status_code ?? "").toLowerCase();
      if (code === "signed") {
        let signedAt = now;
        const ts = item.signed_at;
        if (ts != null) {
          const n = typeof ts === "number" ? ts : parseInt(String(ts), 10);
          if (!Number.isNaN(n)) {
            signedAt = n < 1e12 ? n * 1000 : n;
          }
        }
        await ctx.db.patch(hit._id, {
          status: "signed",
          signedAt,
        });
      } else if (code === "declined") {
        await ctx.db.patch(hit._id, {
          status: "declined",
          declinedAt: now,
        });
      } else if (
        code === "awaiting_signature" ||
        code === "on_hold"
      ) {
        await ctx.db.patch(hit._id, { status: "email_sent" });
      }
    }

    if (
      type === "signature_request_all_signed" ||
      type === "signature_request_downloadable"
    ) {
      await ctx.db.patch(env._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
      await appendSignatureAudit(ctx, {
        envelopeId: env._id,
        actorType: "provider",
        actorKey: "dropbox_sign",
        kind: "envelope_completed",
      });
      return;
    }

    if (type === "signature_request_declined") {
      await ctx.db.patch(env._id, {
        status: "declined",
        updatedAt: now,
      });
      return;
    }

    if (type === "signature_request_canceled") {
      await ctx.db.patch(env._id, {
        status: "voided",
        updatedAt: now,
      });
    }

    const allSigned = (
      await ctx.db
        .query("signatureSigners")
        .withIndex("by_envelope_order", (q) => q.eq("envelopeId", env._id))
        .collect()
    ).every((s) => s.status === "signed");
    if (allSigned && env.status !== "completed") {
      await ctx.db.patch(env._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
      await appendSignatureAudit(ctx, {
        envelopeId: env._id,
        actorType: "system",
        actorKey: "derived",
        kind: "envelope_completed",
        detail: "all signers marked signed",
      });
    }
  },
});
