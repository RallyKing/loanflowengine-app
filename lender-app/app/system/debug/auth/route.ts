import { NextResponse } from "next/server";
import { canAccessObservabilityDebug } from "@/lib/observability/debugGate";
import { buildServerDebugSnapshotV1 } from "@/lib/observability/debugSnapshot";
import { obsLogWithTracing } from "@/lib/observability/logger";
import { getRequestObservabilityContext } from "@/lib/observability/serverContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Session diagnostics (redacted). Requires **session** (middleware) and
 * **safe debug** (`DLC_SAFE_DEBUG=1` / non-prod) or `DLC_OBSERVABILITY_DEBUG_SECRET` header.
 */
export async function GET(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const obs = await getRequestObservabilityContext();
  const log = obsLogWithTracing(obs);
  const snap = await buildServerDebugSnapshotV1();
  log.info("debug.auth.snapshot", {
    cookiePresent: snap.session.cookiePresent,
    viewerPresent: Boolean(snap.session.viewer),
  });

  return NextResponse.json(
    {
      kind: "auth",
      ...snap,
      notes: [
        "Values are redacted. Full emails and tokens never appear here.",
        "Pair requestId with server logs (DLC_OBS prefix) and Convex ORG_PERM_TRACE when enabled.",
      ],
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
