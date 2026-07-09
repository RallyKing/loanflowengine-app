import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import {
  requireSuperuserImpersonationSession,
  secureCookie,
} from "@/lib/auth/impersonationApiSession";
import {
  formatImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/superuserImpersonation";

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

  let targetOrganizationId = "";
  let mode: "readonly" | "operator" = "readonly";
  try {
    const body = (await req.json()) as {
      targetOrganizationId?: unknown;
      mode?: unknown;
    };
    targetOrganizationId =
      typeof body.targetOrganizationId === "string"
        ? body.targetOrganizationId.trim()
        : "";
    mode = body.mode === "operator" ? "operator" : "readonly";
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!targetOrganizationId) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: "targetOrganizationId is required." },
      { status: 400 },
    );
  }

  const { session } = gate;
  const nowMs = Date.now();
  const bridge = signBridge(
    `impersonation:start:${session.authSessionPublicId}:${targetOrganizationId}:${mode}`,
  );

  try {
    const result = await getConvexHttpClient().mutation(
      api.superuserImpersonation.lifecycle.start,
      {
        authSessionPublicId: session.authSessionPublicId,
        authSessionTokenHash: session.authSessionTokenHash,
        targetOrganizationId: targetOrganizationId as Id<"organizations">,
        mode,
        nowMs,
        bridgePayload: bridge.bridgePayload,
        bridgeProof: bridge.bridgeProof,
      },
    );

    const res = NextResponse.json({
      ok: true as const,
      targetOrganizationId: result.targetOrganizationId,
      targetOrganizationName: result.targetOrganizationName,
      mode: result.mode,
      expiresAt: result.expiresAt,
    });

    const maxAge = Math.max(1, Math.floor((result.expiresAt - nowMs) / 1000));
    res.cookies.set(
      IMPERSONATION_COOKIE_NAME,
      formatImpersonationCookie(result.publicId, result.secret),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie(),
        maxAge,
      },
    );

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("FORBIDDEN")) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "Superuser impersonation denied." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", error: msg },
      { status: 500 },
    );
  }
}
