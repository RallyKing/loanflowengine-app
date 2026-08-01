"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

type SendSigner = { name: string; email: string; orderIndex: number };

export const deliverEnvelope = internalAction({
  args: { envelopeId: v.id("signatureEnvelopes") },
  handler: async (ctx, { envelopeId }) => {
    const payload = await ctx.runQuery(
      internal.signatures.internalGetSendPayload,
      { envelopeId },
    );
    if (!payload) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error:
          "Cannot load envelope file (check storage) or envelope is not in sending state.",
      });
      return;
    }

    if (payload.provider === "internal_demo") {
      await ctx.runMutation(internal.signatures.internalApplyDemoDelivery, {
        envelopeId,
      });
      return;
    }

    const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim();
    if (!apiKey) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: "DROPBOX_SIGN_API_KEY is not configured.",
      });
      return;
    }

    let fileRes: Response;
    try {
      fileRes = await fetch(payload.downloadUrl);
    } catch (e) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: `Failed to download file from storage: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
      return;
    }
    if (!fileRes.ok) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: `Storage download failed (HTTP ${fileRes.status})`,
      });
      return;
    }

    const buf = await fileRes.arrayBuffer();
    const fd = new FormData();
    fd.append("subject", payload.title);
    if (payload.message) {
      fd.append("message", payload.message);
    }
    payload.signers.forEach((s: SendSigner, i: number) => {
      fd.append(`signers[${i}][email_address]`, s.email);
      fd.append(`signers[${i}][name]`, s.name);
    });
    if (payload.signingMode === "sequential") {
      fd.append(
        "signing_order",
        JSON.stringify(payload.signers.map((s: SendSigner) => [s.email])),
      );
    }

    const fileBlob = new Blob([buf], { type: payload.contentType });
    fd.append("file", fileBlob, payload.fileName);
    if (process.env.DROPBOX_SIGN_TEST_MODE === "1") {
      fd.append("test_mode", "1");
    }

    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    let res: Response;
    try {
      res = await fetch(
        "https://api.hellosign.com/v3/signature_request/send",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
          },
          body: fd,
        },
      );
    } catch (e) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: `HelloSign request failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
      return;
    }

    const text = await res.text();
    if (!res.ok) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: text.slice(0, 1500),
      });
      return;
    }

    let json: { signature_request?: { signature_request_id?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: "Invalid JSON from HelloSign API",
      });
      return;
    }

    const extId = json?.signature_request?.signature_request_id;
    if (!extId) {
      await ctx.runMutation(internal.signatures.internalApplySendFailure, {
        envelopeId,
        error: text.slice(0, 1500),
      });
      return;
    }

    await ctx.runMutation(internal.signatures.internalApplyDropboxSendSuccess, {
      envelopeId,
      externalRequestId: extId,
    });
  },
});
