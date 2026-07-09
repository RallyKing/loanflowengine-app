import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verifies canonical governance files exist for AI/engineering policy.
 * Run from repo root or lender-app; resolves workspace root as lender-app/..
 * Source of truth: docs/governance/MANIFEST.json
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const lenderAppRoot = resolve(__dirname, "..");
const repoRoot = resolve(lenderAppRoot, "..");

const manifestPath = join(repoRoot, "docs", "governance", "MANIFEST.json");

if (!existsSync(manifestPath)) {
  console.error("[verify-repo-governance] Missing manifest:", manifestPath);
  process.exit(1);
}

/** @type {{ version: number; requiredPaths: string[] }} */
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error("[verify-repo-governance] Invalid JSON:", manifestPath, e);
  process.exit(1);
}

if (!Array.isArray(manifest.requiredPaths) || manifest.requiredPaths.length === 0) {
  console.error("[verify-repo-governance] MANIFEST.requiredPaths must be a non-empty array");
  process.exit(1);
}

let missing = false;
for (const rel of manifest.requiredPaths) {
  const p = join(repoRoot, rel.replace(/\\/g, "/"));
  if (!existsSync(p)) {
    console.error("[verify-repo-governance] Missing:", p);
    missing = true;
  }
}

if (missing) {
  console.error(
    "\n[verify-repo-governance] Governance incomplete. See docs/governance/MANIFEST.json and docs/ai-development-rules.md.",
  );
  process.exit(1);
}

console.log("[verify-repo-governance] OK —", manifest.requiredPaths.length, "paths present");
console.log("  repo root:", repoRoot);
console.log("  manifest :", manifestPath);
