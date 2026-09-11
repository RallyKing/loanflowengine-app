#!/usr/bin/env node
/**
 * Convex reactivity & React correctness gate — static enforcement of
 * `docs/governance/convex-reactivity-policy.md`.
 *
 * This is the architectural layer. Cost/loop checks (polling, Date.now() in
 * useQuery args, cron floor, .collect() ratchet) live in
 * `verify-resource-safety.mjs` — do not duplicate them here.
 *
 *   1. exhaustive-deps disable ratchet — new eslint-disable of
 *      react-hooks/exhaustive-deps must carry `// reactivity-allow: <reason>`
 *      (same line or the line above). Pre-existing undocumented disables are
 *      frozen per file in convex-reactivity-baseline.json.
 *   2. Cache-buster identifiers — refreshKey / queryNonce / cacheBuster /
 *      forceRefetch used to retrigger Convex reads.
 *   3. Remount hacks — key={Date.now()} to force a re-subscribe.
 *
 * Not checked (noisy / false positives — see policy §9):
 *   - Inline object/array literals in useQuery args (Convex deep-equals
 *     primitive objects; ~50+ existing sites).
 *   - useState+useEffect mirroring (indistinguishable from form hydration).
 *
 * Escape hatch:
 *   // reactivity-allow: <reason>
 * on the offending line or the line above.
 *
 * Usage:
 *   node scripts/verify-convex-reactivity.mjs
 *   node scripts/verify-convex-reactivity.mjs --update-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const BASELINE_PATH = path.join(
  appRoot,
  "scripts",
  "convex-reactivity-baseline.json",
);
const UPDATE_BASELINE = process.argv.includes("--update-baseline");

/** Include modules/ — resource-safety client roots omit it; many useQuery sites live here. */
const CLIENT_ROOTS = ["app", "components", "hooks", "lib", "modules"];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "playwright-report",
  "test-results",
  "tests",
  "_generated",
]);

const DISABLE_RE =
  /eslint-disable(?:-next-line|-line)?(?:\s+[^\n]*?)?react-hooks\/exhaustive-deps/g;

const CACHE_BUSTER_RE =
  /\b(refreshKey|refreshNonce|queryNonce|cacheBuster|forceRefetch)\b/g;

const REMOUNT_KEY_RE = /\bkey\s*=\s*\{\s*Date\.now\s*\(/g;

function relPosix(file) {
  return path.relative(appRoot, file).split(path.sep).join("/");
}

function* walk(dir) {
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
      if (ent.name.startsWith(".")) continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(ent.name)) {
      yield p;
    }
  }
}

/** Blanks comments and string bodies while preserving offsets and newlines. */
function blankNonCode(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      blank(i, Math.min(j + 2, n));
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

function lineAt(src, index) {
  return src.slice(0, index).split(/\r?\n/).length;
}

function hasReactivityAllow(lines, lineNumber) {
  const here = lines[lineNumber - 1] ?? "";
  const above = lines[lineNumber - 2] ?? "";
  return /reactivity-allow\s*:/.test(here) || /reactivity-allow\s*:/.test(above);
}

const problems = [];

function report(rel, line, message) {
  problems.push(`${rel}:${line} ${message}`);
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { undocumentedExhaustiveDepsDisablesByFile: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    return {
      undocumentedExhaustiveDepsDisablesByFile:
        parsed.undocumentedExhaustiveDepsDisablesByFile ?? {},
    };
  } catch {
    return { undocumentedExhaustiveDepsDisablesByFile: {} };
  }
}

function writeBaseline(disables) {
  const sortObj = (o) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const payload = {
    description:
      "Ratchet baselines for docs/governance/convex-reactivity-policy.md. `undocumentedExhaustiveDepsDisablesByFile` = eslint-disable of react-hooks/exhaustive-deps without `// reactivity-allow: <reason>` on that line or the line above. New disables must carry the tag; this list may shrink, never grow.",
    regenerate: "node scripts/verify-convex-reactivity.mjs --update-baseline",
    policy: "docs/governance/convex-reactivity-policy.md",
    undocumentedExhaustiveDepsDisablesByFile: sortObj(disables),
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const n = Object.values(payload.undocumentedExhaustiveDepsDisablesByFile).reduce(
    (a, b) => a + b,
    0,
  );
  console.log(
    `[verify-convex-reactivity] Baseline written: ${n} undocumented exhaustive-deps disable(s) in ${Object.keys(payload.undocumentedExhaustiveDepsDisablesByFile).length} files.`,
  );
}

function checkClientFile(rel, src, code, lines) {
  let undocumented = 0;
  for (const m of src.matchAll(DISABLE_RE)) {
    const line = lineAt(src, m.index);
    if (hasReactivityAllow(lines, line)) continue;
    undocumented++;
  }

  for (const m of code.matchAll(CACHE_BUSTER_RE)) {
    const line = lineAt(src, m.index);
    if (hasReactivityAllow(lines, line)) continue;
    report(
      rel,
      line,
      `\`${m[1]}\` is a cache-buster / manual-refresh identifier — Convex useQuery is a push subscription. Remove it or annotate \`// reactivity-allow: <reason>\`.`,
    );
  }

  for (const m of code.matchAll(REMOUNT_KEY_RE)) {
    const line = lineAt(src, m.index);
    if (hasReactivityAllow(lines, line)) continue;
    report(
      rel,
      line,
      "`key={Date.now()}` forces a remount/re-subscribe — banned. Let the subscription push.",
    );
  }

  return undocumented;
}

function main() {
  const baseline = loadBaseline();
  const currentDisables = {};

  for (const root of CLIENT_ROOTS) {
    const dir = path.join(appRoot, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const rel = relPosix(file);
      let src;
      try {
        src = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const code = blankNonCode(src);
      const lines = src.split(/\r?\n/);
      const n = checkClientFile(rel, src, code, lines);
      if (n > 0) currentDisables[rel] = n;
    }
  }

  if (UPDATE_BASELINE) {
    writeBaseline(currentDisables);
    return;
  }

  for (const [rel, count] of Object.entries(currentDisables)) {
    const allowed = baseline.undocumentedExhaustiveDepsDisablesByFile[rel] ?? 0;
    if (count > allowed) {
      report(
        rel,
        1,
        `added ${count - allowed} eslint-disable of react-hooks/exhaustive-deps without \`// reactivity-allow: <reason>\` (baseline ${allowed}). Annotate the disable or fix the dependency array.`,
      );
    }
  }

  if (problems.length) {
    console.error(
      "[verify-convex-reactivity] FAILED — see docs/governance/convex-reactivity-policy.md\n- " +
        problems.join("\n- "),
    );
    process.exit(1);
  }
  console.log(
    "[verify-convex-reactivity] OK — exhaustive-deps disable ratchet, no cache-buster identifiers, no Date.now() remount keys.",
  );
}

main();
