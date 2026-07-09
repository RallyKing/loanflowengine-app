import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { normalizeAuthEmail } from "@/lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "@/lib/auth/normalizeUsername";
import { validatePlaintextPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { hashPassword } from "@/lib/security/argon2";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

export async function POST(req: Request) {
  let username = "";
  let password = "";
  let organizationName = "";
  let email: string | undefined;
  let normalizedLoginIdentifier = "";
  try {
    const body = (await req.json()) as {
      username?: unknown;
      password?: unknown;
      organizationName?: unknown;
      email?: unknown;
    };
    username = typeof body.username === "string" ? body.username : "";
    password = typeof body.password === "string" ? body.password : "";
    organizationName =
      typeof body.organizationName === "string" ? body.organizationName : "";
    normalizedLoginIdentifier = normalizeUsername(username);
    email =
      typeof body.email === "string"
        ? normalizeAuthEmail(body.email)
        : undefined;
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
  if (!normalizedLoginIdentifier || !organizationName.trim() || !password) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION",
        error: "Username, password, and workspace name are required.",
      },
      { status: 400 },
    );
  }
  const passwordPolicyError = validatePlaintextPasswordPolicy(password);
  if (passwordPolicyError) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: passwordPolicyError },
      { status: 400 },
    );
  }
  try {
    const passwordHash = await hashPassword(password);
    const bridge = signBridge(
      `signup:${normalizedLoginIdentifier}:${organizationName.trim()}`,
    );
    await getConvexHttpClient().mutation(api.auth.signup.signup, {
      username,
      passwordHash,
      organizationName: organizationName.trim(),
      email,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
      ipHint: clientIp(req) || undefined,
    });
    return NextResponse.json({ ok: true as const });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EMAIL_TAKEN")) {
      return NextResponse.json(
        {
          ok: false,
          code: "EMAIL_TAKEN",
          error: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }
    if (msg.includes("USERNAME_TAKEN")) {
      return NextResponse.json(
        { ok: false, code: "USERNAME_TAKEN", error: "That username is already taken." },
        { status: 409 },
      );
    }
    if (msg.includes("RATE_LIMITED")) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "Too many sign-up attempts." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", error: msg },
      { status: 500 },
    );
  }
}
