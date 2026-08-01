import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/sessionAuth";
import {
  CONVEX_JWT_APPLICATION_ID,
  CONVEX_JWT_KID,
  convexJwtConfigured,
  convexJwtIssuer,
  mintConvexAccessToken,
} from "@/lib/auth/convexJwt";
import { decodeJwt } from "jose";

export const runtime = "nodejs";

/**
 * Issues a short-lived RS256 JWT for Convex after verifying the workspace session cookie.
 * Used by ConvexProviderWithAuth — never expose the signing key to the client.
 */
export async function GET() {
  if (!convexJwtConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[convex-jwt] CONVEX_JWT_PRIVATE_KEY_PEM / CONVEX_JWT_PUBLIC_KEY_PEM not set",
      );
    }
    return NextResponse.json(
      { ok: false, error: "Convex JWT is not configured on this deployment." },
      { status: 503 },
    );
  }
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const accessToken = await mintConvexAccessToken(session);
    if (process.env.NODE_ENV === "development") {
      const decoded = decodeJwt(accessToken);
      console.info("[convex-jwt] minted token", {
        sub: decoded.sub,
        iss: decoded.iss,
        aud: decoded.aud,
        kid: CONVEX_JWT_KID,
        activeOrganizationId:
          typeof decoded.activeOrganizationId === "string"
            ? decoded.activeOrganizationId
            : null,
        sessionUserKey: session.userKey,
        sessionOrganizationId: session.organizationId,
        applicationId: CONVEX_JWT_APPLICATION_ID,
        issuerEnv: convexJwtIssuer(),
      });
    }
    return NextResponse.json(
      { ok: true, token: accessToken },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token issue failed.";
    if (process.env.NODE_ENV === "development") {
      console.error("[convex-jwt] mint failed", msg);
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
