/**
 * Debug helper: Convex loginLookup error detail (run with prod NEXT_PUBLIC in env).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { normalizeUsername } from "../lib/auth/normalizeUsername.js";
import { signBridge } from "../lib/auth/bridgeProof.js";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl.js";
import { api } from "../convex/_generated/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal(): void {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

async function run(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const bridgeLen = process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0;
  console.log(
    JSON.stringify({
      NEXT_PUBLIC_CONVEX_URL: url ?? null,
      AUTH_BRIDGE_SECRET_length: bridgeLen,
    }),
  );

  const parsed = parseConvexPublicUrl(url);
  if (!parsed.ok || bridgeLen < 24) {
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);
  const username = `__bridge_trace_${Date.now()}__`;
  const b = signBridge(`login-lookup:${normalizeUsername(username)}`);

  try {
    const out = await client.query(api.auth.loginBridge.loginLookup, {
      username,
      bridgePayload: b.bridgePayload,
      bridgeProof: b.bridgeProof,
    });
    console.log("OK", out);
  } catch (e: unknown) {
    const err = e as {
      message?: string;
      data?: unknown;
      cause?: unknown;
    };
    console.log(
      JSON.stringify(
        {
          message: err?.message,
          data: err?.data,
          cause: err?.cause,
          name: err instanceof Error ? err.name : null,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

void run();
