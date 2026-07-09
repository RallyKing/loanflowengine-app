import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { normalizeUsername } from "@/lib/auth/normalizeUsername";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { assertSameSiteRequest } from "@/lib/middleware/sameOrigin";
import { validatePlaintextPasswordPolicy } from "@/lib/auth/passwordPolicy";
import { verifyPassword } from "@/lib/security/argon2";
import { randomUrlToken, sha256HexFromUtf8 } from "@/lib/security/tokens";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  signSession,
  checkCredentials,
  newViewerSession,
} from "@/lib/sessionAuth";
import { tryResolveE2EWorkspaceSession } from "@/lib/testing/resolveE2ELogin";
import { readObservabilityFromHeaders } from "@/lib/observability/serverContext";
import { obsLogWithTracing } from "@/lib/observability/logger";
import { diagTrace } from "@/lib/diagnostics/structuredTrace";
import {
  tryParseAuthBridgeStructuredError,
  authBridgeStructuredError,
  type AuthBridgeErrorStage,
} from "@/lib/auth/authStructuredError";
import {
  httpStatusForAuthBridgeStage,
  publicCodeForAuthBridgeStage,
  publicMessageForAuthBridgeStage,
} from "@/lib/auth/authBridgeHttpMapping";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

function secureCookie(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.PW_ALLOW_INSECURE_SESSION_COOKIE !== "1"
  );
}

/**
 * Login attempts per username+IP are normally capped (see `bridgedRateConsume`).
 * Set `AUTH_RELAX_LOGIN_RATE_LIMIT=1` on the server (e.g. Vercel) while load-testing.
 * Local dev skips this limit unless `AUTH_ENFORCE_LOGIN_RATE_LIMIT=1`.
 * `PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT=1` keeps E2E from burning the shared cap.
 */
function shouldSkipLoginAttemptRateLimit(): boolean {
  if (process.env.PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT === "1") return true;
  if (process.env.AUTH_RELAX_LOGIN_RATE_LIMIT === "1") return true;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_ENFORCE_LOGIN_RATE_LIMIT !== "1"
  ) {
    return true;
  }
  return false;
}

/**
 * During controlled testing, use the same relax flag to bypass temporary lockouts
 * so repeated automation runs do not wedge the shared auth account.
 */
function shouldSkipTemporaryAccountLockout(): boolean {
  return shouldSkipLoginAttemptRateLimit();
}

