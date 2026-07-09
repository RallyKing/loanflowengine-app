import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { normalizeUsername } from "@/lib/auth/normalizeUsername";
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

  let body: {
    organizationId?: unknown;
    username?: unknown;
    password?: unknown;
    assignedRoleId?: unknown;
    displayUsername?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const organizationId = parseOrganizationId(
    typeof body.organizationId === "string" ? body.organizationId : "",
  );
  const username =
    typeof body.username === "string" ? normalizeUsername(body.username) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const assignedRoleId =
    typeof body.assignedRoleId === "string" ? body.assignedRoleId.trim() : "";
  const displayUsername =
    typeof body.displayUsername === "string" ? body.displayUsername : undefined;

  if (!organizationId) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required." },
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

  if (!username || !password || !assignedRoleId) {
    return NextResponse.json(
      { ok: false, error: "username, password, and assignedRoleId are required." },
      { status: 400 },
    );
  }

  const pwErr = validatePlaintextPasswordPolicy(password);
  if (pwErr) {
    return NextResponse.json({ ok: false, error: pwErr }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const client = getConvexHttpClient();
    const out = await client.mutation(api.teamManagement.createOrgMemberUser, {
      organizationId,
      actorUserKey: session.userKey,
      username,
      passwordHash,
      assignedRoleId: assignedRoleId as Id<"organizationRoles">,
      displayUsername,
    });
    return NextResponse.json({ ok: true as const, userKey: out.userKey });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("USERNAME_TAKEN") || msg.includes("EMAIL_TAKEN")) {
      return NextResponse.json(
        { ok: false, code: "USERNAME_TAKEN", error: "That username is already in use." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
