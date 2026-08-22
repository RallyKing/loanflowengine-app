/**
 * Windows/OneDrive-safe Next build wrapper.
 * Recovers missing `.next/server/pages-manifest.json` during Collecting page data
 * when the pages output already exists but the manifest write is delayed/raced.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dist =
  process.env.DLC_NEXT_DIST_DIR === "1"
    ? ".next-local"
    : process.env.DLC_NEXT_DIST_DIR?.trim() || ".next";
const serverDir = path.join(dist, "server");
const pagesDir = path.join(serverDir, "pages");
const target = path.join(serverDir, "pages-manifest.json");

const MANIFEST = JSON.stringify({
  "/_app": "pages/_app.js",
  "/_error": "pages/_error.js",
  "/_document": "pages/_document.js",
});

let writes = 0;
const timer = setInterval(() => {
  try {
    if (!fs.existsSync(serverDir)) return;
    if (fs.existsSync(target)) return;
    if (!fs.existsSync(path.join(pagesDir, "_document.js"))) return;
    fs.writeFileSync(target, MANIFEST);
    writes += 1;
    console.log(
      "[next-build-manifest-guard] recovered missing pages-manifest.json",
    );
  } catch {
    // ignore transient FS races
  }
}, 15);

const env = {
  ...process.env,
  NEXT_PRIVATE_WORKER_THREADS: "false",
};

const child = spawn("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => {
  clearInterval(timer);
  if (writes > 0) {
    console.log(`[next-build-manifest-guard] recovery writes=${writes}`);
  }
  process.exit(code ?? 1);
});
