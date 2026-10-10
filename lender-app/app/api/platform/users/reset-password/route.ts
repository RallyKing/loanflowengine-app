import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { validatePlaintextPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { hashPassword } from "@/lib/security/argon2";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

/**
 * Primary platform admin — set/reset password for any account (GHL-style).
 * Hashes server-side; never logs plaintext. Convex call is auth-bridge gated
 * (ConvexHttpClient has no JWT — do not use a spoofable memberUserKey gate alone).
 */
export async function POST(req: Request) {
  try {
    assertSameSiteRequest(req);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Rejected cross-site request." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session?.userKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: { targetUserId?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const targetUserId =
    typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!targetUserId || !password) {
    return NextResponse.json(
      { ok: false, error: "targetUserId and password are required." },
      { status: 400 },
    );
  }

  const pwErr = validatePlaintextPasswordPolicy(password);
  if (pwErr) {
    return NextResponse.json({ ok: false, error: pwErr }, { status: 400 });
  }

  try {
    // Hash in Node — never send plaintext to Convex; never echo in logs.
    const passwordHash = await hashPassword(password);
    const bridge = signBridge(
      `platform-admin-set-password:${session.userKey}:${targetUserId}`,
    );
    await getConvexHttpClient().mutation(
      api.auth.platformAccountAudit.platformAdminSetPasswordBridged,
      {
        actorUserKey: session.userKey,
        targetUserId: targetUserId as Id<"authUsers">,
        passwordHash,
        bridgePayload: bridge.bridgePayload,
        bridgeProof: bridge.bridgeProof,
      },
    );
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
