import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { validatePlaintextPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { hashPassword } from "@/lib/security/argon2";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";
import { parseOrganizationId } from "@/lib/orgIdValidation";

export const runtime = "nodejs";

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

  let body: { organizationId?: unknown; targetUserKey?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const organizationId = parseOrganizationId(
    typeof body.organizationId === "string" ? body.organizationId : "",
  );
  const targetUserKey =
    typeof body.targetUserKey === "string" ? body.targetUserKey.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!organizationId || !targetUserKey || !password) {
    return NextResponse.json(
      { ok: false, error: "organizationId, targetUserKey, and password are required." },
      { status: 400 },
    );
  }

  const sessionOrg = parseOrganizationId(session.organizationId ?? null);
  if (!sessionOrg || sessionOrg !== organizationId) {
    return NextResponse.json(
      { ok: false, error: "Workspace mismatch for signed-in session." },
      { status: 403 },
    );
  }

  const pwErr = validatePlaintextPasswordPolicy(password);
  if (pwErr) {
    return NextResponse.json({ ok: false, error: pwErr }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    await getConvexHttpClient().mutation(api.teamManagement.adminSetMemberPassword, {
      organizationId,
      targetUserKey,
      passwordHash,
      actorUserKey: session.userKey,
    });
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
