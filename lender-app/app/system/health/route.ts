import { NextResponse } from "next/server";
import { parseConvexPublicUrl } from "@/lib/convexPublicUrl";
import { obsLogWithTracing } from "@/lib/observability/logger";
import { readObservabilityFromHeaders } from "@/lib/observability/serverContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness + lightweight runtime signal for probes. **Public** (no session).
 * No secrets; safe for load balancers and uptime robots.
 */
export async function GET(req: Request) {
  const ctx = readObservabilityFromHeaders(req.headers);
  const log = obsLogWithTracing(ctx);
  log.info("health.check", { path: "/system/health" });

  const convexParsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);

  return NextResponse.json(
    {
      status: "ok",
      service: "lender-app",
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      build: {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        vercelEnv: process.env.VERCEL_ENV ?? null,
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
      runtime: {
        uptimeSeconds:
          typeof process !== "undefined" ? Math.round(process.uptime()) : null,
        /** Baked at build time on Vercel — compare to your Convex dashboard deployment. */
        convexPublicUrlOk: convexParsed.ok,
        convexPublicHost: convexParsed.ok
          ? new URL(convexParsed.href).hostname
          : null,
      },
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
