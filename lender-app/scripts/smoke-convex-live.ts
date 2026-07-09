/**
 * Hits a few public Convex queries/mutations the app relies on, using the same
 * URL as the browser (`NEXT_PUBLIC_CONVEX_URL` from `.env.local`).
 *
 * Usage: npm run live:smoke
 *
 * Catches deployment skew (e.g. missing `tasks:countTaskFilesForTasks`) before you
 * open the UI. Requires Convex reachable (local `convex dev` or hosted URL).
 *
 * Org-scoped checks (`lenders:stats`, `tasks:countTaskFilesForTasks`, `tasks:byIds`) run
 * only when `LIVE_SMOKE_ORGANIZATION_ID` and `LIVE_SMOKE_MEMBER_USER_KEY` are set
 * (Convex `organizations` id + a userKey that is a member).
 */
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  convexHttpActionsBaseUrl,
  parseConvexPublicUrl,
} from "../lib/convexPublicUrl";

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
    console.error(
      parsed.reason === "missing"
        ? "live:smoke — missing .env.local or NEXT_PUBLIC_CONVEX_URL"
        : `live:smoke — invalid URL: ${parsed.detail ?? ""}`,
    );
    process.exit(1);
  }

  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };

  const client = new ConvexHttpClient(parsed.href);
  const smokeOrgId = process.env.LIVE_SMOKE_ORGANIZATION_ID as
    | Id<"organizations">
    | undefined;
  const smokeMemberKey = process.env.LIVE_SMOKE_MEMBER_USER_KEY ?? "";

  const checks: Array<{ name: string; run: () => Promise<unknown> }> = [
    ...(smokeOrgId && smokeMemberKey
      ? ([
          {
            name: "lenders:stats",
            run: () =>
              client.query(api.lenders.stats, {
                organizationId: smokeOrgId,
                memberUserKey: smokeMemberKey,
              }),
          },
          {
            name: "tasks:countTaskFilesForTasks",
            run: () =>
              client.query(api.tasks.countTaskFilesForTasks, {
                taskIds: [],
                organizationId: smokeOrgId,
                memberUserKey: smokeMemberKey,
              }),
          },
          {
            name: "tasks:byIds (empty)",
            run: () =>
              client.query(api.tasks.byIds, {
                ids: [],
                organizationId: smokeOrgId,
                memberUserKey: smokeMemberKey,
              }),
          },
        ] as const)
      : []),
    {
      name: "discovery:providerStatus",
      run: () => client.query(api.discovery.providerStatus, {}),
    },
    {
      name: "clientPortal:listScopesForEmail (smoke)",
      run: () =>
        client.query(api.clientPortal.listScopesForEmail, {
          email: "smoke-e2e@invalid.example",
        }),
    },
    {
      name: "integrationConnectors:getConnectorCatalog",
      run: () => client.query(api.integrationConnectors.getConnectorCatalog, {}),
    },
  ];

  for (const { name, run } of checks) {
    try {
      const out = await run();
      const preview =
        typeof out === "object" && out !== null
          ? JSON.stringify(out).slice(0, 120)
          : String(out);
      console.log(`OK  ${name} → ${preview}${preview.length >= 120 ? "…" : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL ${name}\n  ${msg}`);
      if (
        /127\.0\.0\.1|localhost/i.test(parsed.href) &&
        /Could not find public function/i.test(msg)
      ) {
        console.error(
          "\nHint: For a local Convex URL, `./convex` is pushed by the `convex dev` process.\n" +
            "Run `npm run dev` from lender-app (Next + convex dev), or restart `convex dev` after backend changes.\n" +
            "`npx convex codegen` alone may update a different deployment than NEXT_PUBLIC_CONVEX_URL."
        );
      }
      process.exit(1);
    }
  }

  const httpBase = convexHttpActionsBaseUrl(parsed.href);
  if (parsed.kind === "local") {
    console.warn(
      "SKIP http:integration_options — local dev URL does not expose httpRouter; OPTIONS/API checks run against hosted .convex.site (see Convex HTTP Actions docs).",
    );
  } else {
    try {
      const preUrl = `${httpBase}/api/v1/files`;
      const pre = await fetch(preUrl, { method: "OPTIONS" });
      if (pre.status !== 204) {
        console.error(
          `FAIL http:integration_options → ${preUrl} status ${pre.status}`,
        );
        process.exit(1);
      }
      const allow =
        pre.headers.get("access-control-allow-origin") ||
        pre.headers.get("Access-Control-Allow-Origin");
      if (!allow) {
        console.error(
          "FAIL http:integration_options → missing Access-Control-Allow-Origin",
        );
        process.exit(1);
      }
      console.log(`OK  http:integration OPTIONS ${preUrl} → 204`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL http:integration_options\n  ${msg}`);
      process.exit(1);
    }
  }

  console.log(`live:smoke OK — ${parsed.kind} ${parsed.href}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
