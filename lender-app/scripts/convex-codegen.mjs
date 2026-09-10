#!/usr/bin/env node
/**
 * Non-interactive Convex codegen for CI and coding agents.
 *
 * Project convention: `convex/_generated/` is gitignored (see lender-app/.gitignore).
 * Official Convex guidance is to commit generated types; this repo regenerates them
 * instead. Do not commit secrets or `.env.local`.
 *
 * Auth / deployment (first match wins for the Convex CLI):
 * - `CONVEX_DEPLOY_KEY` — CI / hosted deploy key (secret; never commit)
 * - `CONVEX_DEPLOYMENT` — existing configured deployment
 * - otherwise `CONVEX_AGENT_MODE=anonymous` so the CLI can use an isolated
 *   anonymous local backend without interactive login
 *
 * Typecheck and `next build` still need a successful codegen (or a pre-existing
 * `convex/_generated/` from a prior local `convex dev`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexBin = path.join(appRoot, "node_modules", ".bin", "convex");

const env = { ...process.env };
const hasDeployKey = Boolean(env.CONVEX_DEPLOY_KEY?.trim());
const hasDeployment = Boolean(env.CONVEX_DEPLOYMENT?.trim());

if (!hasDeployKey && !hasDeployment && !env.CONVEX_AGENT_MODE) {
  env.CONVEX_AGENT_MODE = "anonymous";
}

// Discourage interactive login prompts in agents / CI.
if (!env.CI) {
  env.CI = "1";
}

const cmd = existsSync(convexBin) ? convexBin : "npx";
const args = existsSync(convexBin)
  ? ["codegen", "--typecheck", "disable"]
  : ["--yes", "convex", "codegen", "--typecheck", "disable"];

const result = spawnSync(cmd, args, {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error("[convex-codegen] failed to spawn:", result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    [
      "[convex-codegen] codegen failed.",
      "A clean clone cannot typecheck or `next build` without `convex/_generated/`.",
      "Retry with one of:",
      "  - CONVEX_AGENT_MODE=anonymous npm run convex:codegen",
      "  - CONVEX_DEPLOYMENT=<dev:…> npm run convex:codegen  (after `npx convex login` locally)",
      "  - CONVEX_DEPLOY_KEY=<preview/dev key> npm run convex:codegen  (CI; never commit)",
      "Do not commit `.env.local` or deploy keys.",
    ].join("\n"),
  );
  process.exit(result.status ?? 1);
}
