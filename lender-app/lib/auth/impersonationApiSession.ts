import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseInternalSessionCookie } from "@/lib/session/loadViewer";
import { loadViewerFromCookies } from "@/lib/session/loadViewer";
import {
  IMPERSONATION_COOKIE_NAME,
  parseImpersonationCookie,
} from "@/lib/superuserImpersonation";
import { SESSION_COOKIE_NAME } from "@/lib/sessionAuth";

const textEncoder = new TextEncoder();

async function sha256HexFromUtf8(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function secureCookie(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.PW_ALLOW_INSECURE_SESSION_COOKIE !== "1"
  );
}

export type SuperuserApiSession = {
  viewer: NonNullable<Awaited<ReturnType<typeof loadViewerFromCookies>>>;
  authSessionPublicId: string;
  authSessionTokenHash: string;
  impersonationPublicId?: string;
};

export async function requireSuperuserImpersonationSession(): Promise<
  | { ok: true; session: SuperuserApiSession }
  | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const impRaw = store.get(IMPERSONATION_COOKIE_NAME)?.value;
  const viewer = await loadViewerFromCookies(token, impRaw);
  if (!viewer?.canSuperuserImpersonate) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "Superuser impersonation is not permitted." },
        { status: 403 },
      ),
    };
  }
  const parsed = parseInternalSessionCookie(token);
  if (!parsed) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", error: "Valid session required." },
        { status: 401 },
      ),
    };
  }
  const authSessionTokenHash = await sha256HexFromUtf8(parsed.secret);
  const impParsed = parseImpersonationCookie(impRaw);
  return {
    ok: true,
    session: {
      viewer,
      authSessionPublicId: parsed.publicId,
      authSessionTokenHash,
      impersonationPublicId: impParsed?.publicId,
    },
  };
}
