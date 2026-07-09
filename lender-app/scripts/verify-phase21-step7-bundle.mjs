/** Verify production bundle contains Phase 21.7 triage UI strings */
const base = process.argv[2] || "https://dlcfunds.vercel.app";
const markers = [
  "Rendering NEW Triage Composer",
  "file-task-triage-composer",
  "Mark urgent",
  "FileTasksBlock",
  "file-task-toggle-urgent",
];

const pageRes = await fetch(`${base}/pipeline`);
const html = await pageRes.text();
const chunkPaths = [
  ...new Set(
    [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]),
  ),
];

const hits = [];
for (const path of chunkPaths) {
  const url = `${base}${path}`;
  try {
    const js = await (await fetch(url)).text();
    const found = markers.filter((m) => js.includes(m));
    if (found.length) hits.push({ url, found });
  } catch {
    /* skip */
  }
}

// Also scan built .next output locally
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

const localHits = [];
try {
  const files = walk(".next/static/chunks");
  for (const file of files) {
    const js = readFileSync(file, "utf8");
    const found = markers.filter((m) => js.includes(m));
    if (found.length) localHits.push({ file, found });
  }
} catch {
  /* ignore */
}

console.log(
  JSON.stringify(
    {
      base,
      prodChunksScanned: chunkPaths.length,
      prodHits: hits,
      localBuildHits: localHits.slice(0, 5),
      localHitCount: localHits.length,
    },
    null,
    2,
  ),
);

process.exit(hits.length > 0 || localHits.length > 0 ? 0 : 1);
