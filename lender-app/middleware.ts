import { NextRequest, NextResponse } from "next/server";
import {
  HEADER_CORRELATION_ID,
  HEADER_REQUEST_ID,
} from "@/lib/observability/constants";
import { obsLogWithTracing } from "@/lib/observability/logger";
import {
  configuredCanonicalHostname,
  fetchConvexOrgIdForHostname,
} from "@/lib/middlewareHostMapping";
import { LENDER_HOST_ORG_COOKIE } from "@/lib/hostOrgCookie";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";
import { parseCompanySlugPortalPath } from "@/lib/clientPortalUrl";
import { fetchPortalLinkRoute } from "@/lib/middlewarePortalRouting";

/**
 * Routes that must NOT require authentication. Everything else under the
 * matcher requires a valid session cookie.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/session-expired",
  "/terms",
  "/privacy",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/signup",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/health",
  "/_next",
  "/favicon",
  "/manifest",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon",
  "/apple-icon",
  "/pwa-icon",
  "/sw.js",
  "/robots",
  /** Synthetic health for probes (no session, no secrets). */
  "/system/health",
  /** Minimal metrics text for scrapers (no secrets). */
  "/api/observability/metrics",
  /** Local NDJSON debug ingest (dev only; route handler rejects prod). */
  /** Client portal (external users; auth is portal-specific, not workspace cookie). */
  "/portal",
  /** Intake share links must work without workspace session. */
  "/share",
  /** Stage 2 — public intake form gateway (tokenized apply links). */
  "/apply",
  /** File Task direct-upload gateway (tokenized, no CRM chrome). */
  "/upload",
  /** Multi-task client portal bundle links. */
  "/client-portal",
  /** Secure lender delivery gateway. */
  "/lender-delivery",
  /** Optional passcode / OTP verification gateway for portal links. */
  "/public",
  /** JWKS for Convex customJwt verification — must be fetchable without a session. */
  "/.well-known",
];
/**
 * Auth-only pages: signed-in users hitting these get bounced to the app so
 * they don't see the login screen behind their session.
 */
const AUTH_PAGE_PREFIXES = [
  "/login",
  "/sign-in",
  "/signup",
  "/sign-up",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function applyHostOrgCookie(res: NextResponse, hostOrgId: string | null) {
  if (hostOrgId) {
    res.cookies.set(LENDER_HOST_ORG_COOKIE, hostOrgId, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 400,
    });
  } else {
    res.cookies.delete(LENDER_HOST_ORG_COOKIE);
  }
  return res;
}

function withObservability(
  res: NextResponse,
  requestId: string,
  correlationId: string,
  pathname: string,
): NextResponse {
  res.headers.set(HEADER_REQUEST_ID, requestId);
  res.headers.set(HEADER_CORRELATION_ID, correlationId);
  if (
    pathname === "/api/convex/token" ||
    pathname.startsWith("/api/auth/")
  ) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
  }
  return res;
}

function nextWithRequestObservability(
  req: NextRequest,
  requestId: string,
  correlationId: string,
): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(HEADER_REQUEST_ID, requestId);
  requestHeaders.set(HEADER_CORRELATION_ID, correlationId);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default async function middleware(req: NextRequest) {
  const incomingId = req.headers.get(HEADER_REQUEST_ID)?.trim();
  const incomingCorr = req.headers.get(HEADER_CORRELATION_ID)?.trim();
  const requestId =
    incomingId && incomingId.length > 0 ? incomingId : crypto.randomUUID();
  const correlationId =
    incomingCorr && incomingCorr.length > 0 ? incomingCorr : requestId;

  const { pathname, search } = req.nextUrl;
  const trace = obsLogWithTracing({ requestId, correlationId });

  const hostname =
    req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const canon = configuredCanonicalHostname();
  let hostOrgId: string | null = null;
  if (hostname && canon && hostname !== canon) {
    hostOrgId = await fetchConvexOrgIdForHostname(hostname);
  }

  if (pathname === "/.well-known/jwks.json" || pathname.startsWith("/.well-known/")) {
    return withObservability(
      applyHostOrgCookie(
        nextWithRequestObservability(req, requestId, correlationId),
        hostOrgId,
      ),
      requestId,
      correlationId,
      pathname,
    );
  }

  const companyPortal = parseCompanySlugPortalPath(pathname);
  if (companyPortal) {
    const route = await fetchPortalLinkRoute(companyPortal.token);
    const rewriteUrl = req.nextUrl.clone();
    if (route?.linkType === "lender") {
      rewriteUrl.pathname = `/lender-delivery/${encodeURIComponent(companyPortal.token)}`;
      rewriteUrl.searchParams.delete("companySlug");
    } else {
      rewriteUrl.pathname = `/client-portal/${encodeURIComponent(companyPortal.token)}`;
      rewriteUrl.searchParams.set("companySlug", companyPortal.companySlug);
    }
    trace.debug("auth.middleware", {
      outcome: "company_portal_rewrite",
      companySlug: companyPortal.companySlug,
      linkType: route?.linkType ?? "client",
    });
    return withObservability(
      applyHostOrgCookie(NextResponse.rewrite(rewriteUrl), hostOrgId),
      requestId,
      correlationId,
      pathname,
    );
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  // Signed-in users on an auth page: bounce to the app so the login UI never
  // sits over a live session.
  if (session && isAuthPage(pathname)) {
    return withObservability(
      applyHostOrgCookie(
        NextResponse.redirect(new URL("/tasks", req.url)),
        hostOrgId,
      ),
      requestId,
      correlationId,
      pathname,
    );
  }

  if (isPublic(pathname)) {
    trace.debug("auth.middleware", {
      outcome: "public",
      pathname,
      sessionState: session ? "present" : "absent",
    });
    return withObservability(
      applyHostOrgCookie(
        nextWithRequestObservability(req, requestId, correlationId),
        hostOrgId,
      ),
      requestId,
      correlationId,
      pathname,
    );
  }

  if (!session) {
    trace.info("auth.middleware", {
      outcome: "redirect_login",
      pathname,
      sessionState: "absent",
    });
    const loginUrl = new URL("/login", req.url);
    if (pathname && pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search ?? ""}`);
    }
    return withObservability(
      applyHostOrgCookie(NextResponse.redirect(loginUrl), hostOrgId),
      requestId,
      correlationId,
      pathname,
    );
  }

  trace.debug("auth.middleware", {
    outcome: "ok",
    pathname,
    sessionState: "present",
    workspaceRole: session.workspaceRole,
  });

  return withObservability(
    applyHostOrgCookie(
      nextWithRequestObservability(req, requestId, correlationId),
      hostOrgId,
    ),
    requestId,
    correlationId,
    pathname,
  );
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
