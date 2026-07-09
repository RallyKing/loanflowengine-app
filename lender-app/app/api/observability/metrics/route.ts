import { NextResponse } from "next/server";
import { readObservabilityFromHeaders } from "@/lib/observability/serverContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Minimal Prometheus-friendly text for scrapers. **Public** — counters only, no tenant data.
 */
export async function GET(req: Request) {
  const { requestId, correlationId } = readObservabilityFromHeaders(req.headers);
  const uptime =
    typeof process !== "undefined" ? process.uptime().toFixed(3) : "0";
  const body = [
    "# HELP dlc_app_up Process is serving responses.",
    "# TYPE dlc_app_up gauge",
    "dlc_app_up 1",
    "# HELP dlc_app_uptime_seconds Node process uptime.",
    "# TYPE dlc_app_uptime_seconds gauge",
    `dlc_app_uptime_seconds ${uptime}`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      "x-correlation-id": correlationId,
    },
  });
}
