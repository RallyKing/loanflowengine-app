#!/usr/bin/env node
/** Injects local git SHA + build timestamp into env before build/deploy. */
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

let sha = "unknown";
try {
  sha = execSync("git rev-parse HEAD", { cwd: appRoot, encoding: "utf8" }).trim();
} catch {
  /* non-git tree */
}

const buildTime = new Date().toISOString();

const env = {
  ...process.env,
  NEXT_PUBLIC_DLC_GIT_SHA: sha,
  NEXT_PUBLIC_DLC_BUILD_TIME: buildTime,
};

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/with-git-sha.mjs <command...>");
  process.exit(2);
}

console.log("[with-git-sha] NEXT_PUBLIC_DLC_GIT_SHA =", sha);
console.log("[with-git-sha] NEXT_PUBLIC_DLC_BUILD_TIME =", buildTime);

const result = spawnSync(args[0], args.slice(1), {
  cwd: appRoot,
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(result.status ?? 1);
