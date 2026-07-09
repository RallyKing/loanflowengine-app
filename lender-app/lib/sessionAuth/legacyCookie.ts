import type { ViewerSession } from "@/lib/session/types";

function getSecret(): string {
  const s = process.env.APP_AUTH_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error(
      "APP_AUTH_SESSION_SECRET is missing or too short (need ≥32 chars). Set it in `.env.local`.",
    );
  }
  return s;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 ? "=".repeat(4 - (padded.length % 4)) : "";
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(message),
  );
  return new Uint8Array(sig);
}

function normalizeLegacySessionPayload(
  raw: Record<string, unknown>,
): ViewerSession | null {
  if (
    typeof raw.userKey !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.fullName !== "string" ||
    typeof raw.expiresAt !== "number"
  ) {
    return null;
  }
  if (
    typeof raw.organizationId === "string" &&
    typeof raw.workspaceRole === "string"
  ) {
    if (
      raw.workspaceRole !== "workspace:admin" &&
      raw.workspaceRole !== "workspace:member"
    ) {
      return null;
    }
    if (typeof raw.organizationName !== "string") return null;
    return {
      userKey: raw.userKey,
      email: raw.email,
      fullName: raw.fullName,
      organizationId: raw.organizationId,
      organizationName: raw.organizationName,
      workspaceRole: raw.workspaceRole,
      issuedAt: typeof raw.issuedAt === "number" ? raw.issuedAt : 0,
      expiresAt: raw.expiresAt,
    };
  }
  const legacyOrgId = raw.orgId;
  const legacyName = raw.orgName;
  const legacyRole = raw.orgRole;
  if (
    typeof legacyOrgId !== "string" ||
    typeof legacyName !== "string" ||
    (legacyRole !== "org:admin" && legacyRole !== "org:member")
  ) {
    return null;
  }
  return {
    userKey: raw.userKey,
    email: raw.email,
    fullName: raw.fullName,
    organizationId: legacyOrgId,
    organizationName: legacyName,
    workspaceRole:
      legacyRole === "org:admin" ? "workspace:admin" : "workspace:member",
    issuedAt: typeof raw.issuedAt === "number" ? raw.issuedAt : 0,
    expiresAt: raw.expiresAt,
  };
}

/**
 * Legacy HMAC-signed JSON cookie (`payload.signature`).
 */
export async function verifyLegacySession(
  token: string | undefined,
): Promise<ViewerSession | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let provided: Uint8Array;
  try {
    provided = base64UrlToBytes(sigB64);
  } catch {
    return null;
  }
  let expected: Uint8Array;
  try {
    expected = await hmacSha256(payload);
  } catch {
    return null;
  }
  if (!timingSafeEqualBytes(provided, expected)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(
      textDecoder.decode(base64UrlToBytes(payload)),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
    return null;
  }
  const norm = normalizeLegacySessionPayload(parsed);
  if (!norm) return null;
  if (!norm.userKey) return null;
  return norm;
}
