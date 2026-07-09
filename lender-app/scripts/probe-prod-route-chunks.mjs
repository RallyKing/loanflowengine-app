/** Scan production chunks referenced by a route HTML for vault governance markers. */
const route = process.argv[2]?.trim() || "/login";
const baseUrl = process.argv[3]?.trim() || "https://dlcfunds.vercel.app";
const markers = [
  "folder-delete-confirm-modal",
  "vault-sort:folder",
  "document-vault-folder-insert-line",
  "Folder order updated",
];

async function main() {
  const res = await fetch(`${baseUrl}${route}`, { redirect: "follow" });
  const html = await res.text();
  const chunkUrls = [
    ...html.matchAll(/\/_next\/static\/chunks\/[^"'\s>]+\.js/g),
  ].map((m) => m[0]);
  const unique = [...new Set(chunkUrls)];
  console.log("ROUTE", route);
  console.log("STATUS", res.status);
  console.log("CHUNKS", unique.length);

  const hits = Object.fromEntries(markers.map((m) => [m, []]));
  for (const path of unique) {
    const url = `${baseUrl}${path}`;
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
    console.log(marker, paths.length ? paths.join(", ") : "NOT FOUND");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
