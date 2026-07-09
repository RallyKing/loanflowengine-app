#!/usr/bin/env node
/**
 * Build gate: Convex React query discipline for client sources.
 *
 * - `useQuery` may only be imported from `convex/react` (not re-export wrappers).
 * - No `useQuery_experimental` / `*_experimental` Convex hooks.
 * - No object-literal first argument: `useQuery({ ... })` / `useQuery({ query:`.
 * - No TanStack/other packages importing `useQuery` for data fetching.
 *
 * Scans: app/, components/, hooks/, lib/ (lender-app). Skips backend scripts/tests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SCAN_TOP_DIRS = ["app", "components", "hooks", "lib"];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
]);

/** Paths relative to lender-app; excluded from scanning. */
const SKIP_PATH_PREFIXES = [
  "convex/",
  "scripts/",
  "tests/",
  "playwright-report/",
  "test-results/",
];

function relPosix(file) {
  return path.relative(appRoot, file).split(path.sep).join("/");
}

function pathSkipped(rel) {
  const norm = rel.split(path.sep).join("/");
  for (const p of SKIP_PATH_PREFIXES) {
    if (norm === p || norm.startsWith(p)) return true;
  }
  if (norm.includes("/node_modules/")) return true;
  return false;
}

function* walkTs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      yield* walkTs(p);
    } else if (/\.(tsx?)$/.test(ent.name)) {
      yield p;
    }
  }
}

function stripBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripLineComments(s) {
  return s.replace(/\/\/.*$/gm, " ");
}

function stripCommentsRough(s) {
  return stripLineComments(stripBlockComments(s));
}

/**
 * @returns {Iterable<{ module: string, chunk: string, startLine: number }>}
 */
function eachImportBlock(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!/^\s*import\s/.test(line)) {
      i++;
      continue;
    }
    // Side-effect only: import "./x" or import "pkg"
    if (/^\s*import\s+["']/.test(line)) {
      i++;
      continue;
    }
    const start = i;
    let chunk = line;
    while (!/\bfrom\s+["'][^"']+["']/.test(chunk)) {
      i++;
      if (i >= lines.length) break;
      chunk += "\n" + lines[i];
    }
    const fromM = chunk.match(/\bfrom\s+["']([^"']+)["']/);
    if (fromM) {
      out.push({ module: fromM[1], chunk, startLine: start + 1 });
    }
    i++;
  }
  return out;
}

function main() {
  const problems = [];

  for (const top of SCAN_TOP_DIRS) {
    const dir = path.join(appRoot, top);
    if (!fs.existsSync(dir)) continue;
    for (const file of walkTs(dir)) {
      const rel = relPosix(file);
      if (pathSkipped(rel)) continue;

      let body;
      try {
        body = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }

      const imports = eachImportBlock(body);
      for (const imp of imports) {
        if (!/\buseQuery\b/.test(imp.chunk)) continue;
        if (imp.module !== "convex/react") {
          problems.push(
            `${rel}:${imp.startLine} useQuery must be imported only from "convex/react" (got "${imp.module}").`,
          );
        }
        const rq =
          imp.module === "@tanstack/react-query" ||
          imp.module === "react-query";
        if (rq) {
          problems.push(
            `${rel}:${imp.startLine} TanStack/react-query useQuery is banned — use convex/react useQuery only.`,
          );
        }
      }

      // Re-export of useQuery from app code (wrapper surface).
      for (const m of body.matchAll(
        /export\s*\{[^}]*\buseQuery\b[^}]*\}\s*from\s+["']([^"']+)["']/g,
      )) {
        if (m[1] !== "convex/react") {
          problems.push(
            `${rel}:1 Re-export of useQuery is only allowed from "convex/react" (got "${m[1]}").`,
          );
        }
      }

      const deconcept = stripCommentsRough(body);

      const expM = deconcept.match(/\buse[A-Za-z0-9]*_experimental\b/);
      if (expM) {
        const token = expM[0];
        const ln = body.slice(0, body.indexOf(token)).split(/\r?\n/).length;
        problems.push(
          `${rel}:${ln} Convex \`*_experimental\` hooks are banned (${token}).`,
        );
      }

      if (/\buseQuery\s*\(\s*\{/.test(deconcept)) {
        const line = body.search(/\buseQuery\s*\(\s*\{/);
        const ln = body.slice(0, line).split(/\r?\n/).length;
        problems.push(
          `${rel}:${ln} Object first argument to useQuery is banned — use useQuery(api.module.fn, argsOrSkip).`,
        );
      }

      if (/\buseQuery\s*\(\s*\{\s*query\s*:/.test(deconcept)) {
        const line = body.search(/\buseQuery\s*\(\s*\{\s*query\s*:/);
        const ln = body.slice(0, line).split(/\r?\n/).length;
        problems.push(
          `${rel}:${ln} Object-form { query: ... } useQuery calls are banned.`,
        );
      }

      for (const banned of ["useEffectivePermissionsQuery", "convexSoftQuery"]) {
        if (!deconcept.includes(banned)) continue;
        const ln = body.slice(0, body.indexOf(banned)).split(/\r?\n/).length;
        problems.push(
          `${rel}:${ln} Banned Convex query abstraction/reserved identifier: ${banned}`,
        );
      }
    }
  }

  if (problems.length) {
    console.error(
      "[verify-convex-query-architecture] FAILED:\n- " + problems.join("\n- "),
    );
    process.exit(1);
  }
  console.log(
    "[verify-convex-query-architecture] OK — convex/react useQuery discipline.",
  );
}

main();
