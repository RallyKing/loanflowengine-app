/**
 * Validates NEXT_PUBLIC_CONVEX_URL in .env.local (same rules as the app).
 * Run: npm run verify:env
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("Missing .env.local — copy .env.local.example and set NEXT_PUBLIC_CONVEX_URL.");
  process.exit(1);
}

const text = readFileSync(envPath, "utf8");
let value: string | undefined;
for (const line of text.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(/^NEXT_PUBLIC_CONVEX_URL\s*=\s*(.*)$/);
  if (m) {
    value = m[1]?.trim();
    let v = value ?? "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    value = v;
    break;
  }
}

const parsed = parseConvexPublicUrl(value);
if (!parsed.ok) {
  console.error(
    parsed.reason === "missing"
      ? "NEXT_PUBLIC_CONVEX_URL is missing or empty in .env.local"
      : `NEXT_PUBLIC_CONVEX_URL is invalid: ${parsed.detail ?? ""}`,
  );
  process.exit(1);
}

console.log(`verify:env OK — Convex URL (${parsed.kind}): ${parsed.href}`);

const bridgeLine = text.split("\n").find((line) =>
  /^\s*AUTH_BRIDGE_SECRET\s*=/.test(line),
);
let bridgeVal = "";
if (bridgeLine) {
  const m = bridgeLine.match(/AUTH_BRIDGE_SECRET\s*=\s*(.*)$/);
  let v = (m?.[1] ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  bridgeVal = v;
}
if (bridgeVal.length < 24) {
  console.warn(
    "verify:env — AUTH_BRIDGE_SECRET missing or < 24 chars in .env.local. Internal auth (login/signup/password reset) will 500 until set on Next.js and Convex (same value).",
  );
}

/** Banned env var name patterns (legacy auth); values are never printed. */
const BANNED_ENV_NAME_REGEXES = [/^CLERK_/i, /^NEXT_PUBLIC_CLERK/i];

const offendingEnvLines: string[] = [];
for (const line of text.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (!m) continue;
  const name = m[1] ?? "";
  for (const re of BANNED_ENV_NAME_REGEXES) {
    if (re.test(name)) {
      offendingEnvLines.push(name);
      break;
    }
  }
}
if (offendingEnvLines.length) {
  console.error(
    "verify:env FAILED — remove legacy vendor auth env vars from .env.local (names only): " +
      [...new Set(offendingEnvLines)].join(", "),
  );
  process.exit(1);
}

process.exit(0);
