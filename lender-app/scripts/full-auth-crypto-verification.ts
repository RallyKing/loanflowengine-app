/**
 * Full auth cryptographic verification:
 * - Argon2id hash generation, embedded salt (hashes differ), verify pass/fail
 * - Bridge HMAC: Node crypto.createHmac vs Web Crypto (same path as Convex)
 * - Convex bridge acceptance (loginLookup)
 * - Signup test user (or reuse), password compare against stored hash
 * - Session create (bridged) + validateSession + touchSession token rotation
 * - Optional: admin password set revokes sessions (credential / session invalidation)
 *
 * Env: NEXT_PUBLIC_CONVEX_URL, AUTH_BRIDGE_SECRET (≥24, same as Convex).
 * Optional: DATA_MIGRATION_ADMIN_SECRET for session-revocation step.
 *
 * Usage (from lender-app):
 *   npx tsx scripts/full-auth-crypto-verification.ts
 *   npx tsx scripts/full-auth-crypto-verification.ts --local-only
 *
 * `--local-only` runs Argon2 + bridge HMAC parity only (no Convex / HTTP).
 */
import { createHmac, webcrypto } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { validateStoredArgon2PasswordHash } from "../lib/auth/passwordPolicy";
import { signBridge } from "../lib/auth/bridgeProof";
import { hashPassword, verifyPassword } from "../lib/security/argon2";
import { randomUrlToken, sha256HexFromUtf8 } from "../lib/security/tokens";
import { loadAdminSecret } from "./lib/migrationOperatorEnv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TEST_USERNAME_RAW = "authtest";
const TEST_PASSWORD = "simple@123";
const TEST_ORG_NAME = "Auth Crypto Verification";

