/**
 * Publish one Product Updates post: lender delivery package vault tree.
 * Usage (from lender-app/): npx tsx scripts/publish-lender-package-tree-post.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

const localEnv = loadEnvFile(resolve(process.cwd(), ".env.local"));
const prodEnv = loadEnvFile(resolve(process.cwd(), ".env.convex.prod"));
const secret =
  process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
  localEnv.DATA_MIGRATION_ADMIN_SECRET;
const convexUrl =
  process.env.CONVEX_URL?.trim() ||
  prodEnv.CONVEX_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  prodEnv.NEXT_PUBLIC_CONVEX_URL ||
  localEnv.NEXT_PUBLIC_CONVEX_URL;

if (!secret) {
  console.error("Missing DATA_MIGRATION_ADMIN_SECRET (.env.local or env)");
  process.exit(1);
}
if (!convexUrl) {
  console.error("Missing CONVEX_URL / NEXT_PUBLIC_CONVEX_URL (.env.convex.prod or .env.local)");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const publish = anyApi.productKnowledge.operatorPublishReleasePost;

const slug = "2026-08-05-lender-delivery-package-vault-tree";
const id = await client.mutation(publish, {
  operatorSecret: secret,
  slug,
  title: "Lender delivery: documents keep vault folders",
  summary:
    "Lenders opening a delivery package link now see File Task and Document Vault folder structure—not a flat file list.",
  body: [
    "Lender delivery packages now mirror the Document Vault tree on the shared package link. Recipients browse by File Task and folder organization the same way your team does in the vault, instead of scrolling a single flat list of files.",
    "Preview, download, and ZIP download still work as before. The package remains read-only for lenders; only navigation and presentation changed to preserve folder context.",
    "Existing delivery tokens pick up organization from live vault paths, so older package links show the current folder structure without regenerating the share.",
  ],
  changeType: "improved",
  deploymentId: "dpl_EwFkXyGDo6KsrRjLGABJtBqMxLHd",
});

console.log(JSON.stringify({ ok: true, published: true, slug, id }, null, 2));