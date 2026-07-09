/**
 * HMAC bridge between Next.js (trusted server) and Convex mutations.
 * Set the same `AUTH_BRIDGE_SECRET` on Vercel and Convex (>= 24 chars).
 */

import { authBridgeStructuredError } from "../../lib/auth/authStructuredError";

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Validates HMAC proof and a monotonic timestamp prefix so payloads cannot be replayed indefinitely.
 * Payload must start with `timestamp|` (unix ms).
 */
export async function assertAuthBridgeProofWithSkew(
  payload: string,
  proofHex: string,
  maxSkewMs: number,
): Promise<void> {
  const secretPresent = Boolean(process.env.AUTH_BRIDGE_SECRET?.trim());
  const firstPipe = payload.indexOf("|");
  if (firstPipe <= 0) {
    throw authBridgeStructuredError("bridgeProofVerify", {
      reason: "invalid_bridge_payload_shape",
      authBridgeSecretPresent: secretPresent,
    });
  }
  const ts = Number(payload.slice(0, firstPipe));
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxSkewMs) {
    throw authBridgeStructuredError("bridgeProofVerify", {
      reason: "bridge_payload_expired_or_skewed",
      authBridgeSecretPresent: secretPresent,
      skewMs: maxSkewMs,
      payloadTs: ts,
      nowMs: Date.now(),
    });
  }
  await assertAuthBridgeProof(payload, proofHex);
}

export async function assertAuthBridgeProof(
  payload: string,
  proofHex: string,
): Promise<void> {
  const secret = process.env.AUTH_BRIDGE_SECRET?.trim() ?? "";
  if (secret.length < 24) {
    throw authBridgeStructuredError("bridgeProofVerify", {
      reason: "auth_bridge_secret_too_short_or_missing",
      authBridgeSecretPresent: secret.length > 0,
      secretLength: secret.length,
    });
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!timingSafeEqualHex(hex, proofHex)) {
    throw authBridgeStructuredError("bridgeProofVerify", {
      reason: "invalid_bridge_proof_hmac",
      authBridgeSecretPresent: true,
    });
  }
}
