import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import { signBridge } from "@/lib/auth/bridgeProof";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionAuth";
import { parseInternalSessionCookie } from "@/lib/session/loadViewer";
import {
  IMPERSONATION_COOKIE_NAME,
  parseImpersonationCookie,
} from "@/lib/superuserImpersonation";

export const runtime = "nodejs";

const textEncoder = new TextEncoder();

async function sha256HexFromUtf8(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secureCookie(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.PW_ALLOW_INSECURE_SESSION_COOKIE !== "1"
  );
}

export async function POST() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  const impRaw = store.get(IMPERSONATION_COOKIE_NAME)?.value;
  const parsed = parseInternalSessionCookie(raw);
  const impParsed = parseImpersonationCookie(impRaw);
  if (parsed) {
    if (impParsed) {
      try {
        const authSessionTokenHash = await sha256HexFromUtf8(parsed.secret);
        const stopBridge = signBridge(`impersonation:stop:${parsed.publicId}`);
        await getConvexHttpClient().mutation(
          api.superuserImpersonation.lifecycle.stop,
          {
            authSessionPublicId: parsed.publicId,
            authSessionTokenHash,
            impersonationPublicId: impParsed.publicId,
            nowMs: Date.now(),
            bridgePayload: stopBridge.bridgePayload,
            bridgeProof: stopBridge.bridgeProof,
            reason: "logout",
          },
        );
      } catch {
        /* best-effort */
      }
    }
    try {
      const proof = signBridge(`logout:${parsed.publicId}`);
      await getConvexHttpClient().mutation(api.auth.loginBridge.revokeSessionBridged, {
        publicId: parsed.publicId,
        reason: "logout",
        nowMs: Date.now(),
        bridgePayload: proof.bridgePayload,
        bridgeProof: proof.bridgeProof,
      });
    } catch {
      /* still clear cookies */
    }
  }
  const res = NextResponse.json({ ok: true as const });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: secureCookie(),
  });
  res.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: secureCookie(),
  });
  res.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: secureCookie(),
  });
  return res;
}