export async function POST(req: Request) {
  const trace = obsLogWithTracing(readObservabilityFromHeaders(req.headers));
  let username = "";
  let password = "";
  let rememberMe = false;
  try {
    const body = (await req.json()) as {
      username?: unknown;
      password?: unknown;
      rememberMe?: unknown;
    };
    username = typeof body.username === "string" ? body.username : "";
    password = typeof body.password === "string" ? body.password : "";
    rememberMe = body.rememberMe === true;
  } catch {
    trace.warn("auth.login", { outcome: "bad_body" });
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", error: "Invalid request body." },
      { status: 400 },
    );
  }
  if (!username || !password) {
    trace.info("auth.login", { outcome: "validation" });
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: "Username and password are required." },
      { status: 400 },
    );
  }

  /** Canonical identifier for internal auth (username or email): trim + lowercase. All Convex lookups use this. */
  const normalizedLoginIdentifier = normalizeUsername(username);

  const loginPwPolicy = validatePlaintextPasswordPolicy(password);
  if (loginPwPolicy) {
    trace.info("auth.login", { outcome: "password_policy" });
    return NextResponse.json(
      { ok: false, code: "VALIDATION", error: loginPwPolicy },
      { status: 400 },
    );
  }

  try {
    assertSameSiteRequest(req);
  } catch {
    trace.warn("auth.login", { outcome: "csrf_rejected" });
    return NextResponse.json(
      { ok: false, code: "CSRF", error: "Rejected cross-site request." },
      { status: 403 },
    );
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;

  /** Legacy env + E2E catalog: HMAC session (tooling only). */
  try {
    if (
      process.env.APP_AUTH_USERNAME?.trim() &&
      process.env.APP_AUTH_PASSWORD !== undefined &&
      process.env.APP_AUTH_PASSWORD !== ""
    ) {
      if (checkCredentials(username, password)) {
        const viewer = newViewerSession();
        const token = await signSession(viewer);
        const res = NextResponse.json({ ok: true as const });
        res.cookies.set(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: secureCookie(),
          maxAge: Math.floor(30 * 24 * 60 * 60),
        });
        res.cookies.delete(CSRF_COOKIE_NAME);
        return res;
      }
    }
  } catch {
    /* continue to internal auth */
  }

  const e2eViewer = tryResolveE2EWorkspaceSession(username, password);
  if (e2eViewer) {
    const token = await signSession(e2eViewer);
    const res = NextResponse.json({ ok: true as const });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: secureCookie(),
      maxAge: Math.floor(30 * 24 * 60 * 60),
    });
    res.cookies.delete(CSRF_COOKIE_NAME);
    return res;
  }

  const client = getConvexHttpClient();

  try {
    if (!shouldSkipLoginAttemptRateLimit()) {
      const rlProof = signBridge(`login-rl:${normalizedLoginIdentifier}:${ip || "na"}`);
      const rl = await client.mutation(api.auth.loginBridge.bridgedRateConsume, {
        key: `login:${normalizedLoginIdentifier}:${ip || "na"}`,
        maxPerWindow: 30,
        bridgePayload: rlProof.bridgePayload,
        bridgeProof: rlProof.bridgeProof,
      });
      if (!rl.ok) {
        trace.warn("auth.login", { outcome: "rate_limited" });
        return NextResponse.json(
          { ok: false, code: "RATE_LIMITED", error: "Too many attempts. Try again later." },
          { status: 429 },
        );
      }
    }

    const lookupProof = signBridge(`login-lookup:${normalizedLoginIdentifier}`);
    const record = await client.query(api.auth.loginBridge.loginLookup, {
      username: normalizedLoginIdentifier,
      bridgePayload: lookupProof.bridgePayload,
      bridgeProof: lookupProof.bridgeProof,
    });

    if (!record.found) {
      trace.info("auth.login", { outcome: "invalid_credentials" });
      diagTrace("AUTH_TRACE", { step: "loginLookup", found: false });
      const auditProof = signBridge(`login-audit-unknown:${normalizedLoginIdentifier}`);
      try {
        await client.mutation(api.auth.loginBridge.appendLoginAuditBridged, {
          normalizedUsernameAttempt: normalizedLoginIdentifier,
          outcome: "failure",
          reason: "unknown_user",
          userAgent: ua,
          ipHint: ip || undefined,
          bridgePayload: auditProof.bridgePayload,
          bridgeProof: auditProof.bridgeProof,
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        { ok: false, code: "INVALID_CREDENTIALS", error: "Incorrect username or password." },
        { status: 401 },
      );
    }

    if (
      !shouldSkipTemporaryAccountLockout() &&
      record.accountLockedUntilMs &&
      record.accountLockedUntilMs > Date.now()
    ) {
      return NextResponse.json(
        { ok: false, code: "ACCOUNT_LOCKED", error: "Account is temporarily locked." },
        { status: 403 },
      );
    }

    const EMAIL_VERIFICATION_BLOCKS_LOGIN = false;
    if (
      EMAIL_VERIFICATION_BLOCKS_LOGIN &&
      record.emailVerificationRequired &&
      !record.emailVerifiedAt
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "EMAIL_UNVERIFIED",
          error: "Verify your email before signing in.",
        },
        { status: 403 },
      );
    }

    const okPass = await verifyPassword(record.passwordHash, password, {
      username,
      normalizedUsername: normalizedLoginIdentifier,
      userId: String(record.userId),
      userFound: true,
      passwordHashPresent: Boolean(record.passwordHash?.trim?.()),
      authBridgeSecretPresent: Boolean(process.env.AUTH_BRIDGE_SECRET?.trim()),
    });
    if (!okPass) {
      diagTrace("AUTH_TRACE", {
        step: "verifyPassword",
        ok: false,
        userId: String(record.userId),
      });
      const failProof = signBridge(`login-fail:${record.userId}`);
      try {
        await client.mutation(api.auth.loginBridge.recordFailedLoginBridged, {
          userId: record.userId,
          bridgePayload: failProof.bridgePayload,
          bridgeProof: failProof.bridgeProof,
        });
        const auditProof = signBridge(`login-audit-badpass:${record.userId}`);
        await client.mutation(api.auth.loginBridge.appendLoginAuditBridged, {
          userId: record.userId,
          outcome: "failure",
          reason: "bad_password",
          userAgent: ua,
          ipHint: ip || undefined,
          bridgePayload: auditProof.bridgePayload,
          bridgeProof: auditProof.bridgeProof,
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        { ok: false, code: "INVALID_CREDENTIALS", error: "Incorrect username or password." },
        { status: 401 },
      );
    }

    const clearProof = signBridge(`login-clear:${record.userId}`);
    try {
      await client.mutation(api.auth.loginBridge.clearFailedLoginsBridged, {
        userId: record.userId,
        bridgePayload: clearProof.bridgePayload,
        bridgeProof: clearProof.bridgeProof,
      });
    } catch {
      /* non-fatal */
    }

    if (!record.defaultOrganizationId) {
      const auditProof = signBridge(`login-audit-noorg:${record.userId}`);
      try {
        await client.mutation(api.auth.loginBridge.appendLoginAuditBridged, {
          userId: record.userId,
          outcome: "failure",
          reason: "no_default_org",
          userAgent: ua,
          ipHint: ip || undefined,
          bridgePayload: auditProof.bridgePayload,
          bridgeProof: auditProof.bridgeProof,
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        { ok: false, code: "NO_ORG", error: "Account is not attached to a workspace." },
        { status: 403 },
      );
    }

    const gateProof = signBridge(`login-gate:${record.userId}`);
    const gate = await client.query(api.auth.loginBridge.assertUserWorkspaceActive, {
      userId: record.userId,
      bridgePayload: gateProof.bridgePayload,
      bridgeProof: gateProof.bridgeProof,
    });
    if (!gate.ok) {
      if (gate.code === "NO_MEMBER" || gate.code === "INACTIVE") {
        const repairProof = signBridge(`login-repair-membership:${record.userId}`);
        void client
          .mutation(api.auth.loginBridge.repairDefaultOrgMembershipBridged, {
            userId: record.userId,
            bridgePayload: repairProof.bridgePayload,
            bridgeProof: repairProof.bridgeProof,
          })
          .catch(() => {});
      } else {
        const auditProof = signBridge(`login-audit-gate:${record.userId}:${gate.code}`);
        try {
          await client.mutation(api.auth.loginBridge.appendLoginAuditBridged, {
            userId: record.userId,
            outcome: "failure",
            reason: gate.code,
            userAgent: ua,
            ipHint: ip || undefined,
            bridgePayload: auditProof.bridgePayload,
            bridgeProof: auditProof.bridgeProof,
          });
        } catch {
          /* best-effort */
        }
        return NextResponse.json(
          {
            ok: false,
            code: "ACCOUNT_DISABLED",
            error: "This workspace account is deactivated or not provisioned.",
          },
          { status: 403 },
        );
      }
    }

    const publicId = randomUrlToken(18);
    const rawSecret = randomUrlToken(32);
    const csrfRaw = randomUrlToken(32);
    const tokenHash = sha256HexFromUtf8(rawSecret);
    const csrfTokenHash = sha256HexFromUtf8(csrfRaw);

    const sessProof = signBridge(
      `create-session:${record.userId}:${publicId}:${tokenHash}:${record.credentialVersion}`,
    );
    try {
      await client.mutation(api.auth.loginBridge.createSessionBridged, {
        userId: record.userId,
        publicId,
        tokenHash,
        csrfTokenHash,
        rememberMe,
        credentialVersion: record.credentialVersion,
        userAgent: ua,
        ipHint: ip || undefined,
        bridgePayload: sessProof.bridgePayload,
        bridgeProof: sessProof.bridgeProof,
      });
    } catch (sessionErr) {
      if (tryParseAuthBridgeStructuredError(sessionErr)) {
        throw sessionErr;
      }
      throw authBridgeStructuredError("sessionIssue", {
        reason:
          sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
        username,
        normalizedUsername: normalizedLoginIdentifier,
        userId: String(record.userId),
        authBridgeSecretPresent: Boolean(process.env.AUTH_BRIDGE_SECRET?.trim()),
      });
    }

    const cookieMaxAge = rememberMe ? 30 * 24 * 60 * 60 : 2 * 24 * 60 * 60;
    const res = NextResponse.json({ ok: true as const });
    res.cookies.set(SESSION_COOKIE_NAME, `${publicId}.${rawSecret}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: secureCookie(),
      maxAge: cookieMaxAge,
    });
    res.cookies.set(CSRF_COOKIE_NAME, csrfRaw, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: secureCookie(),
      maxAge: cookieMaxAge,
    });
    trace.info("auth.login", { outcome: "success_internal" });
    diagTrace("AUTH_TRACE", {
      step: "session_created",
      ok: true,
      userId: String(record.userId),
    });
    const okAuditProof = signBridge(`login-audit-ok:${record.userId}`);
    try {
      await client.mutation(api.auth.loginBridge.appendLoginAuditBridged, {
        userId: record.userId,
        outcome: "success",
        userAgent: ua,
        ipHint: ip || undefined,
        bridgePayload: okAuditProof.bridgePayload,
        bridgeProof: okAuditProof.bridgeProof,
      });
    } catch {
      /* best-effort */
    }
    return res;
  } catch (err) {
    const structured = tryParseAuthBridgeStructuredError(err);
    const rawLog = structured ?? {
      message: err instanceof Error ? err.message : String(err),
    };
    trace.error("auth.login", { outcome: "server_error", error: rawLog });
    console.error(JSON.stringify(rawLog));
    if (structured && typeof structured.stage === "string") {
      const stage = structured.stage as AuthBridgeErrorStage;
      return NextResponse.json(
        {
          ok: false,
          code: publicCodeForAuthBridgeStage(stage, structured),
          error: publicMessageForAuthBridgeStage(stage, structured),
          details: structured,
        },
        { status: httpStatusForAuthBridgeStage(stage, structured) },
      );
    }
    const msg = err instanceof Error ? err.message : "Sign-in unavailable.";
    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        error: msg,
      },
      { status: 500 },
    );
  }
}
