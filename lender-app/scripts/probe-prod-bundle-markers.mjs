/** Scan production Next.js chunks for vault governance UI markers. */
const baseUrl = process.argv[2]?.trim() || "https://dlcfunds.vercel.app";
const markers = [
  "folder-delete-confirm-modal",
  "vault-sort:folder",
  "document-vault-folder-insert-line",
  "reorderSiblingFolders",
  "Folder order updated",
];

async function main() {
  const res = await fetch(baseUrl);
  const html = await res.text();
  const chunkUrls = [
    ...html.matchAll(/\/_next\/static\/chunks\/[^"'\s>]+\.js/g),
  ].map((m) => m[0]);
  const unique = [...new Set(chunkUrls)];
  console.log("URL", baseUrl);
  console.log("CHUNKS", unique.length);

  const hits = Object.fromEntries(markers.map((m) => [m, []]));
  for (const path of unique.slice(0, 120)) {
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    try {
      const js = await fetch(url).then((r) => r.text());
      for (const marker of markers) {
        if (js.includes(marker)) hits[marker].push(path);
      }
    } catch {
      /* skip */
    }
  }

  for (const [marker, paths] of Object.entries(hits)) {
    console.log(marker, paths.length ? paths.slice(0, 3).join(", ") : "NOT FOUND");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
