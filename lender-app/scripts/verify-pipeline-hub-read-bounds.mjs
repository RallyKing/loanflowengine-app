#!/usr/bin/env node
/**
 * Build gate: read discipline on the pipeline hub subscription path.
 *
 * `pipeline:listTablePreview` is a single long-lived subscription that re-runs
 * on every write touching any table it joins. Anything unbounded on this path
 * multiplies across every connected tab, so these files are held to:
 *
 *  - no `.collect()` (use `.take(cap)` with a cap from tablePreviewReadBounds)
 *  - no `ctx.db.query(t)` without `.withIndex(...)`
 *  - no `ctx.scheduler` / self-rescheduling pumps
 *  - no cron registration
 *
 * Exemptions must be narrow and carry `// hub-read-bounds-allow: <reason>` on
 * the line above.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Files reached by every `listTablePreview` tick. */
const HOT_PATH_FILES = [
  "convex/pipelineHubBoundedReads.ts",
  "convex/pipelineGraphPreviewLinks.ts",
];

/**
 * Functions inside larger modules that sit on the hub path. Checked from the
 * declaration line to the next top-level `export` so unrelated code in the same
 * file stays out of scope.
 */
const HOT_PATH_FUNCTIONS = [
  { file: "convex/pipeline.ts", symbol: "export const listTablePreview" },
  { file: "convex/taskHighlights.ts", symbol: "async function buildHubTriageHighlightMap" },
  { file: "convex/contacts.ts", symbol: "export const list" },
  {
    file: "convex/pipelineFileNotes.ts",
    symbol: "export async function batchPipelineFileNoteCounts",
  },
];

/** Extra static bans for the triage builder specifically. */
const TRIAGE_BANS = [
  {
    id: "org-task-scan",
    test: /withIndex\(\s*["']by_organization["']/,
    message:
      "buildHubTriageHighlightMap must not org-scan tasks — use by_relatedFile on hub-visible files.",
  },
];
const ALLOW_MARKER = "hub-read-bounds-allow:";

const RULES = [
  {
    id: "collect",
    test: /\.collect\s*\(\s*\)/,
    message:
      "`.collect()` is unbounded — use `.take(cap)` with a cap from lib/pipeline/tablePreviewReadBounds.",
  },
  {
    id: "scheduler",
    test: /ctx\.scheduler\b/,
    message: "`ctx.scheduler` is banned on the hub path (no self-reschedule pumps).",
  },
  {
    id: "cron",
    test: /\bcronJobs\s*\(|\bcrons\.(interval|cron|daily|hourly|weekly|monthly)\b/,
    message: "Cron registration is banned on the hub path.",
  },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "));
}

/** Lines are 1-based; `[from, to)` is half-open over the 0-based array. */
function lineRangeForSymbol(lines, symbol) {
  const start = lines.findIndex((l) => l.includes(symbol));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^export\s/.test(lines[i]) || /^(async\s+)?function\s/.test(lines[i])) {
      return [start, i];
    }
  }
  return [start, lines.length];
}

function checkRegion(rel, rawLines, codeLines, from, to, problems) {
  for (let i = from; i < to; i++) {
    const code = codeLines[i];
    if (!code || !code.trim()) continue;
    const previous = rawLines[i - 1] ?? "";
    if (previous.includes(ALLOW_MARKER) || rawLines[i].includes(ALLOW_MARKER)) {
      continue;
    }
    for (const rule of RULES) {
      if (rule.test.test(code)) {
        problems.push(`${rel}:${i + 1} [${rule.id}] ${rule.message}`);
      }
    }
  }
}

/** `ctx.db.query("x")` must be followed by `.withIndex(` within the statement. */
function checkIndexedReads(rel, rawLines, codeLines, from, to, problems) {
  const region = codeLines.slice(from, to).join("\n");
  const pattern = /ctx\.db\s*\.?\s*\n?\s*\.query\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)([\s\S]{0,200})/g;
  let match;
  while ((match = pattern.exec(region)) !== null) {
    const [, table, tail] = match;
    if (/\.withIndex\(/.test(tail)) continue;
    const offset = region.slice(0, match.index).split("\n").length - 1;
    const lineNo = from + offset;
    if ((rawLines[lineNo] ?? "").includes(ALLOW_MARKER)) continue;
    if ((rawLines[lineNo - 1] ?? "").includes(ALLOW_MARKER)) continue;
    problems.push(
      `${rel}:${lineNo + 1} [unindexed] ctx.db.query("${table}") on the hub path must use .withIndex(...).`,
    );
  }
}

function main() {
  const problems = [];

  for (const rel of HOT_PATH_FILES) {
    const abs = path.join(appRoot, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`${rel}:1 hot-path file is missing — update HOT_PATH_FILES.`);
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const rawLines = raw.split(/\r?\n/);
    const codeLines = stripComments(raw).split(/\r?\n/);
    checkRegion(rel, rawLines, codeLines, 0, codeLines.length, problems);
    checkIndexedReads(rel, rawLines, codeLines, 0, codeLines.length, problems);
  }

  for (const { file, symbol } of HOT_PATH_FUNCTIONS) {
    const abs = path.join(appRoot, file);
    if (!fs.existsSync(abs)) {
      problems.push(`${file}:1 hot-path file is missing — update HOT_PATH_FUNCTIONS.`);
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const rawLines = raw.split(/\r?\n/);
    const codeLines = stripComments(raw).split(/\r?\n/);
    const range = lineRangeForSymbol(codeLines, symbol);
    if (!range) {
      problems.push(
        `${file}:1 could not locate "${symbol}" — update HOT_PATH_FUNCTIONS after renaming.`,
      );
      continue;
    }
    const [from, to] = range;
    checkRegion(file, rawLines, codeLines, from, to, problems);
    checkIndexedReads(file, rawLines, codeLines, from, to, problems);
    if (symbol.includes("buildHubTriageHighlightMap")) {
      for (let i = from; i < to; i++) {
        const code = codeLines[i];
        if (!code || !code.trim()) continue;
        for (const rule of TRIAGE_BANS) {
          if (rule.test.test(code)) {
            problems.push(`${file}:${i + 1} [${rule.id}] ${rule.message}`);
          }
        }
      }
    }
  }

  if (problems.length) {
    console.error(
      "[verify-pipeline-hub-read-bounds] FAILED:\n- " + problems.join("\n- "),
    );
    process.exit(1);
  }
  console.log(
    "[verify-pipeline-hub-read-bounds] OK — hub path is indexed, capped, and pump-free.",
  );
}

main();
