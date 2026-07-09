import { NextResponse } from "next/server";
import {
  requireSuperuserImpersonationSession,
} from "@/lib/auth/impersonationApiSession";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperuserImpersonationSession();
  if (!gate.ok) return gate.response;

  const { viewer } = gate.session;
  return NextResponse.json({
    ok: true as const,
    canSuperuserImpersonate: viewer.canSuperuserImpersonate === true,
    active: viewer.impersonation
      ? {
          targetOrganizationId: viewer.impersonation.targetOrganizationId,
          targetOrganizationName: viewer.impersonation.targetOrganizationName,
          mode: viewer.impersonation.mode,
          expiresAt: viewer.impersonation.expiresAt,
        }
      : null,
    homeOrganizationId: viewer.homeOrganizationId ?? viewer.organizationId,
    homeOrganizationName: viewer.homeOrganizationName ?? viewer.organizationName,
  });
}
