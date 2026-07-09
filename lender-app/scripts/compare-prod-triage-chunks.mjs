/** Compare triage patterns in pipeline chunks across deployments. */
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Usage: node scripts/compare-prod-triage-chunks.mjs <url> [url2...]");
  process.exit(2);
}

async function scan(url, label) {
  const html = await (await fetch(`${url}/pipeline`)).text();
  const all = [...html.matchAll(/\/_next\/static\/[^"']+/g)].map((m) => m[0]);
  const unique = [...new Set(all)];
  console.log(`\n=== ${label} (${url}) ===`);
  console.log("chunks in /pipeline HTML:", unique.length);

  const needles = [
    "byFileId",
    "byProjectId",
    "byClientId",
    "resolveTriageHighlight",
    "safeHighlightLookup",
    "TRIAGE_MAP_SHAPE",
  ];

  for (const p of unique) {
    const full = `${url}${p.split("?")[0]}`;
    let js = "";
    try {
      js = await (await fetch(full)).text();
    } catch {
      continue;
    }
    const found = needles.filter((n) => js.includes(n));
    if (found.length) {
      console.log("CHUNK", p);
      for (const n of found) console.log("  ", n);
    }
  }
}

for (const url of targets) {
  await scan(url, url.includes("76u2") ? "OLD" : url.includes("dlcfunds") ? "NEW" : url);
}
