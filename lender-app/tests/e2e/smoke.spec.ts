import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import {
  expectPipelineHubVisible,
  expectWorkspaceRouteVisible,
  isWorkspaceDegraded,
  recoverWorkspaceErrorBoundary,
  waitPipelineHubReady,
} from "../helpers/mobile/pipelineHubReady";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convexHttpActionsBaseUrl,
  parseConvexPublicUrl,
} from "../../lib/convexPublicUrl";

/** Flush layout after paint (Convex websockets keep `networkidle` from ever settling). */
async function afterLayoutSettle(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          }),
      );
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("Execution context was destroyed") ||
        msg.includes("Target closed")
      ) {
        await page.waitForLoadState("domcontentloaded");
        continue;
      }
      throw e;
    }
  }
}

async function safeGoto(
  page: Page,
  path: string,
  options?: {
    waitUntil?: "load" | "commit" | "domcontentloaded" | "networkidle";
    timeoutMs?: number;
  },
): Promise<void> {
  const waitUntil = options?.waitUntil ?? "domcontentloaded";
  const timeout = options?.timeoutMs ?? 45_000;
  try {
    await page.goto(path, { waitUntil, timeout });
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/net::ERR_ABORTED|frame was detached|Navigation failed/i.test(msg)) {
      throw e;
    }
  }
  // Retry once — Next route transitions can detach the frame.
  await page.waitForTimeout(350);
  await page.goto(path, { waitUntil, timeout });
}

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;
const describeSignedInOrSkip = convexConfigured() ? test.describe : test.describe.skip;

