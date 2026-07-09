/**
 * Scan production JS bundles for unsafe triage map lookups.
 */
const baseUrl = process.argv[2]?.trim() || "https://dlcfunds.vercel.app";

async function main() {
  const res = await fetch(`${baseUrl}/pipeline`);
  const html = await res.text();
  const chunks = [
    ...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g),
  ].map((m) => m[0]);

  console.log("=== PROD BUNDLE SCAN ===");
  console.log("URL", baseUrl);
  console.log("CHUNKS", chunks.length);

  const patterns = [
    { name: "byFileId[", re: /\.byFileId\[/g },
    { name: "byProjectId[", re: /\.byProjectId\[/g },
    { name: "resolveTriageHighlight", re: /resolveTriageHighlight/g },
    { name: "safeHighlightLookup", re: /safeHighlightLookup/g },
    { name: "__DLC_BUILD_INFO__", re: /__DLC_BUILD_INFO__/g },
  ];

  for (const chunk of [...new Set(chunks)].slice(0, 40)) {
    const url = `${baseUrl}${chunk}`;
    let js;
    try {
      js = await (await fetch(url)).text();
    } catch (e) {
      continue;
    }
    for (const { name, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(js)) {
        const idx = js.search(re);
        const snippet = js.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, " ");
        console.log("\nMATCH", name, "in", chunk);
        console.log("SNIPPET", snippet);
      }
    }
  }

  const buildProbe = html.includes("__DLC_BUILD_INFO__");
  console.log("\nHTML_HAS_BUILD_INFO_SCRIPT", buildProbe);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
