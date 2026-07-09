#!/usr/bin/env node
/**
 * Go-live confirmation: repo alignment checks + optional production health probe.
 *
 *   npm run go-live:status
 *   GO_LIVE_HEALTH_URL=https://your-domain.com/system/health npm run go-live:status
 *   GO_LIVE_SKIP_HEALTH=1 npm run go-live:status
 *   GO_LIVE_STRICT_HEALTH=1 npm run go-live:status   # fail if /system/health unreachable
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function run(cmd, argList, label) {
  const r = spawnSync(cmd, argList, {
    cwd: appRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0, code: r.status ?? -1, label, out };
}

async function probeHealth(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        detail: `non-JSON (${res.status}): ${text.slice(0, 120)}`,
      };
    }
    if (res.ok && json?.status === "ok" && json?.service === "lender-app") {
      return { ok: true, detail: json.timestamp ?? "ok" };
    }
    return { ok: false, detail: `unexpected payload (${res.status})` };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

const checks = [];

checks.push(run("npm", ["run", "verify:deployment"], "Convex prod URL ↔ deployment slug (.env.convex.prod)"));
checks.push(run("npm", ["run", "validate:block-registry"], "Pipeline block registry (modular blocks)"));

const skipHealth = process.env.GO_LIVE_SKIP_HEALTH === "1";
const healthUrl =
  process.env.GO_LIVE_HEALTH_URL?.trim() ||
  "https://dlcfunds.vercel.app/system/health";

let health = { ok: true, detail: "(skipped)" };
if (!skipHealth) {
  health = await probeHealth(healthUrl);
}

const failures = checks.filter((c) => !c.ok);
const strictHealth = process.env.GO_LIVE_STRICT_HEALTH === "1";
const healthFailed = !skipHealth && !health.ok;
if (healthFailed && strictHealth) {
  failures.push({
    ok: false,
    label: `Production health GET ${healthUrl}`,
    out: health.detail,
  });
}

const green = failures.length === 0;
const healthWarn = !skipHealth && !health.ok && !strictHealth;

const line = "═".repeat(56);
console.log("");
console.log(line);
if (green && !healthWarn) {
  console.log("  System Status: GREEN");
} else if (green && healthWarn) {
  console.log("  System Status: GREEN (with production health warning)");
} else {
  console.log("  System Status: RED — see failures below");
}
console.log(line);
console.log("");
console.log("  Checks:");
for (const c of checks) {
  console.log(`    [${c.ok ? "ok" : "FAIL"}] ${c.label}`);
  if (!c.ok && c.out) console.log(`         ${c.out.split("\n").slice(0, 6).join("\n         ")}`);
}
if (!skipHealth && health.ok) {
  console.log(`    [ok] Production health: ${healthUrl} (${health.detail})`);
} else if (healthWarn) {
  console.log(`    [warn] Production health: ${healthUrl} (unreachable: ${health.detail})`);
  console.log(`           Set GO_LIVE_STRICT_HEALTH=1 to fail on this, or GO_LIVE_SKIP_HEALTH=1 to omit.`);
}
if (!skipHealth && !health.ok && strictHealth) {
  console.log(`    [FAIL] Production health: ${healthUrl}`);
  console.log(`         ${health.detail}`);
}
console.log("");
console.log("  Runtime analysis (code paths — confirm in prod for Joshua@…):");
console.log("    • Auth FSM: deriveAuthMachineState → unauthenticated | loading | authenticated");
console.log("      (session invalid → expired/revoked; no router.refresh loop in client auth)");
console.log("    • Login: new publicId + rawSecret per sign-in; CSRF cookie rotated with session");
console.log("    • GodMode: Convex organizationRbac global-admin bypass + UI isGlobalAdmin");
console.log("    • Email: normalizeUsername (trim + lowercase) for case-insensitive login");
console.log("    • Scroll: AppChrome <main> single owner; pipeline file → overflow-y-hidden +");
console.log("      delegated [data-pipeline-workspace-scroll]; supports-[overflow-anchor:none] on headers");
console.log("    • E2E: npm run test:e2e:mobile-pipeline-scroll (sticky/scroll regression)");
console.log("");
if (green) {
  console.log("  Go-live: ready for Joshua@DirectLendingConnection.com (any email casing).");
} else {
  console.log("  Fix failures above before go-live.");
}
console.log(line);
console.log("");

process.exit(green ? 0 : 1);
