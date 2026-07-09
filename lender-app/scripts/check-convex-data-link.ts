/**
 * Verifies `.env.local` → `NEXT_PUBLIC_CONVEX_URL` points at a Convex
 * deployment that answers `lenders:stats` over HTTP (same project the
 * browser connects to for live WebSocket subscriptions).
 *
 * Requires `LIVE_SMOKE_ORGANIZATION_ID` and `LIVE_SMOKE_MEMBER_USER_KEY`
 * (Convex `organizations` id + userKey) for org-scoped `lenders:stats`.
 *
 * Usage: npm run data:link
 */
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";

import type { Id } from "../convex/_generated/dataModel.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadNextPublicConvexUrlFromDotLocal(): string | undefined {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return undefined;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^NEXT_PUBLIC_CONVEX_URL\s*=\s*(.*)$/);
    if (!m) continue;
    let v = (m[1] ?? "").trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

async function main() {
  const raw = loadNextPublicConvexUrlFromDotLocal();
  const parsed = parseConvexPublicUrl(raw);
  if (!parsed.ok) {
    if (parsed.reason === "missing") {
      console.error(
        "data:link failed — NEXT_PUBLIC_CONVEX_URL missing or empty in .env.local.\n" +
          "Run `npx convex dev` once from lender-app, or copy .env.local.example.",
      );
    } else {
      console.error(
        `data:link failed — invalid URL: ${parsed.detail ?? ""}`,
      );
    }
    process.exit(1);
  }

  const orgId = process.env.LIVE_SMOKE_ORGANIZATION_ID as
    | Id<"organizations">
    | undefined;
  const memberKey = process.env.LIVE_SMOKE_MEMBER_USER_KEY ?? "";

  if (!orgId || !memberKey) {
    console.error(
      "data:link failed — set LIVE_SMOKE_ORGANIZATION_ID and LIVE_SMOKE_MEMBER_USER_KEY for org-scoped lenders.stats.",
    );
    process.exit(1);
  }

  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };

  const client = new ConvexHttpClient(parsed.href);
  let stats: { total?: number };
  try {
    stats = await client.query(api.lenders.stats, {
      organizationId: orgId,
      memberUserKey: memberKey,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      "data:link failed — could not run `lenders:stats` on this URL.\n" +
        "Usually: Convex is not running (local), wrong port, or URL is a different deployment than `npx convex dev` pushes to.\n" +
        `URL: ${parsed.href}\n` +
        `Error: ${msg}`,
    );
    process.exit(1);
  }

  const total = stats.total ?? 0;
  console.log(
    `data:link OK — ${parsed.kind} backend ${parsed.href} | lenders.total=${total}`,
  );
  if (total === 0) {
    console.log("Hint: lenders table is empty. Run `npm run seed` (CSV at repo root).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
