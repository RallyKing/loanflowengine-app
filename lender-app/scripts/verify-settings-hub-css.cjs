/**
 * Static regression guard for Settings Jump-to Tailwind purge.
 * Fails if `modules/` is missing from content and desktop utilities are dropped.
 */
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const root = process.cwd();
const cssDirCandidates = [
  join(root, ".next", "static", "css"),
  join(root, ".next-settings-layout", "static", "css"),
];

function findCssDir() {
  for (const dir of cssDirCandidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function loadTailwindContentGlobs() {
  const cfg = readFileSync(join(root, "tailwind.config.ts"), "utf8");
  return cfg;
}

function main() {
  const cfg = loadTailwindContentGlobs();
  if (!cfg.includes('./modules/**/*.{js,ts,jsx,tsx,mdx}')) {
    console.error(
      "[verify-settings-hub-css] FAIL: tailwind.config.ts must include ./modules/** content glob",
    );
    process.exit(1);
  }

  const cssDir = findCssDir();
  if (!cssDir) {
    console.error(
      "[verify-settings-hub-css] FAIL: no .next/static/css (run npm run build first)",
    );
    process.exit(1);
  }

  const files = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
  if (files.length === 0) {
    console.error("[verify-settings-hub-css] FAIL: empty css dir", cssDir);
    process.exit(1);
  }

  const css = files
    .map((f) => readFileSync(join(cssDir, f), "utf8"))
    .join("\n");

  const required = [
    { label: "md:flex-col", re: /\.md\\:flex-col\b/ },
    { label: "md:w-56", re: /\.md\\:w-56\b/ },
    { label: "md:flex-row", re: /\.md\\:flex-row\b/ },
    { label: "flex-col", re: /\.flex-col\b/ },
  ];

  const missing = required.filter((r) => !r.re.test(css));
  if (missing.length) {
    console.error(
      "[verify-settings-hub-css] FAIL: missing utilities in built CSS:",
      missing.map((m) => m.label).join(", "),
    );
    process.exit(1);
  }

  console.log(
    "[verify-settings-hub-css] OK — modules content scanned; md:flex-col + md:w-56 present in",
    cssDir,
  );
}

main();
