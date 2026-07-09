import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl.js";

async function main() {
  const raw = "https://basic-anaconda-984.convex.cloud";
  const p = parseConvexPublicUrl(raw);
  if (!p.ok) process.exit(1);
  const c = new ConvexHttpClient(p.href);
  try {
    const r = await c.query(api.organizations.list, {});
    console.log("organizations.list OK", r);
  } catch (e) {
    console.error("organizations.list FAIL", e);
    process.exit(1);
  }
}

void main();
