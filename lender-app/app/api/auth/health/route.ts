import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { authBridgeSecretSha256Prefix } from "@/lib/auth/bridgeSecretFingerprint";

export const runtime = "nodejs";

/**
 * Lightweight auth surface probe for deploy alignment (Convex URL, bundle identity).
 * GET only — no secrets.
 */
export async function GET() {
  let loginRouteSha256 = "unavailable";
  try {
    const path = join(process.cwd(), "app", "api", "auth", "login", "route.ts");
    const src = readFileSync(path, "utf8");
    loginRouteSha256 = createHash("sha256").update(src).digest("hex");
  } catch {
    /* ignore — e.g. serverless bundle layout differs */
  }

  return NextResponse.json({
    ok: true as const,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    nextPublicConvexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? null,
    authBridgeSecretSha256Prefix: authBridgeSecretSha256Prefix(
      process.env.AUTH_BRIDGE_SECRET,
    ),
    authBridgeSecretConfigured:
      (process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0) >= 24,
    loginRouteSha256,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
