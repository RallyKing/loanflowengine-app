import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canAccessObservabilityDebug } from "@/lib/observability/debugGate";
import { buildServerDebugSnapshotV1 } from "@/lib/observability/debugSnapshot";
import { LENDER_HOST_ORG_COOKIE } from "@/lib/hostOrgCookie";
import { obsLogWithTracing } from "@/lib/observability/logger";
import { getRequestObservabilityContext } from "@/lib/observability/serverContext";
import { parseOrganizationId } from "@/lib/orgIdValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Org resolution **hints** visible on the server (cookies + session). `localStorage`
 * resolution happens only in the browser and is listed as a client-only step.
 */
export async function GET(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const obs = await getRequestObservabilityContext();
  const log = obsLogWithTracing(obs);
  const base = await buildServerDebugSnapshotV1();

  const cookieStore = await cookies();
  const hostRaw = cookieStore.get(LENDER_HOST_ORG_COOKIE)?.value ?? null;
  const hostParsed = parseOrganizationId(hostRaw);

  log.info("debug.orgs.snapshot", {
    hostCookiePresent: base.orgHints.hostOrgCookiePresent,
    hostOrgResolved: Boolean(hostParsed),
  });

  return NextResponse.json(
    {
      kind: "orgs",
      ...base,
      orgResolution: {
        serverVisibleSteps: [
          {
            step: 1,
            name: "host_mapped_cookie",
            description: `${LENDER_HOST_ORG_COOKIE} set by middleware on custom hostnames`,
            active: Boolean(hostParsed),
          },
          {
            step: 2,
            name: "session_viewer_organizationId",
            description: "Cookie session profile org (redacted below)",
            active: Boolean(base.session.viewer),
          },
          {
            step: 3,
            name: "client_local_storage",
            description:
              'Browser `lender.activeOrganizationId` — not visible server-side; use DevTools + `/system/debug/auth`',
            active: null,
          },
        ],
        hostOrgIdParseable: Boolean(hostParsed),
      },
      notes: [
        "Permission evaluation occurs in Convex (`organizationRbac`, `effectivePermissions`). Enable ORG_PERM_TELEMETRY=1 on Convex for step logs.",
      ],
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
