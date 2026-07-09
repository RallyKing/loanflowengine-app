import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { normalizeUsername } from "@/lib/auth/normalizeUsername";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { randomUrlToken, sha256HexFromUtf8 } from "@/lib/security/tokens";
import { readObservabilityFromHeaders } from "@/lib/observability/serverContext";
import { obsLogWithTracing } from "@/lib/observability/logger";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

/** Always 200 for anti-enumeration. Optional `devResetToken` in non-production when `AUTH_DEBUG_RESET=1`. */
export async function POST(req: Request) {
  const trace = obsLogWithTracing(readObservabilityFromHeaders(req.headers));
  let username = "";
  try {
    const body = (await req.json()) as { username?: unknown };
    username = typeof body.username === "string" ? body.username : "";
  } catch {
    return NextResponse.json({ ok: true as const });
  }
  const normalizedLoginIdentifier = normalizeUsername(username);
  try {
    assertSameSiteRequest(req);
  } catch {
    return NextResponse.json({ ok: true as const });
  }
  if (!normalizedLoginIdentifier) {
    return NextResponse.json({ ok: true as const });
  }
  const raw = randomUrlToken(32);
  const tokenHash = sha256HexFromUtf8(raw);
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  try {
    const bridge = signBridge(`reset-req:${normalizedLoginIdentifier}:${tokenHash}`);
    await getConvexHttpClient().mutation(api.auth.passwordReset.requestPasswordReset, {
      username: normalizedLoginIdentifier,
      tokenHash,
      expiresAtMs,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
      ipHint: clientIp(req) || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace.warn("auth.forgot_password", {
      outcome: "convex_or_bridge_failed",
      error: msg.slice(0, 200),
    });
    return NextResponse.json({ ok: true as const });
  }
  const debug =
    process.env.AUTH_DEBUG_RESET === "1" && process.env.NODE_ENV !== "production";
  return NextResponse.json(
    debug ? { ok: true as const, devResetToken: raw } : { ok: true as const },
  );
}
