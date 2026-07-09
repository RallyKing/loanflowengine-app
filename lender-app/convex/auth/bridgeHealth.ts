import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertAuthBridgeProofWithSkew } from "./bridge";

const SKEW_MS = 120_000;

/** Operator probe: confirm Convex-side AUTH_BRIDGE_SECRET fingerprint (never returns raw secret). */
export const secretFingerprint = query({
  args: {
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (_ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const secret = process.env.AUTH_BRIDGE_SECRET?.trim() ?? "";
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(secret),
    );
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return {
      deployment: process.env.CONVEX_CLOUD_URL ?? null,
      secretConfigured: secret.length >= 24,
      secretLength: secret.length,
      sha256Prefix: secret.length >= 24 ? hex.slice(0, 16) : null,
    };
  },
});
