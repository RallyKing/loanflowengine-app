#!/usr/bin/env npx tsx
/** Phase 12.2 Step 8C — display normalization proof. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [".env.local", ".env.testing"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
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
      env[t.slice(0, i).trim()] = v;
    }
  }
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

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const proof = convexRun(
    "operator/displayNormalizationStep8C:runDisplayNormalizationProof",
    { adminSecret },
  );
  const report = { generatedAt: Date.now(), proof };
  writeFileSync(
    join(reportsDir, "phase12-step8C-display-normalization.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
