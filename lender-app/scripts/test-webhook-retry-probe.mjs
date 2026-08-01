/**
 * Smoke test: seed a 503 webhook and dispatch test_ping to verify retry scheduling.
 * Usage: node scripts/test-webhook-retry-probe.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const convexBin =
  process.platform === "win32"
    ? path.join(root, "node_modules", ".bin", "convex.cmd")
    : path.join(root, "node_modules", ".bin", "convex");

function convexRun(fn, args) {
  const payload = JSON.stringify(args);
  const r = spawnSync(convexBin, ["run", fn, payload], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const out = (r.stdout || "").trim();
  return out ? JSON.parse(out) : null;
}

function convexInline(query) {
  const r = spawnSync(convexBin, ["run", "--inline-query", query], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const out = (r.stdout || "").trim();
  return out ? JSON.parse(out) : null;
}

const org = convexInline(
  'return await ctx.db.query("organizations").first()',
);
const orgId = org?._id;
if (!orgId) {
  console.error("No organization found.");
  process.exit(1);
}

console.log("Org:", orgId);
const seed = convexRun("webhookInternals:seedFailingProbeWebhook", {
  organizationId: orgId,
});
console.log("Seeded failing webhook:", seed.webhookId);

const dispatch = convexRun("webhookDispatcher:dispatchWebhook", {
  webhookId: seed.webhookId,
  event: "test_ping",
  data: {},
  attempt: 1,
});
console.log("Dispatch result:", dispatch);

const logs = convexInline(
  'return await ctx.db.query("webhook_logs").order("desc").take(3)',
);
console.log(
  "Recent webhook_logs:",
  logs.map((r) => ({
    status: r.status,
    attempts: r.attempts,
    nextRetryAt: r.nextRetryAt,
    httpStatus: r.httpStatus,
    event: r.event,
  })),
);
