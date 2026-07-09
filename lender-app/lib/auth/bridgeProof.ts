import { createHmac, randomBytes } from "crypto";
import { authBridgeStructuredError } from "./authStructuredError";

export function makeBridgePayload(suffix: string): string {
  return `${Date.now()}|${randomBytes(8).toString("hex")}|${suffix}`;
}

export function signBridgePayload(payload: string): string {
  const secret = process.env.AUTH_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 24) {
    throw authBridgeStructuredError("bridgeProofSign", {
      reason: "auth_bridge_secret_missing_or_short",
      authBridgeSecretPresent: Boolean(secret && secret.length > 0),
      secretLength: secret?.length ?? 0,
    });
  }
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function signBridge(
  suffix: string,
): { bridgePayload: string; bridgeProof: string } {
  const bridgePayload = makeBridgePayload(suffix);
  const bridgeProof = signBridgePayload(bridgePayload);
  return { bridgePayload, bridgeProof };
}
