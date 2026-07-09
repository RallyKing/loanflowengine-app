#!/usr/bin/env node
/**
 * Verifies canonical production Convex alignment in-repo:
 * - `.env.convex.prod` NEXT_PUBLIC_CONVEX_URL ↔ CONVEX_DEPLOYMENT slug
 * - Fingerprint of checked-in `convex/_generated` client bundle (SHA-256)
 *
 * Does not read Vercel secrets. Ensure production hosting sets
 * NEXT_PUBLIC_CONVEX_URL to the same value as `.env.convex.prod`.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function parseDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = (m[2] ?? "").trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function slugFromConvexCloudUrl(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(".convex.cloud")) return null;
  return host.slice(0, -".convex.cloud".length);
}

function hashGeneratedBundle() {
  const files = [
    "convex/_generated/api.js",
    "convex/_generated/api.d.ts",
    "convex/_generated/dataModel.d.ts",
    "convex/_generated/server.d.ts",
    "convex/_generated/server.js",
  ];
  const h = crypto.createHash("sha256");
  for (const rel of files) {
    const p = path.join(appRoot, rel);
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

function main() {
  const prodPath = path.join(appRoot, ".env.convex.prod");
  const prod = parseDotEnvFile(prodPath);
  const localPath = path.join(appRoot, ".env.local");
  const local = parseDotEnvFile(localPath);

  const nextProd = prod.NEXT_PUBLIC_CONVEX_URL;
  const depProd = prod.CONVEX_DEPLOYMENT;

  console.log("=== Convex production alignment (repo canonical) ===\n");
  console.log(`Source file: ${path.relative(process.cwd(), prodPath)}`);
  console.log(`  NEXT_PUBLIC_CONVEX_URL (prod template)  = ${nextProd ?? "(missing)"}`);
  console.log(`  CONVEX_DEPLOYMENT (prod template)      = ${depProd ?? "(missing)"}`);

  const slug = nextProd ? slugFromConvexCloudUrl(nextProd) : null;
  const slugMatch = Boolean(slug && depProd && slug === depProd);

  console.log(`  URL hostname slug                      = ${slug ?? "(not *.convex.cloud)"}`);
  console.log(`  Slug matches CONVEX_DEPLOYMENT         = ${slugMatch ? "yes" : "NO"}`);

  const generatedSha256 = hashGeneratedBundle();
  console.log("\nGenerated client bundle SHA-256 (convex/_generated):");
  console.log(`  ${generatedSha256}`);
  console.log(
    "(Stable for a given codegen output; Convex `api.js` uses anyApi — no deployment id inside.)",
  );

  if (local.NEXT_PUBLIC_CONVEX_URL) {
    console.log("\n--- Local dev (.env.local) ---");
    console.log(`  NEXT_PUBLIC_CONVEX_URL = ${local.NEXT_PUBLIC_CONVEX_URL}`);
    console.log(
      "  (Expected to differ from prod when using local Convex; Vercel prod must use prod template.)",
    );
  }

  const problems = [];
  if (!nextProd || !depProd) {
    problems.push("Missing NEXT_PUBLIC_CONVEX_URL or CONVEX_DEPLOYMENT in .env.convex.prod");
  }
  if (!slugMatch) {
    problems.push(
      "NEXT_PUBLIC_CONVEX_URL host slug and CONVEX_DEPLOYMENT must match (e.g. https://NAME.convex.cloud ↔ NAME).",
    );
  }

  if (!problems.length) {
    const env = { ...process.env, CONVEX_DEPLOYMENT: depProd };
    const res = spawnSync("npx", ["convex", "deployments"], {
      cwd: appRoot,
      encoding: "utf8",
      shell: true,
      env,
    });
    const out = (res.stdout || "").trim();
    if (out) {
      console.log("\n--- Convex CLI (CONVEX_DEPLOYMENT from prod template) ---");
      console.log(out);
    }
    if (res.status !== 0 && !/Deployment:\s*\S+/m.test(out)) {
      console.log(
        "\n(Warn) `npx convex deployments` may have failed — ensure Convex CLI is logged in.",
      );
      if (res.stderr) console.log(res.stderr.slice(0, 400));
    }
  }

  if (problems.length) {
    console.error("\n[verify-prod-deployment-alignment] FAILED:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log("\n[verify-prod-deployment-alignment] OK — prod URL and deployment slug are aligned.");
}

main();
