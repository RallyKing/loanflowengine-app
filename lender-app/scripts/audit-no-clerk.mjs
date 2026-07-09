#!/usr/bin/env node
/**
 * Fails the repo if legacy auth vendor strings or packages remain.
 * Excludes this file's patterns list from matching itself via careful checks only on sources.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
  /** Generated operator reports; may echo migration API wording historic exports. */
  "migration-reports",
]);

const SKIP_FILES = new Set([
  path.normalize("docs/auth-removal-audit.md"),
  path.normalize("scripts/audit-no-clerk.mjs"),
]);

/** Under `lender-app/` only — paths (posix) excluded from substring scan (mirrored docs). */
const SKIP_SOURCE_PREFIXES = ["docs/"];

/** Optional exact-path exclusions (none by default; migrations/ uses prefix skip). */
const SKIP_SOURCE_EXACT = new Set([]);

function sourcePathSkipped(rel) {
  const norm = rel.split(path.sep).join("/");
  for (const p of SKIP_SOURCE_PREFIXES) {
    if (norm.startsWith(p)) return true;
  }
  if (SKIP_SOURCE_EXACT.has(norm)) return true;
  if (norm.startsWith("convex/migrations/")) return true;
  return false;
}

/** Case-insensitive substrings (ASCII) that must not appear outside exclusions. */
const BANNED_SUBSTRINGS = [
  "@clerk/",
  "@clerk\"",
  "@clerk'",
  "clerk/nextjs",
  "clerkMiddleware",
  "useClerk",
  "clerkOrganizationId",
  "orgClerkId",
  "FIXED_VIEWER",
  "APP_AUTH_FIXED_ORG_ID",
  "syncFromClerk",
  "lookupOrganizationIdByClerkId",
  "getForViewerByClerkId",
];

function* walkFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walkFiles(p);
    } else {
      yield p;
    }
  }
}

function relToApp(p) {
  return path.relative(appRoot, p).split(path.sep).join("/");
}

function scanSources() {
  const hits = [];
  for (const file of walkFiles(appRoot)) {
    const rel = relToApp(file);
    if (SKIP_FILES.has(path.normalize(rel))) continue;
    if (sourcePathSkipped(rel)) continue;
    const lowerName = rel.toLowerCase();
    if (lowerName === "package.json") continue;
    if (lowerName.endsWith("package-lock.json")) continue;
    if (
      !/\.(ts|tsx|js|mjs|cjs|mts|cts|json|md|css|html|svg)$/.test(lowerName)
    ) {
      continue;
    }
    let body;
    try {
      body = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bclerk\b/i.test(line)) {
        hits.push({ rel, line: i + 1, text: line.trim().slice(0, 200) });
        continue;
      }
      for (const s of BANNED_SUBSTRINGS) {
        if (line.includes(s)) {
          hits.push({ rel, line: i + 1, text: line.trim().slice(0, 200) });
          break;
        }
      }
    }
  }
  return hits;
}

function scanLockfile() {
  const lockPath = path.join(appRoot, "package-lock.json");
  if (!fs.existsSync(lockPath)) return [];
  const text = fs.readFileSync(lockPath, "utf8");
  return /"node_modules\/@clerk\//.test(text)
    ? [`${relToApp(lockPath)} still references @clerk packages`]
    : [];
}

function scanWorkspaceMarkdown() {
  // Workspace-level `../docs` holds intentional migration narratives (Clerk-era audits, etc.).
  // Runtime enforcement: scanSources over lender-app + lockfile + optional Convex org scan.
  return [];
}

function scanEnvFiles() {
  const hits = [];
  for (const file of walkFiles(appRoot)) {
    const rel = relToApp(file);
    if (!/^\.env/.test(path.basename(file))) continue;
    if (rel.includes("node_modules")) continue;
    let body;
    try {
      body = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/\bclerk\b/i.test(lines[i])) {
        hits.push({
          rel,
          line: i + 1,
          text: lines[i].trim().slice(0, 200),
        });
      }
    }
  }
  return hits;
}

function runConvexOrgScan() {
  if (process.env.SKIP_CONVEX_ORG_SCAN === "1") {
    console.warn(
      "[audit:no-clerk] SKIP_CONVEX_ORG_SCAN=1 — skipping Convex DB scan.",
    );
    return [];
  }
  const res = spawnSync(
    "npx",
    ["convex", "run", "orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix", "{}"],
    {
      cwd: appRoot,
      encoding: "utf8",
      shell: true,
      env: { ...process.env },
    },
  );
  if (res.status !== 0) {
    return [
      `Convex scan failed (is convex logged in and deployed?). stderr: ${(res.stderr || "").slice(0, 400)}`,
    ];
  }
  const out = (res.stdout || "").trim();
  const jsonMatch = out.match(/\{[\s\S]*"rowsWithLegacyOrgToken"[\s\S]*\}/);
  if (!jsonMatch) {
    return [`Could not parse Convex scan output: ${out.slice(0, 300)}`];
  }
  try {
    const data = JSON.parse(jsonMatch[0]);
    if (data.rowsWithLegacyOrgToken > 0) {
      return [
        `Convex organizations table still has ${data.rowsWithLegacyOrgToken} rows whose JSON contains legacy org_ tokens (checked ${data.organizationsChecked} rows).`,
      ];
    }
  } catch (e) {
    return [`Convex scan JSON parse error: ${e instanceof Error ? e.message : e}`];
  }
  return [];
}

function main() {
  const problems = [];
  problems.push(...scanLockfile());
  problems.push(...runEnvIssues(scanEnvFiles()));
  problems.push(...runSourceIssues(scanWorkspaceMarkdown()));
  problems.push(...runSourceIssues(scanSources()));
  problems.push(...runConvexOrgScan());

  if (problems.length) {
    console.error("[audit:no-clerk] FAILED:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log("[audit:no-clerk] OK — no blocked references, lockfile clean, Convex org scan clear.");
}

function runEnvIssues(envIssues) {
  if (!envIssues.length) return [];
  return envIssues.map((h) => `${h.rel}:${h.line} ${h.text}`);
}

function runSourceIssues(srcHits) {
  if (!srcHits.length) return [];
  return srcHits.map((h) => `${h.rel}:${h.line} ${h.text}`);
}

main();
