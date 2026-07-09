import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import {
  requireSuperuserImpersonationSession,
  secureCookie,
} from "@/lib/auth/impersonationApiSession";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/superuserImpersonation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameSiteRequest(req);
  } catch {
    return NextResponse.json(
      { ok: false, code: "CSRF", error: "Rejected cross-site request." },
      { status: 403 },
    );
  }

  const gate = await requireSuperuserImpersonationSession();
  if (!gate.ok) return gate.response;

  const { session } = gate;
  const nowMs = Date.now();
  const bridge = signBridge(`impersonation:stop:${session.authSessionPublicId}`);

  try {
    const result = await getConvexHttpClient().mutation(
      api.superuserImpersonation.lifecycle.stop,
      {
        authSessionPublicId: session.authSessionPublicId,
        authSessionTokenHash: session.authSessionTokenHash,
        impersonationPublicId: session.impersonationPublicId,
        nowMs,
        bridgePayload: bridge.bridgePayload,
        bridgeProof: bridge.bridgeProof,
        reason: "stop",
      },
    );

    const res = NextResponse.json({
      ok: true as const,
      stopped: result.stopped,
      homeOrganizationId: session.viewer.homeOrganizationId ?? session.viewer.organizationId,
      homeOrganizationName:
        session.viewer.homeOrganizationName ?? session.viewer.organizationName,
    });
    res.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: secureCookie(),
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", error: msg },
      { status: 500 },
    );
  }
}
