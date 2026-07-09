/** Probe production build fingerprint without auth. */
const baseUrl = process.argv[2]?.trim() || "https://dlcfunds.vercel.app";

async function main() {
  const res = await fetch(baseUrl);
  const html = await res.text();
  const m = html.match(
    /window\.__DLC_BUILD_INFO__\s*=\s*(\{[^;]+\});/,
  );
  console.log("URL", baseUrl);
  console.log("STATUS", res.status);
  console.log(
    "BUILD_INFO",
    m ? JSON.stringify(JSON.parse(m[1]), null, 2) : "(missing)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
