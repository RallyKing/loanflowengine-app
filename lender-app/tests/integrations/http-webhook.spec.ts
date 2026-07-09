import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convexHttpActionsBaseUrl,
  parseConvexPublicUrl,
} from "../../lib/convexPublicUrl";

function convexUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(/NEXT_PUBLIC_CONVEX_URL\s*=\s*(\S+)/);
  return m ? m[1]!.replace(/^["']|["']$/g, "").trim() : undefined;
}

test.describe("Convex HTTP integration surface", () => {
  test("webhook endpoint rejects empty body", async ({ request }) => {
    const raw = convexUrl();
    const parsed = parseConvexPublicUrl(raw);
    test.skip(!parsed.ok, "NEXT_PUBLIC_CONVEX_URL not set");
    if (!parsed.ok) return;
    test.skip(parsed.kind === "local", "Hosted Convex .convex.site only");
    if (parsed.kind === "local") return;
    const base = convexHttpActionsBaseUrl(parsed.href);
    const badWebhook = await request.post(
      `${base}/api/v1/integrations/webhook`,
      {
        headers: { "Content-Type": "application/json" },
        data: "{}",
      },
    );
    expect(badWebhook.status()).toBe(400);
  });
});
