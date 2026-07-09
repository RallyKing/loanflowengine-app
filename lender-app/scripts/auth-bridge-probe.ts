/**
 * Verifies Next-side AUTH_BRIDGE_SECRET signs payloads Convex accepts (same secret on Convex).
 * Run: npm run live:auth-bridge
 *
 * Uses a harmless loginLookup for a synthetic username (expect found: false).
 */
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { signBridge } from "../lib/auth/bridgeProof";
import { authBridgeSecretSha256Prefix } from "../lib/auth/bridgeSecretFingerprint";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal(): void {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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

async function main() {
  loadEnvLocal();
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  const parsed = parseConvexPublicUrl(raw);
  if (!parsed.ok) {
    console.error(
      "live:auth-bridge — NEXT_PUBLIC_CONVEX_URL missing or invalid (set in .env.local or shell).",
    );
    process.exit(1);
  }
  const secretLen = process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0;
  if (secretLen < 24) {
    console.error(
      "live:auth-bridge — AUTH_BRIDGE_SECRET must be ≥24 chars (Next + Convex, same value).",
    );
    process.exit(1);
  }

  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };
  const client = new ConvexHttpClient(parsed.href);
  const username = `__bridge_probe_${Date.now()}__`;
  const normalizedUsername = normalizeUsername(username);
  const bridge = signBridge(`login-lookup:${normalizedUsername}`);

  const localFp = authBridgeSecretSha256Prefix(process.env.AUTH_BRIDGE_SECRET);
  console.log(`local AUTH_BRIDGE_SECRET sha256 prefix: ${localFp ?? "missing"}`);

  try {
    const fpProof = signBridge("bridge-health-fingerprint");
    const remoteFp = await client.query(api.auth.bridgeHealth.secretFingerprint, {
      bridgePayload: fpProof.bridgePayload,
      bridgeProof: fpProof.bridgeProof,
    });
    console.log(
      `remote AUTH_BRIDGE_SECRET sha256 prefix: ${remoteFp.sha256Prefix ?? "missing"}`,
    );
    if (localFp && remoteFp.sha256Prefix && localFp !== remoteFp.sha256Prefix) {
      console.error(
        "live:auth-bridge FAIL — AUTH_BRIDGE_SECRET fingerprint mismatch (Vercel ↔ Convex).",
      );
      process.exit(1);
    }
    const out = await client.query(api.auth.loginBridge.loginLookup, {
      username: normalizedUsername,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
    });
    if (!out || typeof out !== "object" || !("found" in out)) {
      console.error("live:auth-bridge — unexpected response shape");
      process.exit(1);
    }
    if (out.found !== false) {
      console.error(
        "live:auth-bridge — unexpected: probe username matched a user (use a fresh probe id).",
      );
      process.exit(1);
    }
    console.log(
      `live:auth-bridge OK — Convex accepted bridge proof (${parsed.kind} ${parsed.href})`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("live:auth-bridge FAIL —", msg);
    const parsed =
      typeof msg === "string"
        ? (() => {
            try {
              return JSON.parse(msg) as unknown;
            } catch {
              return null;
            }
          })()
        : null;
    if (parsed && typeof parsed === "object") {
      console.error(
        "live:auth-bridge structured (raw JSON):",
        JSON.stringify(parsed),
      );
    }
    if (/Invalid bridge proof|Bridge payload expired|AUTH_BRIDGE_SECRET/i.test(msg)) {
      console.error(
        "Hint: Set the same AUTH_BRIDGE_SECRET on this machine as on the Convex deployment (Dashboard → Settings → Environment Variables), then redeploy Convex if needed.",
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
