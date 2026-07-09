import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pre-complete QA gate: one production build + mobile core Playwright + desktop Chromium smoke.
 * Requires cwd lender-app (or run via npm script).
 *
 * REQUIRE_GOVERNANCE_AUTH=true → fail fast if APP_AUTH_USERNAME / APP_AUTH_PASSWORD unset.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = resolve(__dirname, "..");

function run(label, command, args, extraEnv = undefined) {
  console.log(`\n[governance-qa-gate] ${label}`);
  const commandLine = [command, ...args]
    .map((part) =>
      /\s/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part,
    )
    .join(" ");
  const r = spawnSync(commandLine, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...(extraEnv ?? {}) },
  });
  const code = r.status ?? 1;
  if (code !== 0) {
    console.error(`[governance-qa-gate] FAILED: ${label} (exit ${code})`);
    process.exit(code);
  }
}

if (process.env.REQUIRE_GOVERNANCE_AUTH === "true") {
  const u = process.env.APP_AUTH_USERNAME?.trim();
  const p = process.env.APP_AUTH_PASSWORD;
  if (!u || !p) {
    console.error(
      "[governance-qa-gate] REQUIRE_GOVERNANCE_AUTH=true but APP_AUTH_USERNAME / APP_AUTH_PASSWORD not set.",
    );
    process.exit(1);
  }
}

run("Production build", "npm", ["run", "build"]);
run(
  "Mobile tests (Mobile Chrome + Mobile Safari)",
  "npx",
  ["playwright", "test", "tests/mobile", "--project", "Mobile Chrome", "--project", "Mobile Safari"],
  { PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT: "1" },
);
run(
  "Desktop smoke (chromium)",
  "npx",
  [
    "playwright",
    "test",
    "tests/e2e/smoke.spec.ts",
    "tests/e2e/production-smoke.spec.ts",
    "tests/auth",
    "--project",
    "chromium",
  ],
  { PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT: "1" },
);

console.log("\n[governance-qa-gate] All steps passed.");