function loadEnvFile(envPath: string): void {
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

function loadOperatorEnv(): void {
  loadEnvFile(join(root, ".env.local"));
  loadEnvFile(join(root, ".env.convex.prod"));
  loadEnvFile(join(root, ".env"));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

/** Same HMAC construction as convex/auth/bridge.ts (Web Crypto). */
async function hmacSha256WebCryptoHex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await webcrypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hmacNodeCreateHmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

async function section(name: string, fn: () => Promise<void>): Promise<void> {
  process.stderr.write(`\n── ${name} ──\n`);
  await fn();
  process.stderr.write(`  ok\n`);
}

async function main(): Promise<void> {
  loadOperatorEnv();
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    checks: [] as string[],
  };
  const ok = (s: string) => (report.checks as string[]).push(s);

  await section("Argon2id: hash, salt, verify", async () => {
    const h1 = await hashPassword(TEST_PASSWORD);
    const h2 = await hashPassword(TEST_PASSWORD);
    assert(h1 !== h2, "two hashes should differ (unique salt per hash)");
    assert(
      h1.startsWith("$argon2id$"),
      "expected argon2id modular crypt format from hashPassword",
    );
    assert(
      validateStoredArgon2PasswordHash(h1) === null,
      "stored hash validator should accept app hash",
    );
    assert(await verifyPassword(h1, TEST_PASSWORD), "verify hash1 + correct password");
    assert(await verifyPassword(h2, TEST_PASSWORD), "verify hash2 + correct password");
    assert(!(await verifyPassword(h1, "wrong")), "wrong password must fail");
    assert(!(await verifyPassword("not-a-valid-hash", TEST_PASSWORD)), "bad hash must fail");
    ok("argon2_hash_salt_verify");
  });

  await section("Bridge HMAC: Node createHmac vs Web Crypto (algorithm parity)", async () => {
    const paritySecret =
      "parity-test-secret-32chars-min!!"; /* fixed; not a production secret */
    const payload = `${Date.now()}|deadbeef01|credential-parity`;
    const a = hmacNodeCreateHmacHex(payload, paritySecret);
    const b = await hmacSha256WebCryptoHex(payload, paritySecret);
    assert(a === b, `HMAC hex mismatch: Node=${a.slice(0, 16)}… web=${b.slice(0, 16)}…`);
    ok("bridge_hmac_node_vs_subtle");
  });

  if (process.argv.includes("--local-only")) {
    report.mode = "local-only";
    report.finishedAt = new Date().toISOString();
    report.summary = { passwordLength: TEST_PASSWORD.length };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const secret = process.env.AUTH_BRIDGE_SECRET?.trim() ?? "";
  if (secret.length < 24) {
    console.error(
      "AUTH_BRIDGE_SECRET (≥24 chars), identical on Convex and this machine, is required for live bridge + signup tests.",
    );
    console.error("Checked .env.local, .env.convex.prod, .env — set there or export in shell.");
    process.exit(1);
  }

  const rawUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const parsed = parseConvexPublicUrl(rawUrl);
  if (!parsed.ok) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL missing or invalid");
  }
  const client = new ConvexHttpClient(parsed.href);

  await section("Convex: loginLookup accepts bridge proof", async () => {
    assert(secret.length >= 24, "AUTH_BRIDGE_SECRET required");
    const probe = `__crypto_probe_${Date.now()}__`;
    const bridge = signBridge(`login-lookup:${normalizeUsername(probe)}`);
    const out = await client.query(api.auth.loginBridge.loginLookup, {
      username: probe,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
    });
    assert(out.found === false, "probe user must not exist");
    ok("convex_bridge_loginLookup");
  });

  const normalizedUser = normalizeUsername(TEST_USERNAME_RAW);

  await section("Convex: ensure signup test user", async () => {
    assert(secret.length >= 24, "AUTH_BRIDGE_SECRET required");
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const bridge = signBridge(`signup:${normalizedUser}:${TEST_ORG_NAME}`);
    try {
      await client.mutation(api.auth.signup.signup, {
        username: normalizedUser,
        passwordHash,
        organizationName: TEST_ORG_NAME,
        bridgePayload: bridge.bridgePayload,
        bridgeProof: bridge.bridgeProof,
        ipHint: "verify-script",
      });
      ok("signup_created_user");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("USERNAME_TAKEN")) {
        ok("signup_username_already_existed");
        return;
      }
      throw e;
    }
  });

  let userId!: string;
  let credentialVersion!: number;

  await section("Convex: loginLookup + local password verify", async () => {
    const bridge = signBridge(`login-lookup:${normalizedUser}`);
    const record = await client.query(api.auth.loginBridge.loginLookup, {
      username: normalizedUser,
      bridgePayload: bridge.bridgePayload,
      bridgeProof: bridge.bridgeProof,
    });
    if (!record.found) {
      throw new Error("authtest must exist after signup");
    }
    userId = record.userId as string;
    credentialVersion = record.credentialVersion;
    const passOk = await verifyPassword(record.passwordHash, TEST_PASSWORD);
    assert(passOk, "verifyPassword(stored hash, plain) must succeed");
    ok("lookup_and_verify_password");
  });

  let publicId!: string;
  let tokenHash!: string;
  let rawSecret!: string;

  await section("Convex: bridged session create + validateSession", async () => {
    publicId = randomUrlToken(18);
    rawSecret = randomUrlToken(32);
    tokenHash = sha256HexFromUtf8(rawSecret);
    const csrfRaw = randomUrlToken(32);
    const csrfTokenHash = sha256HexFromUtf8(csrfRaw);
    const sessProof = signBridge(
      `create-session:${userId}:${publicId}:${tokenHash}:${credentialVersion}`,
    );
    await client.mutation(api.auth.loginBridge.createSessionBridged, {
      userId: userId as Id<"authUsers">,
      publicId,
      tokenHash,
      csrfTokenHash,
      rememberMe: false,
      credentialVersion,
      userAgent: "full-auth-crypto-verification",
      ipHint: "verify-script",
      bridgePayload: sessProof.bridgePayload,
      bridgeProof: sessProof.bridgeProof,
    });
    const now = Date.now();
    const v = await client.query(api.auth.sessionQueries.validateSession, {
      publicId,
      tokenHash,
      nowMs: now,
    });
    assert(v.ok === true, `validateSession expected ok, got ${JSON.stringify(v)}`);
    ok("session_create_validate");
  });

  await section("Convex: touchSession token rotation + grace", async () => {
    const newRaw = randomUrlToken(32);
    const newHash = sha256HexFromUtf8(newRaw);
    const now = Date.now();
    await client.mutation(api.auth.sessionQueries.touchSession, {
      publicId,
      tokenHash,
      nowMs: now,
      newTokenHash: newHash,
      rotationGraceMs: 120_000,
    });
    const vOld = await client.query(api.auth.sessionQueries.validateSession, {
      publicId,
      tokenHash,
      nowMs: now + 1_000,
    });
    assert(vOld.ok === true, "old token should validate during rotation grace");
    const vNew = await client.query(api.auth.sessionQueries.validateSession, {
      publicId,
      tokenHash: newHash,
      nowMs: now + 2_000,
    });
    assert(vNew.ok === true, "new token should validate after rotation");
    tokenHash = newHash;
    rawSecret = newRaw;
    ok("session_rotation_grace");
  });

  const adminSecret = loadAdminSecret();
  if (adminSecret) {
    await section("Convex: password rotation revokes sessions (admin)", async () => {
      const newHashStored = await hashPassword(TEST_PASSWORD);
      await client.mutation(api.auth.migrationSetPassword.setAuthUserPassword, {
        adminSecret,
        username: normalizedUser,
        passwordHash: newHashStored,
      });
      const v = await client.query(api.auth.sessionQueries.validateSession, {
        publicId,
        tokenHash,
        nowMs: Date.now(),
      });
      assert(
        v.ok === false && "code" in v && v.code === "SESSION_REVOKED",
        `expected SESSION_REVOKED after admin password set, got ${JSON.stringify(v)}`,
      );
      const bridge = signBridge(`login-lookup:${normalizedUser}`);
      const record = await client.query(api.auth.loginBridge.loginLookup, {
        username: normalizedUser,
        bridgePayload: bridge.bridgePayload,
        bridgeProof: bridge.bridgeProof,
      });
      if (!record.found) {
        throw new Error("user still exists after password set");
      }
      assert(
        await verifyPassword(record.passwordHash, TEST_PASSWORD),
        "new stored hash must verify same plaintext password",
      );
      ok("admin_password_bump_revokes_session");
    });
  } else {
    process.stderr.write(
      "\n── Skip admin password rotation (no DATA_MIGRATION_ADMIN_SECRET) ──\n",
    );
  }

  await section("HTTP POST /api/auth/login (same-origin headers)", async () => {
    const origin =
      process.env.VERIFY_LOGIN_ORIGIN?.trim() || "http://localhost:3004";
    const url = `${origin.replace(/\/$/, "")}/api/auth/login`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          username: TEST_USERNAME_RAW,
          password: TEST_PASSWORD,
          rememberMe: false,
        }),
      });
    } catch (e) {
      process.stderr.write(
        `  skip: fetch failed (${e instanceof Error ? e.message : String(e)}) — start Next on ${origin} or set VERIFY_LOGIN_ORIGIN\n`,
      );
      ok("http_login_skipped_no_server");
      return;
    }
    const body = (await res.json()) as { ok?: boolean; code?: string; error?: string };
    if (!res.ok || !body.ok) {
      throw new Error(
        `login HTTP failed ${res.status}: ${JSON.stringify(body)} (origin=${origin})`,
      );
    }
    ok("http_login_ok");
  });

  report.finishedAt = new Date().toISOString();
  report.summary = {
    username: normalizedUser,
    passwordLength: TEST_PASSWORD.length,
    convex: `${parsed.kind} ${parsed.href}`,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
