import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { validatePlaintextPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { hashPassword } from "@/lib/security/argon2";
import { sha256HexFromUtf8 } from "@/lib/security/tokens";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let token = "";
  let newPassword = "";
  try {
    const body = (await req.json()) as { token?: unknown; newPassword?: unknown };
    token = typeof body.token === "string" ? body.token : "";
    newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", error: "Invalid request body." },
      { status: 400 },
    );
  }
  try {
    assertSameSiteRequest(req);
  } catch {
    return NextResponse.json(
      { ok: false, code: "CSRF", error: "Rejected cross-site request." },
      { status: 403 },
    );
  }
  if (!token) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: "Reset token is required." },
      { status: 400 },
    );
  }
  const resetPwError = validatePlaintextPasswordPolicy(newPassword);
  if (resetPwError) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: resetPwError },
      { status: 400 },
    );
  }
  const tokenHash = sha256HexFromUtf8(token);
  try {
    const newPasswordHash = await hashPassword(newPassword);
    const bridge = signBridge(`reset-complete:${tokenHash}`);
    await getConvexHttpClient().mutation(api.auth.passwordReset.completePasswordReset, {
      tokenHash,
      newPasswordHash,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
      nowMs: Date.now(),
    });
    return NextResponse.json({ ok: true as const });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("INVALID_OR_EXPIRED_TOKEN")) {
      return NextResponse.json(
        { ok: false, code: "INVALID_RESET_TOKEN", error: "This reset link is invalid or expired." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", error: msg },
      { status: 500 },
    );
  }
}