/** Routes that do not require a workspace session. */
describeOrSkip("app smoke — public (Convex URL)", () => {
  test("Convex HTTP integration: OPTIONS preflight + webhook validation", async ({
    request,
  }) => {
    const raw =
      process.env.NEXT_PUBLIC_CONVEX_URL ??
      (() => {
        const p = join(process.cwd(), ".env.local");
        if (!existsSync(p)) return undefined;
        const m = readFileSync(p, "utf8").match(
          /NEXT_PUBLIC_CONVEX_URL\s*=\s*(\S+)/,
        );
        return m
          ? m[1]!.replace(/^["']|["']$/g, "").trim()
          : undefined;
      })();
    const parsed = parseConvexPublicUrl(raw);
    test.skip(!parsed.ok, "NEXT_PUBLIC_CONVEX_URL not set");
    if (!parsed.ok) return;
    test.skip(parsed.kind === "local", "httpRouter on hosted .convex.site only");
    if (parsed.kind === "local") return;

    const base = convexHttpActionsBaseUrl(parsed.href);
    const opt = await request.fetch(`${base}/api/v1/files`, {
      method: "OPTIONS",
    });
    expect(opt.status()).toBe(204);

    const badWebhook = await request.post(
      `${base}/api/v1/integrations/webhook`,
      {
        headers: { "Content-Type": "application/json" },
        data: "{}",
      },
    );
    expect(badWebhook.status()).toBe(400);
  });

  test("unknown workspace path redirects to sign-in when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/this-route-does-not-exist-12345", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/(login|sign-in)/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /loan flow engine/i }),
    ).toBeVisible();
  });

  test("invalid share token shows a clear error (edge case)", async ({
    page,
  }) => {
    await page.goto("/share/audit-e2e-invalid-token-not-real", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("body")).toContainText(
      /share link is invalid|intake no longer exists|Unable to reach the server for this share link/i,
      { timeout: 30_000 },
    );
  });

  test("client portal routes render (login + files)", async ({ page }) => {
    await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Sign in$/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("banner").getByText(/Client portal/i),
    ).toBeVisible();

    await page.goto("/portal/files", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/portal\/login\/?$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Sign in$/ })).toBeVisible();
  });

  test("workspace app routes redirect to sign-in without session", async ({
    page,
  }) => {
    for (const path of ["/ledger", "/settings", "/print/ledger"] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/(login|sign-in)/, { timeout: 30_000 });
    }
  });

  test("no horizontal overflow at 320px on public auth + portal shells", async ({
    page,
  }) => {
    const paths = ["/sign-in", "/sign-up", "/portal/login"] as const;
    for (const path of paths) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await afterLayoutSettle(page);
      const extra = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        extra,
        `unexpected horizontal overflow on ${path} at 320px (+${extra}px)`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

/** Workspace routes protected by cookie session (`/api/auth/login`). */
describeSignedInOrSkip("app smoke — signed-in workspace", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED=true + E2E_PASS_* (sandbox), or APP_AUTH_USERNAME + APP_AUTH_PASSWORD; escape hatch: PLAYWRIGHT_USE_PRIMARY_AUTH=1",
    );
    await signInWorkspaceSession(page);
  });

  test("unknown route shows not-found when signed in", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-12345", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("print ledger renders when signed in", async ({ page }) => {
    await page.goto("/print/ledger", { waitUntil: "load" });
    await recoverWorkspaceErrorBoundary(page);
    await expect
      .poll(
        async () => {
          if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
            return "degraded";
          }
          if (
            await page
              .getByText("Funding ledger", { exact: true })
              .isVisible()
              .catch(() => false)
          ) {
            return "ready";
          }
          return "";
        },
        { timeout: 30_000 },
      )
      .toMatch(/degraded|ready/);
  });

  test("home redirects to pipeline", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect
      .poll(
        async () => {
          const path = new URL(page.url()).pathname;
          if (path === "/pipeline" || path === "/pipeline/") return "pipeline";
          if (
            await page
              .getByRole("heading", { name: /Pipeline/i })
              .isVisible()
              .catch(() => false)
          ) {
            return "pipeline";
          }
          return path;
        },
        { timeout: 30_000 },
      )
      .toBe("pipeline");
    await expectWorkspaceRouteVisible(page, {
      heading: /Pipeline/i,
      allowDegraded: true,
    });
    await expect(page.locator("main")).toBeVisible();
  });

  test("scenario search lives in Lenders workspace", async ({ page }) => {
    await safeGoto(page, "/lenders?tab=scenario", { waitUntil: "load" });
    await expectWorkspaceRouteVisible(page, {
      heading: /^Lenders$/i,
      toolbarLabel: "Lenders workspace toolbar",
      allowDegraded: true,
    });
    await recoverWorkspaceErrorBoundary(page);
    if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
      await expect(page.locator("main")).toBeVisible();
      return;
    }
    await expect(
      page.getByRole("button", { name: "Scenario search" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main")).toBeVisible();
  });

  test("legacy lender URLs redirect into workspace", async ({ page }) => {
    await safeGoto(page, "/browse");
    await expect(page).toHaveURL(/\/lenders\/?$/, { timeout: 30_000 });
    await expectWorkspaceRouteVisible(page, {
      heading: /^Lenders$/i,
      toolbarLabel: "Lenders workspace toolbar",
      allowDegraded: true,
    });

    await safeGoto(page, "/add", { timeoutMs: 60_000 });
    await expect(page).toHaveURL(/\/lenders\?tab=add/, { timeout: 30_000 });

    await safeGoto(page, "/scenario", { timeoutMs: 60_000 });
    await expect(page).toHaveURL(/\/lenders\?tab=scenario/, { timeout: 30_000 });
  });

  test("pipeline table exposes expected column headers", async ({ page }) => {
    await safeGoto(page, "/pipeline");
    await expectPipelineHubVisible(page, { allowDegraded: true });
    if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
      await expect(page.locator("main")).toBeVisible();
      return;
    }
    await waitPipelineHubReady(page);
    const fileNameHeader = page.getByRole("columnheader", { name: "File name" });
    if (await fileNameHeader.isVisible().catch(() => false)) {
      await expect(fileNameHeader).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Subject address" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Funding type" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Purchase / refi" }),
      ).toBeVisible();
      return;
    }
    await expect(
      page
        .getByTestId("pipeline-hub-hierarchy-shell")
        .or(page.getByTestId("pipeline-hub-hierarchy"))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("core protected nav routes render", async ({ page }) => {
    for (const { path, heading } of [
      { path: "/lenders", heading: /^Lenders$/i },
      { path: "/pipeline", heading: /Pipeline/i },
      { path: "/tasks", heading: /Task/i },
      { path: "/contacts", heading: /^Contacts$/i },
    ] as const) {
      await safeGoto(page, path, { timeoutMs: 60_000 });
      if (path === "/pipeline") {
        await expectPipelineHubVisible(page, { allowDegraded: true });
      } else if (path === "/lenders") {
        await expectWorkspaceRouteVisible(page, {
          heading,
          toolbarLabel: "Lenders workspace toolbar",
          allowDegraded: true,
        });
      } else {
        await expectWorkspaceRouteVisible(page, { heading, allowDegraded: true });
      }
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("secondary routes (lenders, intake) render", async ({ page }) => {
    for (const { path, heading } of [
      { path: "/lenders?tab=add", heading: /^Lenders$/i },
      { path: "/lenders?tab=discover", heading: /^Lenders$/i },
      { path: "/lenders?tab=upload", heading: /^Lenders$/i },
      { path: "/pipeline", heading: /^Pipeline$/i },
      {
        path: "/pipeline/licenses",
        heading: /State Real Estate Lending Licenses/i,
      },
    ] as const) {
      await safeGoto(page, path, { timeoutMs: 60_000 });
      if (path.startsWith("/lenders")) {
        await expectWorkspaceRouteVisible(page, {
          heading,
          toolbarLabel: "Lenders workspace toolbar",
          allowDegraded: true,
        });
      } else if (path === "/pipeline") {
        await expectPipelineHubVisible(page, { allowDegraded: true });
      } else {
        await expectWorkspaceRouteVisible(page, { heading, allowDegraded: true });
      }
    }
  });

  test("no horizontal page overflow at 320px on heavy layouts", async ({
    page,
  }) => {
    const paths = [
      "/",
      "/lenders?tab=scenario",
      "/lenders",
      "/pipeline",
      "/tasks",
      "/contacts",
      "/lenders?tab=add",
      "/lenders?tab=discover",
      "/lenders?tab=upload",
    ] as const;
    for (const path of paths) {
      await page.setViewportSize({ width: 320, height: 800 });
      await safeGoto(page, path, { timeoutMs: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await afterLayoutSettle(page);
      const extra = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        extra,
        `unexpected horizontal overflow on ${path} at 320px (+${extra}px)`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("SaaS shell: mobile menu control exists after switching scheme", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("app-masterpage-chrome")
      .getByLabel("Color scheme", { exact: true })
      .selectOption("saas", { force: true });
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "saas",
      {
        timeout: 10_000,
      },
    );
    await expect(
      page.getByRole("button", { name: /Toggle primary navigation/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("no horizontal overflow at 768px tablet on browse and pipeline", async ({
    page,
  }) => {
    for (const path of ["/lenders", "/pipeline"] as const) {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await afterLayoutSettle(page);
      const extra = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        extra,
        `unexpected horizontal overflow on ${path} at 768px (+${extra}px)`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
