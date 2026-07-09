import { createHash } from "node:crypto";

/** Non-reversible fingerprint for AUTH_BRIDGE_SECRET parity checks (Vercel ↔ Convex). */
export function authBridgeSecretSha256Prefix(secret: string | undefined): string | null {
  const s = secret?.trim();
  if (!s || s.length < 24) return null;
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
