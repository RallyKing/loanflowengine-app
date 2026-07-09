/**
 * @param {string[]} argv
 * Usage: node scripts/invokeConvexRun.cjs <path-to-args.json> <functionRef> [--prod]
 */
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const [, , argPath, fnRef, prodFlag] = process.argv;
if (!argPath || !fnRef) {
  console.error(
    "Usage: node scripts/invokeConvexRun.cjs <args.json> <functionRef> [--prod]",
  );
  process.exit(1);
}
const root = resolve(__dirname, "..");
const payload = readFileSync(resolve(argPath), "utf8").replace(/^\uFEFF/, "");
JSON.parse(payload);
const convexCli = resolve(root, "node_modules", "convex", "bin", "main.js");
const runArgs = ["run", fnRef];
if (prodFlag === "--prod") runArgs.push("--prod");
runArgs.push(payload);
const r = spawnSync(process.execPath, [convexCli, ...runArgs], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
  cwd: root,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
