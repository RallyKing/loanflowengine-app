/**
 * Publish entries from lib/product-knowledge/sessionReleasePosts.json
 * to production via productKnowledge:operatorPublishReleasePost.
 *
 * Usage (from lender-app/):
 *   npx tsx scripts/publish-session-release-posts.mts
 *
 * Loads DATA_MIGRATION_ADMIN_SECRET from .env.local and
 * NEXT_PUBLIC_CONVEX_URL from .env.convex.prod (or env).
 *
 * Policy: every user-facing ship (including small fixes) must have an entry.
 * Stable `slug` keeps re-runs idempotent — safe to re-publish the whole file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

type Post = {
  slug: string;
  title: string;
  summary: string;
  body: string[];
  changeType: string;
  deploymentId?: string;
  publishedAt?: number;
};

/** Same floor as lib/product-knowledge/formatPublishedAt.ts (2020-01-01 UTC). */
const MIN_VALID_PUBLISHED_AT_MS = 1_577_836_800_000;

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

function resolvePublishedAt(
  post: Post,
  index: number,
  total: number,
  now: number,
): number {
  const raw = post.publishedAt;
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    raw >= MIN_VALID_PUBLISHED_AT_MS
  ) {
    return raw;
  }
  // Stagger missing / zero stamps so feed order matches JSON order (oldest → newest).
  const stepsFromEnd = total - 1 - index;
  return now - stepsFromEnd * 60_000;
}

const localEnv = loadEnvFile(resolve(process.cwd(), ".env.local"));
const prodEnv = loadEnvFile(resolve(process.cwd(), ".env.convex.prod"));
const secret =
  process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
  localEnv.DATA_MIGRATION_ADMIN_SECRET;
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  prodEnv.NEXT_PUBLIC_CONVEX_URL ||
  localEnv.NEXT_PUBLIC_CONVEX_URL;

if (!secret) {
  throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");
}
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL missing");
}

const postsPath = resolve(
  process.cwd(),
  "lib/product-knowledge/sessionReleasePosts.json",
);
const posts = JSON.parse(readFileSync(postsPath, "utf8")) as Post[];
const client = new ConvexHttpClient(convexUrl);
const publish = anyApi.productKnowledge.operatorPublishReleasePost;
const now = Date.now();

for (let i = 0; i < posts.length; i++) {
  const post = posts[i]!;
  const publishedAt = resolvePublishedAt(post, i, posts.length, now);
  const hadInvalid =
    post.publishedAt == null ||
    !Number.isFinite(post.publishedAt) ||
    post.publishedAt < MIN_VALID_PUBLISHED_AT_MS;
  console.log(
    `Publishing ${post.slug}…${hadInvalid ? ` (assigned publishedAt=${publishedAt})` : ""}`,
  );
  const id = await client.mutation(publish, {
    operatorSecret: secret,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    body: post.body,
    changeType: post.changeType,
    affectedPersonas: ["All users"],
    affectedArticleSlugs: [],
    ...(post.deploymentId?.trim()
      ? { deploymentId: post.deploymentId.trim() }
      : {}),
    publishedAt,
  });
  console.log(`  ok → ${String(id)}`);
}

console.log(`Published ${posts.length} release post(s).`);
