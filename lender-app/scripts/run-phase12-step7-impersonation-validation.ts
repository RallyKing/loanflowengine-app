#!/usr/bin/env npx tsx
/**
 * Phase 12.2 Step 7 — live production superuser impersonation validation.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";
const E2E_ORG = "mx7bfa58ty1svx65bt3h8v6v5186kke9";
const PROD_BASE =
  process.env.PROD_SCROLL_BASE?.trim() ||
  process.env.PW_BASE_URL?.trim() ||
  process.env.PROD_APP_URL?.trim() ||
  "https://dlcfunds.vercel.app";

function loadEnvFile(name: string, env: Record<string, string>) {
  const p = join(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const k = t.slice(0, i).trim();
    if (!env[k]) env[k] = v;
  }
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  loadEnvFile(".env.local", env);
  loadEnvFile(".env.testing", env);
  return env;
}

function convexRun(fn: string, args: Record<string, unknown>) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(process.execPath, [bin, "run", "--prod", fn, JSON.stringify(args)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "convex run failed");
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function parseSetCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=\s*[^;]+=)/);
  return parts.map((p) => p.split(";")[0]?.trim()).filter(Boolean).join("; ");
}

async function loginProd(username: string, password: string): Promise<string> {
  const origin = PROD_BASE.replace(/\/$/, "");
  const res = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ username, password, rememberMe: true }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  const cookie = parseSetCookie(setCookie);
  if (!cookie.includes("dlc_session=")) {
    throw new Error("Login succeeded but no session cookie returned.");
  }
  return cookie;
}

async function apiPost(
  path: string,
  cookie: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown>; setCookie: string | null }> {
  const origin = PROD_BASE.replace(/\/$/, "");
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

async function convexProbe(
  organizationId: string,
  memberUserKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const args = JSON.stringify({ organizationId, memberUserKey });
  const result = spawnSync(
    process.execPath,
    [bin, "run", "--prod", "superuserImpersonation/lifecycle:probeTenantWrite", args],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status === 0) return { ok: true };
  const err = result.stderr || result.stdout || "";
  return { ok: false, error: err };
}

function mergeCookie(base: string, setCookie: string | null): string {
  const add = parseSetCookie(setCookie);
  if (!add) return base;
  const map = new Map<string, string>();
  for (const part of `${base}; ${add}`.split(";")) {
    const p = part.trim();
    const eq = p.indexOf("=");
    if (eq > 0) map.set(p.slice(0, eq), p);
  }
  return [...map.values()].join("; ");
}

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  const username =
    env.PROD_LOGIN_EMAIL ||
    env.APP_AUTH_PRIMARY_EMAIL ||
    env.APP_AUTH_USERNAME ||
    "joshua@directlendingconnection.com";
  const password =
    env.PROD_LOGIN_PASSWORD ||
    env.APP_AUTH_PRIMARY_PASSWORD ||
    env.APP_AUTH_PASSWORD;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");
  if (!password) throw new Error("APP_AUTH_PASSWORD missing");

  const operatorAudit = convexRun("auth/operatorAudit:verifySuperuserIsolation", {
    adminSecret,
  });

  let liveProof: Record<string, unknown> = {
    skipped: true,
    reason: "login_not_attempted",
  };

  try {
    let cookie = await loginProd(username, password);

    const startReadonly = await apiPost("/api/auth/impersonation/start", cookie, {
      targetOrganizationId: E2E_ORG,
      mode: "readonly",
    });
    cookie = mergeCookie(cookie, startReadonly.setCookie);

    const probeReadonly = await convexProbe(E2E_ORG, "ts719yfyv2b6020avvctpw0ns586exm6");

    await apiPost("/api/auth/impersonation/stop", cookie);

    const startOperator = await apiPost("/api/auth/impersonation/start", cookie, {
      targetOrganizationId: E2E_ORG,
      mode: "operator",
    });
    cookie = mergeCookie(cookie, startOperator.setCookie);

    const probeOperator = await convexProbe(E2E_ORG, "ts719yfyv2b6020avvctpw0ns586exm6");

    const stop = await apiPost("/api/auth/impersonation/stop", cookie);
    cookie = mergeCookie(cookie, stop.setCookie);

    const status = await fetch(`${PROD_BASE.replace(/\/$/, "")}/api/auth/impersonation/status`, {
      headers: { Cookie: cookie },
    });
    const statusJson = (await status.json()) as Record<string, unknown>;

    liveProof = {
      startReadonly: { status: startReadonly.status, body: startReadonly.json },
      probeReadonlyBlocked:
        !probeReadonly.ok &&
        (probeReadonly.error?.includes("IMPERSONATION_READ_ONLY") ?? false),
      startOperator: { status: startOperator.status, body: startOperator.json },
      probeOperatorAllowed: probeOperator.ok,
      stop: { status: stop.status, body: stop.json },
      statusAfterStop: statusJson,
      tenantRestored:
        (statusJson.homeOrganizationId as string) === JOSHUA_ORG &&
        statusJson.active === null,
    };
  } catch (e) {
    liveProof = {
      skipped: false,
      error: e instanceof Error ? e.message : String(e),
      note: "Operator audit still validates readonly/operator isolation without HTTP session.",
    };
  }

  const report = {
    generatedAt: Date.now(),
    prodBase: PROD_BASE,
    operatorIsolationAudit: operatorAudit,
    liveProof,
    joshuaOrgId: JOSHUA_ORG,
    e2eOrgId: E2E_ORG,
  };

  writeFileSync(
    join(reportsDir, "phase12-step7-impersonation-validation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
