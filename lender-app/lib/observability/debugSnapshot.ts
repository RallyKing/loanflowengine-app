import { cookies, headers } from "next/headers";
import { LENDER_HOST_ORG_COOKIE } from "@/lib/hostOrgCookie";
import { parseConvexPublicUrl } from "@/lib/convexPublicUrl";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";
import { redactViewerForObservability } from "./redact";
import { getRequestObservabilityContext } from "./serverContext";

export type DebugSnapshotV1 = {
  version: 1;
  receivedAt: string;
  tracing: Awaited<ReturnType<typeof getRequestObservabilityContext>>;
  runtime: {
    nodeEnv: string;
    nodeVersion?: string;
    region?: string | null;
  };
  session: {
    cookiePresent: boolean;
    viewer: ReturnType<typeof redactViewerForObservability> | null;
  };
  orgHints: {
    hostOrgCookiePresent: boolean;
    hostOrgCookieLength: number;
  };
  authConfig: {
    convexPublicUrlOk: boolean;
    authBridgeSecretLengthOk: boolean;
  };
};

export async function buildServerDebugSnapshotV1(): Promise<DebugSnapshotV1> {
  const tracing = await getRequestObservabilityContext();
  const h = await headers();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  const hostOrg = cookieStore.get(LENDER_HOST_ORG_COOKIE)?.value;
  const convexPublicUrlOk = parseConvexPublicUrl(
    process.env.NEXT_PUBLIC_CONVEX_URL,
  ).ok;
  const authBridgeSecretLengthOk =
    (process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0) >= 24;

  return {
    version: 1,
    receivedAt: new Date().toISOString(),
    tracing,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      nodeVersion: typeof process !== "undefined" ? process.version : undefined,
      region:
        h.get("x-vercel-region") ??
        process.env.VERCEL_REGION ??
        null,
    },
    session: {
      cookiePresent: Boolean(token),
      viewer: session ? redactViewerForObservability(session) : null,
    },
    orgHints: {
      hostOrgCookiePresent: Boolean(hostOrg),
      hostOrgCookieLength: hostOrg?.length ?? 0,
    },
    authConfig: {
      convexPublicUrlOk,
      authBridgeSecretLengthOk,
    },
  };
}
