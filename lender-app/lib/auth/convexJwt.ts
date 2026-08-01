/**
 * Native workspace JWT bridge for Convex (replaces client-supplied memberUserKey).
 * NOT Clerk — this repo migrated off Clerk; see `scripts/audit-no-clerk.mjs`.
 */
import { importPKCS8, importSPKI, exportJWK, SignJWT, type JWK } from "jose";
import type { ViewerSession } from "@/lib/session/types";

export const CONVEX_JWT_APPLICATION_ID =
  process.env.CONVEX_JWT_APPLICATION_ID?.trim() || "dlc-workspace";

/** Must match `kid` in JWKS (`exportConvexJwks`) and JWT protected header — Convex requires it. */
export const CONVEX_JWT_KID = "dlc-workspace-rs256";

export function convexJwtIssuer(): string {
  const issuer =
    process.env.CONVEX_JWT_ISSUER?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_CANONICAL_HOST?.trim();
  if (!issuer) {
    throw new Error(
      "CONVEX_JWT_ISSUER or NEXT_PUBLIC_APP_URL must be set for Convex JWT.",
    );
  }
  return issuer.startsWith("http") ? issuer.replace(/\/$/, "") : `https://${issuer}`;
}

function normalizePem(raw: string | undefined): string {
  let pem = raw?.trim() ?? "";
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1);
  }
  return pem.replace(/\\n/g, "\n");
}

function privateKeyPem(): string {
  const pem = normalizePem(process.env.CONVEX_JWT_PRIVATE_KEY_PEM);
  if (!pem) {
    throw new Error(
      "CONVEX_JWT_PRIVATE_KEY_PEM is not set (PKCS#8 PEM for RS256 signing).",
    );
  }
  return pem;
}

function publicKeyPem(): string {
  const pem = normalizePem(process.env.CONVEX_JWT_PUBLIC_KEY_PEM);
  if (!pem) {
    throw new Error(
      "CONVEX_JWT_PUBLIC_KEY_PEM is not set (SPKI PEM for JWKS publication).",
    );
  }
  return pem;
}

const TOKEN_TTL_SECONDS = 60 * 60; // 1h — Convex client refreshes via fetchAccessToken

export async function mintConvexAccessToken(
  session: Pick<
    ViewerSession,
    "userKey" | "email" | "fullName" | "organizationId" | "workspaceRole"
  >,
): Promise<string> {
  const issuer = convexJwtIssuer();
  const key = await importPKCS8(privateKeyPem(), "RS256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: session.email,
    name: session.fullName,
    activeOrganizationId: session.organizationId,
    workspaceRole: session.workspaceRole,
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      kid: CONVEX_JWT_KID,
    })
    .setSubject(session.userKey.trim())
    .setIssuer(issuer)
    .setAudience(CONVEX_JWT_APPLICATION_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function exportConvexJwks(): Promise<{ keys: JWK[] }> {
  const key = await importSPKI(publicKeyPem(), "RS256");
  const jwk = await exportJWK(key);
  return {
    keys: [{ ...jwk, alg: "RS256", use: "sig", kid: CONVEX_JWT_KID }],
  };
}

export function convexJwtConfigured(): boolean {
  return Boolean(
    process.env.CONVEX_JWT_PRIVATE_KEY_PEM?.trim() &&
      process.env.CONVEX_JWT_PUBLIC_KEY_PEM?.trim(),
  );
}
