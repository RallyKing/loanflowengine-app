import { getConvexHttpClient } from "@/lib/convexServerClient";
import { api } from "@/convex/_generated/api";
import type { ViewerSession } from "@/lib/session/types";
import { verifyLegacySession } from "@/lib/sessionAuth/legacyCookie";
import {
  IMPERSONATION_COOKIE_NAME,
  parseImpersonationCookie,
} from "@/lib/superuserImpersonation";

const textEncoder = new TextEncoder();

async function sha256HexFromUtf8(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ParsedSessionCookie = {
  publicId: string;
  secret: string;
};

/** New internal sessions: `publicId.secret` (both base64url, no dots inside). */
export function parseInternalSessionCookie(
  raw: string | undefined,
): ParsedSessionCookie | null {
  if (!raw || typeof raw !== "string") return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const publicId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!publicId || !secret || publicId.includes(".") || secret.includes(".")) {
    return null;
  }
  return { publicId, secret };
}

function viewerFromValidated(
  v: Record<string, unknown> & { ok: true },
  impersonation?: ViewerSession["impersonation"],
): ViewerSession {
  const now = Date.now();
  const homeOrganizationId = v.organizationId as string;
  const homeOrganizationName = v.organizationName as string;
  const effectiveOrgId = impersonation?.targetOrganizationId ?? homeOrganizationId;
  const effectiveOrgName =
    impersonation?.targetOrganizationName ?? homeOrganizationName;

  return {
    userKey: v.userKey as string,
    email: (v.email as string) ?? "",
    fullName: v.fullName as string,
    organizationId: effectiveOrgId,
    organizationName: effectiveOrgName,
    workspaceRole: v.workspaceRole as ViewerSession["workspaceRole"],
    issuedAt: now,
    expiresAt: impersonation?.expiresAt ?? (v.idleExpiresAtMs as number),
    displayUsername: v.displayUsername as string,
    sessionPublicId: v.publicId as string,
    isGlobalAdmin: v.isGlobalAdmin === true,
    canSuperuserImpersonate: v.canSuperuserImpersonate === true,
    homeOrganizationId,
    homeOrganizationName,
    impersonation,
  };
}

async function resolveImpersonationForSession(
  sessionPublicId: string,
  impersonationCookie: string | undefined,
): Promise<ViewerSession["impersonation"] | undefined> {
  const parsed = parseImpersonationCookie(impersonationCookie);
  if (!parsed) return undefined;
  try {
    const client = getConvexHttpClient();
    const tokenHash = await sha256HexFromUtf8(parsed.secret);
    const nowMs = Date.now();
    const validated = await client.query(
      api.superuserImpersonation.lifecycle.validateImpersonation,
      {
        publicId: parsed.publicId,
        tokenHash,
        authSessionPublicId: sessionPublicId,
        nowMs,
      },
    );
    if (!validated.ok) return undefined;
    return {
      targetOrganizationId: validated.targetOrganizationId as string,
      targetOrganizationName: validated.targetOrganizationName,
      mode: validated.mode,
      expiresAt: validated.expiresAt,
      publicId: parsed.publicId,
    };
  } catch {
    return undefined;
  }
}

/**
 * Resolve workspace viewer: Convex-backed session cookie first, then legacy HMAC cookie.
 */
export async function loadViewerFromCookies(
  sessionCookie: string | undefined,
  impersonationCookie?: string | undefined,
): Promise<ViewerSession | null> {
  const parsed = parseInternalSessionCookie(sessionCookie);
  if (parsed) {
    try {
      const client = getConvexHttpClient();
      const tokenHash = await sha256HexFromUtf8(parsed.secret);
      const nowMs = Date.now();
      const validated = await client.query(api.auth.sessionQueries.validateSession, {
        publicId: parsed.publicId,
        tokenHash,
        nowMs,
      });
      if (validated.ok) {
        try {
          await client.mutation(api.auth.sessionQueries.touchSession, {
            publicId: parsed.publicId,
            tokenHash,
            nowMs,
          });
        } catch {
          /* idle extension best-effort */
        }
        const impersonation = await resolveImpersonationForSession(
          parsed.publicId,
          impersonationCookie,
        );
        return viewerFromValidated(
          validated as Record<string, unknown> & { ok: true },
          impersonation,
        );
      }
    } catch {
      /* fall through to legacy */
    }
  }

  return verifyLegacySession(sessionCookie);
}

export { IMPERSONATION_COOKIE_NAME };
