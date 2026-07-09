import { NextResponse } from "next/server";
import { canAccessObservabilityDebug } from "@/lib/observability/debugGate";
import {
  clearFailureReplays,
  listFailureReplays,
  pushFailureReplay,
} from "@/lib/observability/failureReplayStore";
import { getRequestObservabilityContext } from "@/lib/observability/serverContext";
import { redactDeep } from "@/lib/observability/redact";
import { obsLogWithTracing } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Bounded in-memory failure capture for staging / controlled prod (`DLC_FAILURE_REPLAY=1`). */
export async function GET(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }
  const obs = await getRequestObservabilityContext();
  obsLogWithTracing(obs).info("replay.list", { count: listFailureReplays().length });
  return NextResponse.json(
    { items: listFailureReplays(), requestId: obs.requestId },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }
  const obs = await getRequestObservabilityContext();
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const raw = redactDeep(body) as Record<string, unknown>;
  const source =
    typeof raw.source === "string" ? raw.source : "client.manual";
  const errorCode =
    typeof raw.errorCode === "string" ? raw.errorCode : undefined;
  const summary =
    typeof raw.summary === "string" ? raw.summary : undefined;
  const row = pushFailureReplay({
    source,
    errorCode,
    summary,
    payload: raw.payload ?? raw,
  });
  obsLogWithTracing(obs).info("replay.ingest", {
    replayId: row?.id ?? null,
    source,
  });
  return NextResponse.json(
    { ok: true, id: row?.id ?? null, requestId: obs.requestId },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(req: Request) {
  if (!canAccessObservabilityDebug(req)) {
    return new NextResponse(null, { status: 404 });
  }
  clearFailureReplays();
  return NextResponse.json({ ok: true }, { status: 200 });
}
