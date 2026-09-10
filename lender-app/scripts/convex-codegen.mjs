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
function convexArgs(subcommand) {
  return existsSync(convexBin)
    ? subcommand
    : ["--yes", "convex", ...subcommand];
}

function runConvex(subcommand) {
  return spawnSync(cmd, convexArgs(subcommand), {
    cwd: appRoot,
    env,
    stdio: "inherit",
  });
}

if (!hasDeployKey && !hasDeployment) {
  console.log(
    "[convex-codegen] No CONVEX_DEPLOY_KEY / CONVEX_DEPLOYMENT — running `convex init` (CONVEX_AGENT_MODE=anonymous).",
  );
  const init = runConvex(["init"]);
  if (init.error) {
    console.error("[convex-codegen] failed to spawn convex init:", init.error.message);
    process.exit(1);
  }
  if (init.status !== 0) {
    console.error(
      [
        "[convex-codegen] `convex init` failed.",
        "A clean clone cannot typecheck or `next build` without `convex/_generated/`.",
        "Retry with CONVEX_AGENT_MODE=anonymous, or set CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY.",
        "Do not commit `.env.local` or deploy keys.",
      ].join("\n"),
    );
    process.exit(init.status ?? 1);
  }

  // auth.config.ts references these process.env keys; the CLI refuses codegen
  // until they exist on the (anonymous) deployment. Values are public placeholders,
  // not secrets — never write them into git.
  const jwtPlaceholders = [
    ["CONVEX_JWT_APPLICATION_ID", "dlc-workspace"],
    ["CONVEX_JWT_ISSUER", "http://127.0.0.1:3004"],
    ["CONVEX_JWT_JWKS_URL", "http://127.0.0.1:3004/.well-known/jwks.json"],
    ["CONVEX_JWT_LOCAL_ISSUER", "http://127.0.0.1:3004"],
    [
      "CONVEX_JWT_LOCAL_JWKS_URL",
      "http://127.0.0.1:3004/.well-known/jwks.json",
    ],
  ];
  for (const [key, value] of jwtPlaceholders) {
    const setEnv = runConvex(["env", "set", key, value]);
    if (setEnv.error || setEnv.status !== 0) {
      console.error(
        `[convex-codegen] failed to set anonymous placeholder ${key} (not a secret).`,
      );
      process.exit(setEnv.status ?? 1);
    }
  }
}

const result = runConvex(["codegen", "--typecheck", "disable"]);

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
