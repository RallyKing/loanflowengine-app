import { NextResponse } from "next/server";
import { canAccessObservabilityDebug } from "@/lib/observability/debugGate";
import { buildServerDebugSnapshotV1 } from "@/lib/observability/debugSnapshot";
import { redactDeep } from "@/lib/observability/redact";
import { getRequestObservabilityContext } from "@/lib/observability/serverContext";
import { obsLogWithTracing } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST a **redacted** client snapshot chunk; merges with `buildServerDebugSnapshotV1`.
 * For support bundles — never send tokens or raw PII.
 */
export async function POST(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }
  const obs = await getRequestObservabilityContext();
  let clientPart: unknown = {};
  try {
    clientPart = await req.json();
  } catch {
    clientPart = {};
  }
  const server = await buildServerDebugSnapshotV1();
  obsLogWithTracing(obs).info("debug.snapshot.merged", {
    hasClientPayload: clientPart != null,
  });
  return NextResponse.json(
    {
      kind: "merged",
      server,
      client: redactDeep(clientPart),
      receivedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
