/**
 * Workspace session: internal Convex-backed cookie (preferred) or legacy HMAC cookie
 * for tooling / E2E. Profile fields align with `convex/viewerIdentity` env fallback
 * when JWT auth is absent.
 */

import type { ViewerSession, WorkspaceRole } from "@/lib/session/types";
import { normalizeUsername } from "@/lib/auth/normalizeUsername";
import { loadViewerFromCookies } from "@/lib/session/loadViewer";

export type { ViewerSession, WorkspaceRole } from "@/lib/session/types";

export const SESSION_COOKIE_NAME = "dlc_session";
export const CSRF_COOKIE_NAME = "dlc_csrf";
/** Session lifetime — legacy/E2E signed cookie max-age helper. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function readPlatformViewerProfileFromEnv(): Omit<
  ViewerSession,
  "issuedAt" | "expiresAt"
> {
  const userKey = process.env.APP_AUTH_USER_KEY?.trim();
  const email = process.env.APP_AUTH_USER_EMAIL?.trim();
  const fullName = process.env.APP_AUTH_USER_FULL_NAME?.trim();
  const organizationId = process.env.APP_AUTH_ORGANIZATION_ID?.trim();
  const organizationName = process.env.APP_AUTH_ORGANIZATION_NAME?.trim();
  const roleRaw = process.env.APP_AUTH_WORKSPACE_ROLE?.trim().toLowerCase();
  if (!userKey || !email || !fullName || !organizationId || !organizationName) {
    throw new Error(
      "Set APP_AUTH_USER_KEY, APP_AUTH_USER_EMAIL, APP_AUTH_USER_FULL_NAME, APP_AUTH_ORGANIZATION_ID, and APP_AUTH_ORGANIZATION_NAME for the primary session profile.",
    );
  }
  const workspaceRole: WorkspaceRole =
    roleRaw === "member" ? "workspace:member" : "workspace:admin";
  return {
    userKey,
    email,
    fullName,
    organizationId,
    organizationName,
    workspaceRole,
  };
}

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return new Uint8Array(sig);
}

export async function signSession(session: ViewerSession): Promise<string> {
  const payload = bytesToBase64Url(textEncoder.encode(JSON.stringify(session)));
  const sig = await hmacSha256(payload);
  return `${payload}.${bytesToBase64Url(sig)}`;
}

/** Validates internal session cookie, then legacy HMAC cookie. */
export async function verifySession(
  token: string | undefined,
  impersonationToken?: string | undefined,
): Promise<ViewerSession | null> {
  return loadViewerFromCookies(token, impersonationToken);
}

export function newViewerSessionFromProfile(
  profile: Omit<ViewerSession, "issuedAt" | "expiresAt">,
): ViewerSession {
  const now = Date.now();
  return {
    ...profile,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
}

export function newViewerSession(): ViewerSession {
  return newViewerSessionFromProfile(readPlatformViewerProfileFromEnv());
}

const textEncoder2 = new TextEncoder();

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aa = textEncoder2.encode(a);
  const bb = textEncoder2.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export function checkCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUser =
    process.env.APP_AUTH_PRIMARY_EMAIL?.trim() ??
    process.env.APP_AUTH_USERNAME?.trim() ??
    "";
  const expectedPass =
    process.env.APP_AUTH_PRIMARY_PASSWORD ??
    process.env.APP_AUTH_PASSWORD ??
    "";
  if (!expectedUser || !expectedPass) {
    throw new Error(
      "Primary auth credentials are not configured. Set APP_AUTH_PRIMARY_EMAIL / APP_AUTH_PRIMARY_PASSWORD or APP_AUTH_USERNAME / APP_AUTH_PASSWORD in `.env.local`.",
    );
  }
  return (
    timingSafeEqualStrings(normalizeUsername(username), normalizeUsername(expectedUser)) &&
    timingSafeEqualStrings(password, expectedPass)
  );
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
